// Shell command classification for the Claude Code PreToolUse hook
// (.claude/hooks/review-gate.sh). Pure functions only.
//
// Goal: decide whether a Bash command runs `git commit` / `git push`, and
// whether it passes a flag that skips the git hooks. The rules are chosen so
// that they do not depend on enumerating shell syntax:
//   1. Tokenize like a POSIX shell (quotes, escapes, continuations, ; & | &&
//      || newlines, ( ) $( ) <( ) and backticks) into simple commands.
//      No text is dropped before classifying: heredoc bodies (only for an
//      unquoted `<<`, never `<<<`) and here-strings become the INPUT of the
//      command they belong to.
//   2. In every simple command, inspect EVERY word whose basename is `git`
//      (so `{`, `if`, `!`, `find -exec`, sudo, xargs or unknown launchers in
//      front do not matter). Configured aliases are expanded.
//   3. Text a shell will run is classified recursively: `<shell> -c STRING`,
//      `eval ...`, and the heredoc / here-string input of a shell. Any other
//      argument that contains whitespace and the word `git` (a command line
//      handed to su -c, watch, script -c, env -S or any launcher) is checked
//      for bypass flags only: if it really runs, the git hooks still run, so
//      only a skip flag matters; reporting a scope for it would block
//      harmless mentions such as `echo "git commit"`. Arguments of a git
//      invocation itself (messages, patterns) are not checked this way.
//      Known false block: a literal bypass command inside such an argument,
//      e.g. grep for a skip-flag command line; search with a pattern file. Text fed
//      to a shell on stdin from elsewhere (pipe, redirect) is scanned
//      conservatively as raw text.
//   4. Every `$(` and backtick in the raw text, wherever it is (double
//      quotes, heredoc bodies, ${var:-...}, $(( ))), has its inner text
//      classified as a command too. Single-quoted text is included as well:
//      that over-reports, which is the safe direction.
//   5. If tokenizing fails, scan the raw text conservatively instead of
//      blocking outright.
// When in doubt this reports more, never less.

import type { Result } from "./ledger.ts";

export type Scope = "commit" | "push";
export type Aliases = ReadonlyMap<string, string>;

export interface Classification {
  readonly scope: Scope | undefined;
  readonly bypass: boolean;
  readonly stagesAll: boolean;
  readonly unparseable: boolean;
}

// One simple command: its words, and the text given to it as stdin by a
// heredoc or here-string in the command itself.
interface Command {
  readonly words: readonly string[];
  readonly inputs: readonly string[];
}

const NONE: Classification = { scope: undefined, bypass: false, stagesAll: false, unparseable: false };
const MAX_DEPTH = 4;

// ---- tokenizing ---------------------------------------------------------------

interface PendingHeredoc {
  readonly delimiter: string;
  readonly stripTabs: boolean;
}

interface Lexer {
  readonly commands: readonly Command[];
  readonly words: readonly string[];
  readonly inputs: readonly string[];
  readonly word: string | undefined;
  readonly hereString: boolean; // the next word is a here-string
  readonly pending: readonly PendingHeredoc[];
}

const EMPTY: Lexer = { commands: [], words: [], inputs: [], word: undefined, hereString: false, pending: [] };
const SEPARATORS = new Set([";", "&", "|", "(", ")", "`"]);

const endWord = (s: Lexer): Lexer => {
  if (s.word === undefined) return s;
  return s.hereString
    ? { ...s, inputs: [...s.inputs, s.word], word: undefined, hereString: false }
    : { ...s, words: [...s.words, s.word], word: undefined };
};

const endCommand = (s: Lexer): Lexer => {
  const ended = endWord(s);
  if (ended.words.length === 0 && ended.inputs.length === 0) return ended;
  return { ...ended, commands: [...ended.commands, { words: ended.words, inputs: ended.inputs }], words: [], inputs: [] };
};

const append = (s: Lexer, text: string): Lexer => ({ ...s, word: (s.word ?? "") + text });

// Index of the closing quote, or -1 when unbalanced.
const closingQuote = (input: string, from: number, quote: string): number => {
  const scan = (i: number): number => {
    if (i >= input.length) return -1;
    if (quote === '"' && input[i] === "\\") return scan(i + 2);
    return input[i] === quote ? i : scan(i + 1);
  };
  return scan(from);
};

