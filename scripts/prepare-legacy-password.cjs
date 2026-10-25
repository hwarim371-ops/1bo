const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function prepare(source, root = path.join(__dirname, "..")) {
  if (!source.includes('const SCRIPT_VERSION = "secure-sync-2026-06-12"') || source.includes("function passwordManagerPage_")) throw new Error("Unexpected legacy source; inspect before updating.");
  const replaceOnce = (before, after) => {
    if (source.split(before).length !== 2) throw new Error("Expected exactly one matching handler: " + before.slice(0, 60));
    source = source.replace(before, after);
  };
  replaceOnce("  const auth = authorize_(params);", '  if (params.action === "manage") return passwordManagerPage_(params.project);\n  const auth = authorize_(params);');
  replaceOnce("  lock.waitLock(15000);\n  try {\n    const ss = getSpreadsheet_();", "  lock.waitLock(15000);\n  try {\n    const currentAuth = authorize_(payload);\n    if (!currentAuth.ok) return json_(currentAuth);\n    const ss = getSpreadsheet_();");
  replaceOnce("function authorize_(payload) {", 'function authorize_(payload) {\n  if (passwordAttemptBlocked_()) return { ok: false, code: "RATE_LIMITED", message: "비밀번호 오류가 반복되었습니다. 1분 후 다시 시도해주세요." };');
  replaceOnce('  if (!secureEqual_(expected, String(payload.accessKey || ""))) {', '  if (!secureEqual_(expected, String(payload.accessKey || ""))) {\n    notePasswordFailure_();');
  replaceOnce("  return { ok: true };\n}", "  clearPasswordFailures_();\n  return { ok: true };\n}");
  source += "\n" + fs.readFileSync(path.join(root, "legacy-password-admin.gs"), "utf8") + "\n" + fs.readFileSync(path.join(root, "password-throttle.gs"), "utf8");
  new vm.Script(source);
  return source;
}
module.exports = { prepare };
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || path.resolve(input) === path.resolve(output)) throw new Error("Use separate input backup and output paths.");
  fs.writeFileSync(output, prepare(fs.readFileSync(input, "utf8").replaceAll("\r\n", "\n")));
}
