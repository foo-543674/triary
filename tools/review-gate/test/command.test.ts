import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyCommand, splitCommands } from "../src/command.ts";

const NO_VERIFY = ["--", "no-verify"].join("");

describe("splitCommands", () => {
  it("keeps separators inside quotes as part of a word", () => {
    assert.deepEqual(splitCommands(`git commit -m "a; b" -n`), {
      ok: true,
      value: [["git", "commit", "-m", "a; b", "-n"]],
    });
  });

  it("splits on ; && || | & and newlines outside quotes", () => {
    const result = splitCommands("a 1; b 2 && c || d | e & f\ng");
    assert.deepEqual(result.ok ? result.value.map((c) => c[0]) : [], ["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("joins backslash-newline continuations", () => {
    assert.deepEqual(splitCommands("git commit -m x \\\n  -n"), {
      ok: true,
      value: [["git", "commit", "-m", "x", "-n"]],
    });
  });

  it("treats $( ) and backticks as command boundaries", () => {
    const result = splitCommands("echo $(git push) `git commit`");
    assert.deepEqual(result.ok ? result.value : [], [["echo"], ["git", "push"], ["git", "commit"]]);
  });

  it("reports unbalanced quotes as a parse failure", () => {
    assert.equal(splitCommands(`git commit -m "oops`).ok, false);
  });
});

describe("classifyCommand: scope", () => {
  const scope = (command: string) => classifyCommand(command).scope;

  it("finds commit and push behind env assignments, launchers, paths and global options", () => {
    assert.equal(scope("FOO=1 git commit -m x"), "commit");
    assert.equal(scope("/usr/bin/git push"), "push");
    assert.equal(scope("command git --no-pager -C . -c a.b=c commit -m x"), "commit");
    assert.equal(scope("cargo test && git commit -m x"), "commit");
    assert.equal(scope("timeout 60 git push origin HEAD"), "push");
  });

  it("does not treat mentions as invocations", () => {
    assert.equal(scope(`echo "git commit"`), undefined);
    assert.equal(scope("git log --grep commit; grep -n x README.md"), undefined);
    assert.equal(scope("git add review-gate.sh && node cli.ts hash --scope commit"), undefined);
  });

  it("looks inside shell -c strings, eval and xargs", () => {
    assert.equal(scope(`bash -c "true; git commit -m x"`), "commit");
    assert.equal(scope("eval 'git push'"), "push");
    assert.equal(scope("xargs -I{} git commit -m {}"), "commit");
  });
});

describe("classifyCommand: bypass flags", () => {
  const bypass = (command: string) => classifyCommand(command).bypass;

  it("detects the skip flag even when the message contains separators", () => {
    assert.equal(bypass(`git commit -m "a; b" ${NO_VERIFY}`), true);
    assert.equal(bypass(`git commit -m 'a & b' -n`), true);
    assert.equal(bypass(`git commit -m "x|y" -n`), true);
    assert.equal(bypass(`git commit -m x \\\n ${NO_VERIFY}`), true);
  });

  it("detects abbreviations and short-flag clusters", () => {
    assert.equal(bypass("git commit --no-verif -m x"), true);
    assert.equal(bypass("git push --no-v origin HEAD"), true);
    assert.equal(bypass("git commit -nm x"), true);
    assert.equal(bypass("git commit -an"), true);
  });

  it("detects flags inside wrappers", () => {
    assert.equal(bypass(`bash -c "git commit ${NO_VERIFY} -m x"`), true);
    assert.equal(bypass(`bash -c "true; git commit -n -m x"`), true);
  });

  it("does not attribute another command's flags to git", () => {
    assert.equal(bypass("git commit -F msg.txt; git log --oneline -4; grep -n x f"), false);
    assert.equal(bypass("git log --oneline -n 3"), false);
  });

  it("does not inspect the value of -m / -F as flags", () => {
    assert.equal(bypass(`git commit -m "use -n carefully"`), false);
  });
});

describe("classifyCommand: git anywhere in a simple command", () => {
  const bypass = (command: string) => classifyCommand(command).bypass;

  it("sees through shell keywords and grouping", () => {
    assert.equal(bypass("{ git commit -n -m x; }"), true);
    assert.equal(bypass("if true; then git commit -n -m x; fi"), true);
    assert.equal(bypass("! git commit -n -m x"), true);
    assert.equal(bypass("for i in 1; do git commit -n -m x; done"), true);
    assert.equal(bypass("while false; do :; done; until true; do git push -n; done"), true);
  });

  it("sees through unknown launchers such as find -exec", () => {
    assert.equal(bypass("find . -maxdepth 0 -exec git commit -n -m x \\;"), true);
    assert.equal(classifyCommand("find . -exec git push \\;").scope, "push");
  });

  it("does not take a quoted mention for an invocation", () => {
    assert.equal(classifyCommand(`grep -n "git push -n" notes.md`).scope, undefined);
  });
});

describe("classifyCommand: aliases", () => {
  const aliases = new Map([
    ["c", "commit"],
    ["ship", "!git push"],
    ["lg", "log --oneline"],
  ]);

  it("expands configured aliases", () => {
    assert.equal(classifyCommand("git c -n -m x", aliases).bypass, true);
    assert.equal(classifyCommand("git c -m x", aliases).scope, "commit");
    assert.equal(classifyCommand("git ship", aliases).scope, "push");
    assert.equal(classifyCommand("git lg -n 3", aliases).bypass, false);
  });
});

describe("classifyCommand: shells reading stdin", () => {
  it("blocks git commit/push text fed to a shell on stdin", () => {
    assert.equal(classifyCommand("echo 'git commit -n -m x' | sh").bypass, true);
    assert.equal(classifyCommand("sh <<EOF\ngit push -n\nEOF").bypass, true);
  });

  it("does not flag a shell reading stdin when no commit/push is involved", () => {
    assert.equal(classifyCommand("echo 'ls -n' | sh").bypass, false);
  });
});

describe("classifyCommand: heredoc bodies are data", () => {
  it("does not parse a commit message heredoc as shell", () => {
    const command = "git commit -F - <<'EOF'\nfix: don't break git push docs -n\nEOF";
    const result = classifyCommand(command);
    assert.equal(result.unparseable, false);
    assert.equal(result.bypass, false);
    assert.equal(result.scope, "commit");
  });

  it("still sees flags after the heredoc operator", () => {
    assert.equal(classifyCommand("git commit -n -F - <<EOF\nmsg\nEOF").bypass, true);
  });
});

describe("classifyCommand: nothing is silently dropped before classifying", () => {
  const commitN = "git commit -n -m x";
  const bypass = (command: string) => classifyCommand(command).bypass;

  it("does not take a here-string for a heredoc", () => {
    assert.equal(bypass(`cat <<<hi\n${commitN}`), true);
    assert.equal(bypass(`cat <<<"hi"\n${commitN}`), true);
  });

  it("does not take << inside quotes for a heredoc", () => {
    assert.equal(bypass(`echo '<<X'\n${commitN}`), true);
    assert.equal(bypass(`echo "a <<EOF b"\n${commitN}`), true);
  });

  it("classifies a heredoc or here-string that feeds a shell as a script", () => {
    assert.equal(bypass("bash <<'EOF'\ngit commit -n -m x\nEOF"), true);
    assert.equal(bypass(`sh <<<"${commitN}"`), true);
  });

  it("classifies commands after the end of a heredoc", () => {
    assert.equal(bypass(`cat <<EOF\nhello\nEOF\n${commitN}`), true);
  });

  it("sees git inside process substitution", () => {
    assert.equal(bypass(`diff <(${commitN}) /dev/null`), true);
  });

  it("finds a flag right before a quote in text piped to a shell", () => {
    assert.equal(bypass("echo 'git commit -n' | sh"), true);
    assert.equal(bypass(`echo "git push --no-verify"|bash`), true);
  });
});

describe("classifyCommand: command substitution anywhere", () => {
  const bypass = (command: string) => classifyCommand(command).bypass;
  const NO_VERIFY = ["--", "no-verify"].join("");

  it("classifies $( ) and backticks inside double quotes", () => {
    assert.equal(bypass(`echo "$(git commit -n -m x)"`), true);
    assert.equal(bypass('x="`git commit -n -m x`"'), true);
    assert.equal(bypass(`echo "$(git commit -m x ${NO_VERIFY})"`), true);
  });

  it("handles nesting and parameter expansion defaults", () => {
    assert.equal(bypass(`echo "$(echo "$(git push -n)")"`), true);
    assert.equal(bypass(`echo "\${X:-$(git commit -n -m x)}"`), true);
    assert.equal(bypass(`echo $(( $(git commit -n -m x | wc -l) + 1 ))`), true);
  });

  it("classifies substitutions inside unquoted heredoc bodies", () => {
    assert.equal(bypass("cat <<EOF\n$(git commit -n -m x)\nEOF"), true);
  });

  it("sees git inside a function body", () => {
    assert.equal(bypass("f(){ git commit -n -m x; }; f"), true);
  });

  it("still reports scope for a substituted commit so the gate check runs", () => {
    assert.equal(classifyCommand(`echo "$(git commit -m x)"`).scope, "commit");
  });
});

describe("classifyCommand: command strings handed to any launcher", () => {
  const bypass = (command: string) => classifyCommand(command).bypass;

  it("classifies an argument that looks like a git command line, whatever the launcher", () => {
    assert.equal(bypass("su -c 'git commit -n -m x'"), true);
    assert.equal(bypass("env -S 'git commit -n -m x'"), true);
    assert.equal(bypass("watch 'git commit -n -m x'"), true);
    assert.equal(bypass("script -qc 'git commit -n -m x' /dev/null"), true);
  });

  it("reports only the bypass flag, not a scope, for such strings", () => {
    assert.equal(classifyCommand("watch 'git push'").scope, undefined);
    assert.equal(classifyCommand(`echo "git commit"`).bypass, false);
  });

  it("does not classify the arguments of a git invocation itself as command strings", () => {
    assert.equal(bypass(`git commit -m "docs: explain git push -n"`), false);
    assert.equal(bypass(`git log --grep "git commit -n"`), false);
  });

  it("treats backticks inside a double-quoted message as executed, as bash does", () => {
    assert.equal(bypass('git commit -m "use `git commit -n` carefully"'), true);
  });
});

describe("classifyCommand: unparseable fallback", () => {
  it("falls back to a conservative scan instead of blocking outright", () => {
    const result = classifyCommand(`git commit -m "it's" -n -m 'x`);
    assert.equal(result.bypass, true);
  });

  it("reports scope from the raw text when parsing fails", () => {
    assert.equal(classifyCommand(`git push origin "main`).scope, "push");
  });
});

describe("classifyCommand: commit -a", () => {
  it("detects staging at commit time", () => {
    assert.equal(classifyCommand("git commit -am x").stagesAll, true);
    assert.equal(classifyCommand("git commit --all -m x").stagesAll, true);
    assert.equal(classifyCommand("git commit -m x").stagesAll, false);
  });
});

describe("classifyCommand: unparseable", () => {
  it("still finds commit/push in unparseable text so the gate check runs", () => {
    const result = classifyCommand(`git commit -m "oops`);
    assert.equal(result.scope, "commit");
    assert.equal(result.bypass, false);
  });

  it("marks unparseable text that mentions git without commit/push (informational)", () => {
    assert.equal(classifyCommand(`git log --grep "it's`).unparseable, true);
    assert.equal(classifyCommand(`echo "oops`).unparseable, false);
  });
});