const unescapeDouble = (text: string): string =>
  text.replace(/\\(["\\$`\n])/g, (_m, c: string) => (c === "\n" ? "" : c));

// `<<[-][ \t]*DELIM` at position i (DELIM bare or quoted). Returns the
// heredoc and the index after the delimiter, or undefined.
const HEREDOC_OPERATOR = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|([^\s;&|()<>'"]+))/;

const readHeredocOperator = (input: string, i: number): { heredoc: PendingHeredoc; next: number } | undefined => {
  const match = HEREDOC_OPERATOR.exec(input.slice(i));
  if (match === null) return undefined;
  const delimiter = match[2] ?? match[3] ?? match[4] ?? "";
  return { heredoc: { delimiter, stripTabs: match[1] === "-" }, next: i + match[0].length };
};

// Consume the bodies of pending heredocs starting at `from` (just after a
// newline). An unterminated heredoc runs to the end, as in bash.
const readBodies = (input: string, from: number, pending: readonly PendingHeredoc[]): { bodies: readonly string[]; next: number } =>
  pending.reduce<{ bodies: readonly string[]; next: number }>(
    (acc, heredoc) => {
      const lines = input.slice(acc.next).split("\n");
      const isEnd = (line: string) => (heredoc.stripTabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter;
      const endAt = lines.findIndex(isEnd);
      const body = (endAt < 0 ? lines : lines.slice(0, endAt)).join("\n");
      const next = endAt < 0 ? input.length : acc.next + lines.slice(0, endAt + 1).join("\n").length + 1;
      return { bodies: [...acc.bodies, body], next: Math.min(input.length, next) };
    },
    { bodies: [], next: from },
  );

const parse = (raw: string): Result<readonly Command[]> => {
  const input = raw.replace(/\\\n/g, "");
  const step = (s: Lexer, i: number): Result<Lexer> => {
    if (i >= input.length) return { ok: true, value: endCommand(s) };
    const c = input[i] ?? "";
    if (c === "'" || c === '"') {
      const end = closingQuote(input, i + 1, c);
      if (end < 0) return { ok: false, errors: [`unbalanced ${c} quote`] };
      const body = input.slice(i + 1, end);
      return step(append(s, c === '"' ? unescapeDouble(body) : body), end + 1);
    }
    if (c === "\\") return step(append(s, input[i + 1] ?? ""), i + 2);
    if (c === "\n") {
      const atEol = endWord(s);
      const { bodies, next } = readBodies(input, i + 1, atEol.pending);
      return step(endCommand({ ...atEol, inputs: [...atEol.inputs, ...bodies], pending: [] }), next);
    }
    if (input.startsWith("<<<", i)) return step({ ...endWord(s), hereString: true }, i + 3);
    if (input.startsWith("<<", i)) {
      const operator = readHeredocOperator(input, i);
      if (operator !== undefined) return step({ ...endWord(s), pending: [...s.pending, operator.heredoc] }, operator.next);
    }
    if ((c === "$" || c === "<" || c === ">") && input[i + 1] === "(") return step(endCommand(s), i + 2);
    if (SEPARATORS.has(c)) return step(endCommand(s), i + 1);
    if (/\s/.test(c)) return step(endWord(s), i + 1);
    return step(append(s, c), i + 1);
  };
  const result = step(EMPTY, 0);
  return result.ok ? { ok: true, value: result.value.commands } : result;
};

// Words of each simple command (heredoc bodies and here-strings excluded).
export const splitCommands = (raw: string): Result<readonly (readonly string[])[]> => {
  const parsed = parse(raw);
  return parsed.ok ? { ok: true, value: parsed.value.map((c) => c.words).filter((w) => w.length > 0) } : parsed;
};

// ---- git arguments --------------------------------------------------------------

const basename = (word: string): string => word.slice(word.lastIndexOf("/") + 1);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

// Global git options that take a separate value.
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--exec-path"]);

// commit / push options whose value is the next word (must not be read as flags).
const VALUE_OPTIONS = new Set([
  "-m", "-F", "-c", "-C", "-t", "-o",
  "--message", "--file", "--author", "--date", "--template", "--fixup", "--squash",
  "--trailer", "--push-option", "--repo", "--receive-pack", "--exec",
]);
const SHORT_VALUE_LETTERS = new Set(["m", "F", "c", "C", "t", "o"]);

interface ArgFlags {
  readonly bypass: boolean;
  readonly stagesAll: boolean;
}

// Short cluster like -anm: letters up to and including the first value-taking letter.
const clusterLetters = (word: string): readonly string[] => {
  const letters = [...word.slice(1)];
  const valueAt = letters.findIndex((l) => SHORT_VALUE_LETTERS.has(l));
  return valueAt < 0 ? letters : letters.slice(0, valueAt + 1);
};

const scanArgs = (args: readonly string[]): ArgFlags => {
  const step = (i: number, acc: ArgFlags): ArgFlags => {
    const w = args[i];
    if (w === undefined || w === "--") return acc;
    if (VALUE_OPTIONS.has(w)) return step(i + 2, acc);
    if (w.startsWith("--")) {
      const name = w.split("=")[0] ?? w;
      return step(i + 1, {
        bypass: acc.bypass || name.startsWith("--no-v"),
        stagesAll: acc.stagesAll || name === "--all",
      });
    }
    if (w.startsWith("-") && w.length > 1) {
      const letters = clusterLetters(w);
      const takesNext = SHORT_VALUE_LETTERS.has(letters[letters.length - 1] ?? "") && w.length === letters.length + 1;
      return step(takesNext ? i + 2 : i + 1, {
        bypass: acc.bypass || letters.includes("n"),
        stagesAll: acc.stagesAll || letters.includes("a"),
      });
    }
    return step(i + 1, acc);
  };
  return step(0, { bypass: false, stagesAll: false });
};

const merge = (a: Classification, b: Classification): Classification => ({
  scope: a.scope ?? b.scope,
  bypass: a.bypass || b.bypass,
  stagesAll: a.stagesAll || b.stagesAll,
  unparseable: a.unparseable || b.unparseable,
});

// ---- classification ---------------------------------------------------------------

interface Context {
  readonly aliases: Aliases;
  readonly depth: number;
}

// `words` starts right after a `git` word.
const classifyGitArgs = (words: readonly string[], ctx: Context): Classification => {
  const subAt = (i: number): number => {
    const w = words[i];
    if (w === undefined || !w.startsWith("-")) return i;
    return subAt(GIT_OPTIONS_WITH_VALUE.has(w) ? i + 2 : i + 1);
  };
  const at = subAt(0);
  const sub = words[at];
  const args = words.slice(at + 1);
  if (sub === "commit" || sub === "push") {
    const flags = scanArgs(args);
    return { scope: sub, bypass: flags.bypass, stagesAll: sub === "commit" && flags.stagesAll, unparseable: false };
  }
  const alias = sub === undefined ? undefined : ctx.aliases.get(sub);
  if (alias === undefined || ctx.depth >= MAX_DEPTH) return NONE;
  const next = { ...ctx, depth: ctx.depth + 1 };
  if (alias.startsWith("!")) return classifyText(`${alias.slice(1)} ${args.join(" ")}`, next);
  const expanded = splitCommands(alias);
  return expanded.ok ? classifyGitArgs([...(expanded.value[0] ?? []), ...args], next) : NONE;
};

const shellScript = (words: readonly string[], at: number): string | undefined =>
  words.slice(at + 1).find((_w, i, rest) => i > 0 && /^-[a-z]*c$/.test(rest[i - 1] ?? ""));

// A shell word without -c runs whatever arrives on stdin: its own heredoc /
// here-string if it has one (classified as a script), otherwise something
// from outside the command (scanned as raw text by classifyText).
const classifyShell = (command: Command, at: number, ctx: Context): Classification => {
  const deeper = { ...ctx, depth: ctx.depth + 1 };
  const script = shellScript(command.words, at);
  if (script !== undefined) return classifyText(script, deeper);
  return command.inputs.map((input) => classifyText(input, deeper)).reduce(merge, NONE);
};

const looksLikeCommandLine = (word: string): boolean => /\s/.test(word) && /\bgit\b/.test(word);

const classifySimple = (command: Command, ctx: Context): Classification => {
  const firstGit = command.words.findIndex((w) => basename(w) === "git");
  const ownArgsFrom = firstGit < 0 ? command.words.length : firstGit;
  return command.words
    .map((word, i): Classification => {
      const name = basename(word);
      if (name === "git") return classifyGitArgs(command.words.slice(i + 1), ctx);
      if (ctx.depth >= MAX_DEPTH) return NONE;
      const deeper = { ...ctx, depth: ctx.depth + 1 };
      if (SHELLS.has(name)) return classifyShell(command, i, ctx);
      if (name === "eval") return classifyText(command.words.slice(i + 1).join(" "), deeper);
      if (i < ownArgsFrom && looksLikeCommandLine(word)) {
        const embedded = classifyText(word, deeper);
        return { ...NONE, bypass: embedded.bypass };
      }
      return NONE;
    })
    .reduce(merge, NONE);
};

// Conservative raw-text scan, used when the text is not (or cannot be) parsed
// as the command being run: unparseable input and text fed to a shell's stdin.
const RAW_INVOCATION = /\bgit\b[^\n]*?\b(commit|push)\b([^\n]*)/g;
// A flag ends at any non-alphanumeric character (space, quote, end, ...).
const RAW_FLAG = /(^|[^A-Za-z0-9-])(--no-v|-[a-zA-Z]*n[a-zA-Z]*(?![A-Za-z0-9]))/;

const scanRaw = (text: string): Classification =>
  [...text.matchAll(RAW_INVOCATION)]
    .map((m): Classification => ({
      scope: m[1] === "commit" || m[1] === "push" ? m[1] : undefined,
      bypass: RAW_FLAG.test(m[2] ?? ""),
      stagesAll: false,
      unparseable: false,
    }))
    .reduce(merge, NONE);

// A shell started without -c and without its own heredoc / here-string
// reads its script from outside the command (pipe, redirect). We cannot know
// what it reads, so the whole raw text is scanned.
const readsOutsideStdin = (commands: readonly Command[]): boolean =>
  commands.some(
    (c) => c.inputs.length === 0 && c.words.some((w, i) => SHELLS.has(basename(w)) && shellScript(c.words, i) === undefined),
  );

// Inner text of every `$(...)` and backtick pair in `text`. The closing
// paren is matched by depth; when it cannot be found the rest of the text is
// used, so nothing is lost.
export const commandSubstitutions = (text: string): readonly string[] => {
  const closeParen = (from: number): number => {
    const scan = (i: number, depth: number): number => {
      if (i >= text.length) return -1;
      const c = text[i];
      if (c === "(") return scan(i + 1, depth + 1);
      if (c === ")") return depth === 0 ? i : scan(i + 1, depth - 1);
      return scan(i + 1, depth);
    };
    return scan(from, 0);
  };
  const dollar = [...text.matchAll(/\$\(/g)].map((m) => {
    const start = (m.index ?? 0) + 2;
    const end = closeParen(start);
    return text.slice(start, end < 0 ? undefined : end);
  });
  const ticks = [...text.matchAll(/`/g)].map((m) => m.index ?? 0);
  const backticks = ticks
    .filter((_t, i) => i % 2 === 0)
    .map((start, i) => text.slice(start + 1, ticks[i * 2 + 1] ?? undefined));
  return [...dollar, ...backticks];
};

const classifyText = (text: string, ctx: Context): Classification => {
  const substituted =
    ctx.depth >= MAX_DEPTH
      ? NONE
      : commandSubstitutions(text)
          .map((inner) => classifyText(inner, { ...ctx, depth: ctx.depth + 1 }))
          .reduce(merge, NONE);
  return merge(classifyParsed(text, ctx), substituted);
};

const classifyParsed = (text: string, ctx: Context): Classification => {
  const parsed = parse(text);
  if (!parsed.ok) {
    const raw = scanRaw(text);
    return { ...raw, unparseable: /\bgit\b/.test(text) && raw.scope === undefined };
  }
  const result = parsed.value.map((c) => classifySimple(c, ctx)).reduce(merge, NONE);
  return readsOutsideStdin(parsed.value) ? merge(result, scanRaw(text)) : result;
};

export const classifyCommand = (command: string, aliases: Aliases = new Map()): Classification =>
  classifyText(command, { aliases, depth: 0 });
