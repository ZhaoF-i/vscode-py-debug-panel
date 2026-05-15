import assert from "node:assert/strict";
import test from "node:test";
import { ArgumentParseError, parseShellArgs } from "../src/argsParser";

test("parses multiline shell-style arguments with line continuations", () => {
  const input = `--inputs \\
/mnt/raid2/userspace/zhaofei/result/PA_ANC_codex/PANDAR_JumpPath_PJ_synPS_2K_rirNorm8/ablation/PA-ANC_win64_checkNorm_checkData_dataAug_noiseAwareLoss/test_results/ \\
/mnt/raid2/userspace/zhaofei/result/PA_ANC_codex/PANDAR_JumpPath_PJ_synPS_2K_rirNorm8/compare/ARN_win4ms_hop2ms/test_results/ \\
--labels \\
PA-ANC \\
ARN \\
--save_file \\
compare`;

  assert.deepEqual(parseShellArgs(input), [
    "--inputs",
    "/mnt/raid2/userspace/zhaofei/result/PA_ANC_codex/PANDAR_JumpPath_PJ_synPS_2K_rirNorm8/ablation/PA-ANC_win64_checkNorm_checkData_dataAug_noiseAwareLoss/test_results/",
    "/mnt/raid2/userspace/zhaofei/result/PA_ANC_codex/PANDAR_JumpPath_PJ_synPS_2K_rirNorm8/compare/ARN_win4ms_hop2ms/test_results/",
    "--labels",
    "PA-ANC",
    "ARN",
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
