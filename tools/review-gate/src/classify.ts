// Entry point for .claude/hooks/review-gate.sh: reads a shell command on
// stdin and prints `scope bypass stagesAll unparseable` as one line, e.g.
// `commit false false false` (scope is `-` when there is no commit/push).
// Configured git aliases of the current repository are expanded.

import { execFileSync } from "node:child_process";
import { type Aliases, classifyCommand } from "./command.ts";

const readAliases = (): Aliases => {
  const output = (() => {
    try {
      return execFileSync("git", ["config", "--get-regexp", "^alias\\."], { encoding: "utf8" });
    } catch {
      return ""; // exit 1 = no aliases configured
    }
  })();
  return new Map(
    output
      .split("\n")
      .filter((line) => line.startsWith("alias."))
      .map((line): [string, string] => {
        const space = line.indexOf(" ");
        return [line.slice("alias.".length, space), line.slice(space + 1)];
      }),
  );
};

const chunks: Buffer[] = [];
process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
process.stdin.on("end", () => {
  const c = classifyCommand(Buffer.concat(chunks).toString("utf8"), readAliases());
  process.stdout.write(`${c.scope ?? "-"} ${c.bypass} ${c.stagesAll} ${c.unparseable}\n`);
});
