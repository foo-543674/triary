// Behaviour of the ./dev entrypoint, run against fake container engines.
// The fakes record their arguments, so these tests check how ./dev drives an
// engine, not that a real image works (CI's dev-image workflow does that).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const dev = join(repoRoot, "dev");

// Only the tools ./dev itself needs, so a docker or cargo installed on the
// machine running the tests can never leak in.
const SYSTEM_TOOLS = ["bash", "dirname", "sha256sum", "id", "cat"] as const;

type Engine = "docker" | "podman";

interface FakeOptions {
  readonly engines: readonly Engine[];
  readonly imagePresent?: boolean;
  readonly pullSucceeds?: boolean;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly calls: readonly string[][];
}

const which = (tool: string): string => {
  const found = spawnSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
  assert.ok(found !== "", `test prerequisite missing: ${tool}`);
  return found;
};

const fakeBin = ({ engines, imagePresent = true, pullSucceeds = true }: FakeOptions): { bin: string; log: string } => {
  const dir = mkdtempSync(join(tmpdir(), "dev-entrypoint-"));
  const bin = join(dir, "bin");
  const log = join(dir, "calls.log");
  mkdirSync(bin);
  SYSTEM_TOOLS.forEach((tool) => symlinkSync(which(tool), join(bin, tool)));
  // Each call is logged as NUL-separated arguments followed by a record
  // separator; arguments may contain newlines (the bash -c script does).
  const script = (name: Engine) => `#!${which("bash")}
{ printf '%s\\0' ${name} "$@"; printf '\\036\\0'; } >> ${JSON.stringify(log)}
case "$1 $2" in
  "image inspect") exit ${imagePresent ? 0 : 1} ;;
  "network inspect") exit 1 ;;
esac
[ "$1" = pull ] && exit ${pullSucceeds ? 0 : 1}
exit 0
`;
  engines.forEach((name) => {
    writeFileSync(join(bin, name), script(name));
    chmodSync(join(bin, name), 0o755);
  });
  return { bin, log };
};

const runDev = (
  args: readonly string[],
  { cwd = repoRoot, env = {}, fake = { engines: [] } }: { cwd?: string; env?: Record<string, string>; fake?: FakeOptions } = {},
): Run => {
  const { bin, log } = fakeBin(fake);
  const result = spawnSync(join(bin, "bash"), [dev, ...args], {
    cwd,
    encoding: "utf8",
    env: { PATH: bin, ...env },
  });
  const calls = existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\x1e\0")
        .filter((record) => record !== "")
        .map((record) => record.split("\0").filter((word) => word !== ""))
    : [];
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
};

const runCall = (run: Run): readonly string[] => {
  const call = run.calls.find((words) => words[1] === "run");
  assert.ok(call, `no "run" call; calls: ${JSON.stringify(run.calls)}; stderr: ${run.stderr}`);
  return call;
};

const expectedRef = (): string => {
  const sum = createHash("sha256").update(readFileSync(join(repoRoot, "tools/dev-image/Dockerfile"))).digest("hex");
  return `ghcr.io/foo-543674/triary-dev:df-${sum.slice(0, 12)}`;
};

