// Central administrator credentials are separate from every project's password.
const ADMIN_RECORD_KEY = "ADMINISTRATOR_V1";
const ADMIN_SESSION_SECONDS = 900;

function administratorStatus() {
  return { configured: Boolean(PropertiesService.getScriptProperties().getProperty(ADMIN_RECORD_KEY)) };
}

function setupAdministrator(input) {
  requireOwner_();
  validatePassword_(input?.password);
  if (input.password !== input.confirm) throw new Error("비밀번호 확인이 일치하지 않습니다.");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    const previous = props.getProperty(ADMIN_RECORD_KEY);
    if (previous) throw new Error("관리자 비밀번호가 이미 등록되어 있습니다. 초기 등록은 한 번만 가능합니다.");
    const salt = Utilities.getUuid();
    props.setProperty(ADMIN_RECORD_KEY, JSON.stringify({ salt, verifier: hash_(salt + hash_(input.password)), revision: 1 }));
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function loginAdministrator(password) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(ADMIN_RECORD_KEY);
    if (!raw) throw new Error("대표님이 먼저 관리자 비밀번호를 등록해주세요.");
    const record = JSON.parse(raw);
    const attempts = JSON.parse(props.getProperty("ADMIN_LOGIN_FAILURES") || "{}");
    const now = Date.now();
    if (Number(attempts.blockedUntil) > now) throw new Error("관리자 비밀번호 오류가 반복되었습니다. 15분 후 다시 시도해주세요.");
    const valid = typeof password === "string" && password.length >= 4 && password.length <= 128 && equal_(record.verifier, hash_(record.salt + hash_(password)));
    if (!valid) {
      const count = Number.isFinite(attempts.lastFailure) && now - attempts.lastFailure < 900000 ? (Number(attempts.count) || 0) + 1 : 1;
      props.setProperty("ADMIN_LOGIN_FAILURES", JSON.stringify({ count, lastFailure: now, blockedUntil: count >= 5 ? now + 900000 : 0 }));
      throw new Error(count >= 5 ? "관리자 비밀번호 오류 5회로 15분간 잠겼습니다." : "관리자 비밀번호가 올바르지 않습니다.");
    }
    props.deleteProperty("ADMIN_LOGIN_FAILURES");
    const token = Utilities.getUuid() + Utilities.getUuid();
    const expiresAt = now + ADMIN_SESSION_SECONDS * 1000;
    CacheService.getScriptCache().put("admin-session-" + hash_(token), JSON.stringify({ revision: record.revision, expiresAt }), ADMIN_SESSION_SECONDS);
    return { token, expiresAt };
  } finally { lock.releaseLock(); }
}

function requireAdministrator_(token) {
  if (typeof token !== "string" || !/^[a-zA-Z0-9-]{32,100}$/.test(token)) throw new Error("관리자 비밀번호로 다시 확인해주세요.");
  const raw = CacheService.getScriptCache().get("admin-session-" + hash_(token));
  const current = PropertiesService.getScriptProperties().getProperty(ADMIN_RECORD_KEY);
  if (!raw || !current) throw new Error("관리자 확인이 만료되었습니다. 다시 로그인해주세요.");
  const session = JSON.parse(raw), record = JSON.parse(current);
  if (session.revision !== record.revision || session.expiresAt <= Date.now()) throw new Error("관리자 확인이 만료되었습니다. 다시 로그인해주세요.");
}

function logoutAdministrator(token) {
  if (typeof token === "string" && token.length <= 100) CacheService.getScriptCache().remove("admin-session-" + hash_(token));
}

