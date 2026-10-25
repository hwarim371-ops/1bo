// Ordinary record sync must never overwrite administrator-owned settings.
const PROTECTED_SETTING_FIELDS = ["config", "projectSettings", "projects"];

function settingsCanonical_(value) {
  if (Array.isArray(value)) return "[" + value.map(settingsCanonical_).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + settingsCanonical_(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function mergeProtectedSettings_(current, incoming, request, verifyAdministrator) {
  current = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("저장할 상태가 올바르지 않습니다.");
  const next = { ...current, ...incoming };
  const revision = Number.isSafeInteger(current.settingsRevision) ? current.settingsRevision : 0;
  next.settingsRevision = revision;
  PROTECTED_SETTING_FIELDS.forEach(key => {
    delete next[key];
    if (Object.prototype.hasOwnProperty.call(current, key)) next[key] = current[key];
  });
  if (request.settingsUpdate !== true) return next;
  verifyAdministrator(request.adminToken);
  if (!Number.isSafeInteger(request.expectedSettingsRevision) || request.expectedSettingsRevision < 0) throw new Error("설정 목록을 다시 불러온 뒤 수정해주세요.");
  if (!incoming.config || typeof incoming.config !== "object" || Array.isArray(incoming.config) || !incoming.projectSettings || typeof incoming.projectSettings !== "object" || Array.isArray(incoming.projectSettings) || !Array.isArray(incoming.projects)) throw new Error("관리 설정 형식이 올바르지 않습니다.");
  const same = PROTECTED_SETTING_FIELDS.every(key => settingsCanonical_(current[key]) === settingsCanonical_(incoming[key]));
  if (request.expectedSettingsRevision !== revision) {
    if (same && request.expectedSettingsRevision + 1 === revision) return next;
    throw new Error("다른 기기에서 관리 설정이 변경되었습니다. 최신 설정을 확인한 후 다시 저장해주세요.");
  }
  PROTECTED_SETTING_FIELDS.forEach(key => { next[key] = incoming[key]; });
  next.settingsRevision = same ? revision : revision + 1;
  return next;
}