describe("./dev entrypoint", () => {
  it("derives the image tag from the Dockerfile content", () => {
    const run = runDev(["--image-ref"]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), expectedRef());
  });

  it("uses TRIARY_DEV_IMAGE_REF when it is set", () => {
    const run = runDev(["--image-ref"], { env: { TRIARY_DEV_IMAGE_REF: "local/triary-dev:ci" } });
    assert.equal(run.stdout.trim(), "local/triary-dev:ci");
  });

  it("fails without running anything when no engine is installed", () => {
    const run = runDev(["cargo", "--version"]);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /neither podman nor docker/);
    assert.deepEqual(run.calls, []);
  });

  it("fails when called with no command", () => {
    const run = runDev([], { fake: { engines: ["docker"] } });
    assert.notEqual(run.status, 0);
    assert.deepEqual(run.calls, []);
  });

  it("refuses to run from outside the repository", () => {
    const run = runDev(["cargo", "--version"], { cwd: tmpdir(), fake: { engines: ["docker"] } });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /inside the repository/);
    assert.deepEqual(run.calls, []);
  });

  it("runs the command directly inside the dev image", () => {
    const run = runDev(["cat", join(repoRoot, "dev")], { env: { TRIARY_DEV_IMAGE: "1" }, fake: { engines: ["docker"] } });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /dev: run a project command/);
    assert.deepEqual(run.calls, []);
  });

  it("runs the command directly in a devcontainer marked TRIARY_DEV_DIRECT", () => {
    const run = runDev(["cat", join(repoRoot, "dev")], { env: { TRIARY_DEV_DIRECT: "1" }, fake: { engines: ["docker"] } });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.calls, []);
  });

  it("prefers podman and does not pass --user to it", () => {
    const run = runDev(["cargo", "test"], { cwd: join(repoRoot, "backend"), fake: { engines: ["docker", "podman"] } });
    assert.equal(run.status, 0, run.stderr);
    const call = runCall(run);
    assert.equal(call[0], "podman");
    assert.ok(!call.includes("--user"));
    const image = call.indexOf(expectedRef());
    assert.ok(image > 0, `image ref missing: ${JSON.stringify(call)}`);
    assert.deepEqual(call.slice(image + 1, image + 3), ["bash", "-c"]);
    assert.deepEqual(call.slice(-3), ["dev", "cargo", "test"]);
  });

  it("mounts the repository at the same path and keeps the working directory", () => {
    const cwd = join(repoRoot, "frontend");
    const call = runCall(runDev(["pnpm", "run", "lint:ci"], { cwd, fake: { engines: ["podman"] } }));
    assert.equal(call[call.indexOf("--volume") + 1], `${repoRoot}:${repoRoot}`);
    assert.equal(call[call.indexOf("--workdir") + 1], cwd);
  });

  it("runs docker as the calling user so written files stay theirs", () => {
    const call = runCall(runDev(["cargo", "fmt"], { fake: { engines: ["docker"] } }));
    assert.equal(call[0], "docker");
    const uid = spawnSync("id", ["-u"], { encoding: "utf8" }).stdout.trim();
    const gid = spawnSync("id", ["-g"], { encoding: "utf8" }).stdout.trim();
    assert.equal(call[call.indexOf("--user") + 1], `${uid}:${gid}`);
  });

  it("pulls the image when it is missing", () => {
    const run = runDev(["cargo", "fmt"], { fake: { engines: ["podman"], imagePresent: false } });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.calls.some((words) => words[1] === "pull" && words.includes(expectedRef())));
    runCall(run);
  });

  it("fails without running when the image cannot be pulled", () => {
    const run = runDev(["cargo", "fmt"], { fake: { engines: ["podman"], imagePresent: false, pullSucceeds: false } });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /cannot pull/);
    assert.ok(!run.calls.some((words) => words[1] === "run"));
  });

  it("passes only the listed environment variables", () => {
    const call = runCall(
      runDev(["cargo", "test"], {
        env: { DATABASE_URL: "mysql://x", GH_TOKEN: "secret" },
        fake: { engines: ["podman"] },
      }),
    );
    assert.ok(call.includes("DATABASE_URL"));
    assert.ok(!call.some((word) => word.includes("GH_TOKEN")));
  });

  it("reports how commands run", () => {
    assert.equal(runDev(["--engine"], { fake: { engines: ["docker"] } }).stdout.trim(), "docker");
    assert.equal(runDev(["--engine"], { fake: { engines: ["docker", "podman"] } }).stdout.trim(), "podman");
    assert.equal(
      runDev(["--engine"], { env: { TRIARY_DEV_DIRECT: "1" }, fake: { engines: ["docker"] } }).stdout.trim(),
      "direct",
    );
  });

  it("publishes the requested ports on the host's loopback and names the docker container", () => {
    const call = runCall(
      runDev(["pnpm", "run", "dev"], {
        env: { TRIARY_DEV_PUBLISH: "3000 3001", TRIARY_DEV_NAME: "triary-backend" },
        fake: { engines: ["docker"] },
      }),
    );
    const published = call.flatMap((word, i) => (word === "--publish" ? [call[i + 1]] : []));
    assert.deepEqual(published, ["127.0.0.1:3000:3000", "127.0.0.1:3001:3001"]);
    assert.equal(call[call.indexOf("--name") + 1], "triary-backend");
  });

  it("does not publish ports or name the container under podman (it shares the host network)", () => {
    const call = runCall(
      runDev(["pnpm", "run", "dev"], {
        env: { TRIARY_DEV_PUBLISH: "3000", TRIARY_DEV_NAME: "triary-backend" },
        fake: { engines: ["podman"] },
      }),
    );
    assert.ok(!call.includes("--publish"));
    assert.ok(!call.includes("--name"));
  });

  it("refuses a published port that is not a number", () => {
    const run = runDev(["pnpm", "run", "dev"], {
      env: { TRIARY_DEV_PUBLISH: "0.0.0.0:3000" },
      fake: { engines: ["docker"] },
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /not a port number/);
    assert.ok(!run.calls.some((words) => words[1] === "run"));
  });

  it("passes the backend origin to the dev server", () => {
    const call = runCall(
      runDev(["pnpm", "run", "dev"], { env: { BACKEND_ORIGIN: "http://triary-backend:8080" }, fake: { engines: ["docker"] } }),
    );
    assert.ok(call.includes("BACKEND_ORIGIN"));
  });

  it("stops inside the container when the repository is not visible there", () => {
    const call = runCall(runDev(["cargo", "test"], { fake: { engines: ["podman"] } }));
    const script = call[call.indexOf("-c") + 1] ?? "";
    const empty = mkdtempSync(join(tmpdir(), "dev-empty-mount-"));
    const guarded = spawnSync(which("bash"), ["-c", script, "dev", "true"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", TRIARY_DEV_ROOT: empty },
    });
    assert.equal(guarded.status, 125);
    assert.match(guarded.stderr, /not visible inside the container/);
    const visible = spawnSync(which("bash"), ["-c", script, "dev", "true"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", TRIARY_DEV_ROOT: repoRoot },
    });
    assert.equal(visible.status, 0, visible.stderr);
  });
});
