// Add to each existing secure-sync project without replacing its data handlers.
// doGet: route action=manage to passwordManagerPage_ before authorize_.
// doPost: recheck authorize_ after acquiring its existing script lock.
function requirePasswordOwner_() {
  const active = Session.getActiveUser().getEmail();
  if (!active || active !== Session.getEffectiveUser().getEmail()) throw new Error("이 서버를 배포한 구글 관리자 계정으로 접속해주세요.");
}

function passwordManagerState() {
  requirePasswordOwner_();
  const props = PropertiesService.getScriptProperties();
  return { revision: Number(props.getProperty("PASSWORD_REVISION") || 0), configured: Boolean(props.getProperty(PASSWORD_PROPERTY)) };
}

function changeProjectPassword(input) {
  requirePasswordOwner_();
  const password = input?.password;
  if (typeof password !== "string" || password.length < 4 || password.length > 128 || !password.trim()) throw new Error("새 비밀번호는 4~128자로 입력해주세요.");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("화면을 다시 열어주세요.");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    const revision = Number(props.getProperty("PASSWORD_REVISION") || 0);
    const hash = sha256_(password);
    const same = secureEqual_(props.getProperty(PASSWORD_PROPERTY) || "", hash);
    if (revision !== input.expectedRevision) {
      if (revision === input.expectedRevision + 1 && same) return { revision, configured: true };
      throw new Error("다른 화면에서 비밀번호가 변경되었습니다. 이 화면을 다시 열어주세요.");
    }
    if (!same) props.setProperties({ [PASSWORD_PROPERTY]: hash, PASSWORD_REVISION: String(revision + 1) });
    return { revision: same ? revision : revision + 1, configured: true };
  } finally { lock.releaseLock(); }
}

function passwordManagerPage_(projectName) {
  try {
    requirePasswordOwner_();
    const name = String(projectName || "현재 현장").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
    return HtmlService.createHtmlOutput(LEGACY_PASSWORD_HTML.replaceAll("__PROJECT_NAME__", name)).setTitle("현장 비밀번호 설정·변경").addMetaTag("viewport", "width=device-width, initial-scale=1");
  } catch (error) {
    return HtmlService.createHtmlOutput('<html lang="ko"><body style="font:18px/1.6 system-ui;padding:24px"><h2>구글 관리자 로그인이 필요합니다</h2><p>이 현장 서버를 배포한 구글 계정으로 다시 열어주세요. 일반 현장 비밀번호로는 변경할 수 없습니다.</p></body></html>');
  }
}

const LEGACY_PASSWORD_HTML = `<!doctype html><html lang="ko"><head><base target="_top"><style>
*{box-sizing:border-box}body{margin:0;padding:20px;background:#f6f3ed;color:#302113;font:18px/1.6 system-ui,sans-serif}main{max-width:560px;margin:24px auto;padding:24px;background:#fffdf8;border:1px solid #b8a78f;border-radius:16px}h1{font-size:26px}label{display:block;margin:18px 0}input,button{font:inherit;width:100%;padding:12px;border:1px solid #aa9b88;border-radius:8px;min-height:50px}button{background:#63401f;color:white;cursor:pointer}button:disabled{opacity:.55}small{display:block}#status{white-space:pre-wrap}fieldset{border:0;padding:0;margin:0}input:focus-visible,button:focus-visible{outline:3px solid #245ca6;outline-offset:3px}</style></head><body><main>
<h1>__PROJECT_NAME__<br>비밀번호 설정·변경</h1><p>이 화면을 연 현장의 비밀번호만 변경합니다. 업무·자재·인건비 설정과 다른 현장은 변경하지 않습니다.</p>
<p>새 비밀번호는 <strong>4자 이상</strong>입니다. 4자리는 추측하기 쉬우므로 가능한 길게 설정하세요. 기존 비밀번호는 직접 변경하기 전까지 그대로입니다.</p>
<form id="form"><fieldset id="fields" disabled><label>새 비밀번호<input id="password" type="password" minlength="4" maxlength="128" autocomplete="new-password" required></label><label>새 비밀번호 확인<input id="confirm" type="password" minlength="4" maxlength="128" autocomplete="new-password" required></label><button type="submit">이 현장 비밀번호 저장</button></fieldset></form>
<p id="status" role="status" aria-live="polite">관리자 권한 확인 중...</p><small>변경 후 업무일지에서 현장을 잠그고 새 비밀번호로 접속하세요. 이미 열려 있던 다른 기기는 이전 비밀번호로 저장할 수 없습니다.</small>
<script>
const form=document.getElementById('form'),fields=document.getElementById('fields'),status=document.getElementById('status');let revision=null;
google.script.run.withSuccessHandler(result=>{revision=result.revision;fields.disabled=false;status.textContent=result.configured?'이 현장의 비밀번호가 설정되어 있습니다.':'새 비밀번호를 설정해주세요.'}).withFailureHandler(error=>{status.textContent=error.message}).passwordManagerState();
form.addEventListener('submit',event=>{event.preventDefault();if(fields.disabled||revision===null||!form.reportValidity())return;const password=document.getElementById('password').value;
if(password.length<4||password.length>128||!password.trim()){status.textContent='4~128자로 입력해주세요.';return}
if(password!==document.getElementById('confirm').value){status.textContent='비밀번호 확인이 일치하지 않습니다.';return}
fields.disabled=true;status.textContent='저장 중...';google.script.run.withSuccessHandler(result=>{revision=result.revision;form.reset();fields.disabled=false;status.textContent='이 현장 비밀번호를 저장했습니다. 다음 접속부터 새 비밀번호를 사용하세요.'}).withFailureHandler(error=>{fields.disabled=false;status.textContent=error.message+' 연결이 끊겼다면 같은 비밀번호로 다시 시도해주세요.'}).changeProjectPassword({password,expectedRevision:revision});});
</script></main></body></html>`;
