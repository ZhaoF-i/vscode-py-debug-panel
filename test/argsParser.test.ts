import assert from "node:assert/strict";
import test from "node:test";
import { ArgumentParseError, parseShellArgs } from "../src/argsParser";

test("parses multiline shell-style arguments with line continuations", () => {
  const input = `--inputs \\
/path/to/results/project-a/experiment-baseline/test_results/ \\
/path/to/results/project-a/experiment-candidate/test_results/ \\
--labels \\
Baseline \\
Candidate \\
--save_file \\
compare`;

  assert.deepEqual(parseShellArgs(input), [
    "--inputs",
    "/path/to/results/project-a/experiment-baseline/test_results/",
    "/path/to/results/project-a/experiment-candidate/test_results/",
    "--labels",
    "Baseline",
    "Candidate",
    "--save_file",
    "compare"
  ]);
});

test("preserves quoted whitespace", () => {
  assert.deepEqual(parseShellArgs(`--title "attenuation db (dB)" --label 'PA ANC'`), [
    "--title",
    "attenuation db (dB)",
    "--label",
    "PA ANC"
  ]);
});

test("does not create empty args after indented line continuations", () => {
  assert.deepEqual(parseShellArgs("--inputs \\\n  /tmp/a \\\n  /tmp/b"), [
    "--inputs",
    "/tmp/a",
    "/tmp/b"
  ]);
});

test("handles empty lines and repeated whitespace", () => {
  assert.deepEqual(parseShellArgs("\n\n  --save_file     compare\t--flag  \n"), [
    "--save_file",
    "compare",
    "--flag"
  ]);
});

test("supports escaped spaces outside quotes", () => {
  assert.deepEqual(parseShellArgs("--label PA\\ ANC --path /tmp/a\\ b"), [
    "--label",
    "PA ANC",
    "--path",
    "/tmp/a b"
  ]);
});

test("throws a clear error for mismatched quotes", () => {
  assert.throws(() => parseShellArgs(`--title "missing end`), ArgumentParseError);
});