function administratorBrowserResponse_(params) {
  const origin = "https://hwarim371-ops.github.io";
  if (params.origin !== origin || !/^[a-zA-Z0-9-]{32,100}$/.test(String(params.requestId || ""))) throw new Error("관리자 요청 경로가 올바르지 않습니다.");
  let result;
  try {
    if (params.adminBrowserAction === "login") result = { ok: true, ...loginAdministrator(params.password) };
    else if (params.adminBrowserAction === "logout") { logoutAdministrator(params.adminToken); result = { ok: true }; }
    else throw new Error("지원하지 않는 관리자 요청입니다.");
  } catch (error) { result = { ok: false, message: error.message }; }
  const message = JSON.stringify({ type: "hwarim-administrator", requestId: params.requestId, ...result }).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  // Only this callback is embeddable. The credential setup/management pages are not.
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage(' + message + ',' + JSON.stringify(origin) + ');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function administratorSetupPage_() {
  requireOwner_();
  return HtmlService.createHtmlOutput(ADMIN_SETUP_HTML).setTitle("관리자 비밀번호 최초 등록").addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function changeAdministratorPassword(input) {
  requireAdministrator_(input?.adminToken);
  validatePassword_(input?.password);
  if (input.password !== input.confirm) throw new Error("비밀번호 확인이 일치하지 않습니다.");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    requireAdministrator_(input.adminToken);
    const props = PropertiesService.getScriptProperties();
    const current = JSON.parse(props.getProperty(ADMIN_RECORD_KEY));
    const salt = Utilities.getUuid();
    props.setProperty(ADMIN_RECORD_KEY, JSON.stringify({ salt, verifier: hash_(salt + hash_(input.password)), revision: current.revision + 1 }));
    props.deleteProperty("ADMIN_LOGIN_FAILURES");
    return { ok: true };
  } finally { lock.releaseLock(); }
}

const ADMIN_SETUP_HTML = `<!doctype html><html lang="ko"><head><base target="_top"><style>
*{box-sizing:border-box}body{background:#f6f3ed;color:#302113;font:18px/1.6 system-ui;padding:20px}main{max-width:540px;margin:20px auto;padding:24px;background:#fffdf8;border:1px solid #b8a78f;border-radius:16px}label{display:block;margin:16px 0}input,button{width:100%;font:inherit;min-height:50px;padding:12px;border:1px solid #aa9b88;border-radius:8px}button{background:#63401f;color:white}fieldset{border:0;padding:0}#status{white-space:pre-wrap}</style></head><body><main>
<h1>관리자 비밀번호 최초 등록</h1><p>모든 현장의 비밀번호 관리를 위한 관리자 비밀번호입니다. 현장 접속 비밀번호와는 별개입니다.</p><p><strong>4자부터 설정 가능</strong>하며, 4자리는 추측하기 쉽습니다. 직원에게 공유하지 마세요. 최초 등록은 구글 관리자 계정에서만 가능합니다.</p>
<form id="setup"><fieldset id="fields"><label>관리자 비밀번호<input id="password" type="password" minlength="4" maxlength="128" autocomplete="new-password" required></label><label>관리자 비밀번호 확인<input id="confirm" type="password" minlength="4" maxlength="128" autocomplete="new-password" required></label><button>관리자 비밀번호 등록</button></fieldset></form><p id="status" role="status"></p><p>현장 비밀번호와 기존 업무 자료는 변경되지 않습니다.</p>
<script>const form=document.getElementById('setup'),fields=document.getElementById('fields'),status=document.getElementById('status');form.addEventListener('submit',e=>{e.preventDefault();if(fields.disabled||!form.reportValidity())return;const password=document.getElementById('password').value,confirm=document.getElementById('confirm').value;if(password!==confirm){status.textContent='비밀번호 확인이 일치하지 않습니다.';return}fields.disabled=true;google.script.run.withSuccessHandler(()=>{form.reset();status.textContent='관리자 비밀번호를 등록했습니다. 프로젝트 관리 화면에서 이 비밀번호로 로그인하세요.'}).withFailureHandler(error=>{fields.disabled=false;status.textContent=error.message}).setupAdministrator({password,confirm})});google.script.run.withSuccessHandler(result=>{if(result.configured){fields.disabled=true;status.textContent='이미 등록되어 있습니다. 기존 관리자 비밀번호를 사용해주세요.'}}).administratorStatus();</script></main></body></html>`;
