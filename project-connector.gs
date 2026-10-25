// Deploy as a NEW standalone Apps Script. Do not replace legacy project scripts.
const CONNECTOR_VERSION = "project-connector-2026-10-25-project-settings";
const COMPATIBLE_VERSION = "secure-sync-2026-06-12";
const RESERVED_PROJECTS = ["제천2조은삼", "천안1", "화순"];
const WORK_FIELDS = ["id", "date", "mainProcess", "subProcess", "detailProcess", "equipment", "labor", "workAmount", "costType", "cost", "paymentStatus", "memo", "project", "contractFlag", "contractTotal", "contractGroupId", "contractOriginalCost", "contractOriginalCostType", "createdAt", "updatedAt"];
const WORK_HEADERS = ["ID", "날짜", "주공정", "부공정", "세부공정", "장비", "인부", "투입공수", "비용 구분", "비용", "결제여부", "비고", "프로젝트", "도급여부", "도급총액", "도급그룹ID", "도급이전비용", "도급이전비용구분", "생성일", "수정일"];
const MATERIAL_FIELDS = ["id", "date", "process", "product", "vendor", "area", "orderAmount", "lowPrice", "highPrice", "memo", "creditAmount", "project", "createdAt", "updatedAt"];
const MATERIAL_HEADERS = ["ID", "날짜", "공정", "제품", "업체명", "지역", "발주 금액", "최저가", "최고가", "비고", "외상금액", "프로젝트", "생성일", "수정일"];
const NUMBER_FIELDS = ["workAmount", "cost", "contractTotal", "contractOriginalCost", "orderAmount", "lowPrice", "highPrice", "creditAmount"];

function setupConnector() {
  const active = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  if (!active || active !== effective) throw new Error("소유자가 Apps Script 편집기에서 실행해주세요.");
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty("CONNECTOR_OWNER");
  if (owner && owner !== active) throw new Error("기존 관리자를 변경할 수 없습니다.");
  props.setProperty("CONNECTOR_OWNER", active);
  // Authorize spreadsheet creation/read/write without touching existing project data.
  SpreadsheetApp.getActiveSpreadsheet();
  console.log("자동 연결 서버 준비 완료. 기존 현장 자료는 변경하지 않았습니다.");
}

function requireOwner_() {
  const owner = PropertiesService.getScriptProperties().getProperty("CONNECTOR_OWNER");
  if (!owner || Session.getActiveUser().getEmail() !== owner || Session.getEffectiveUser().getEmail() !== owner) {
    throw new Error("프로젝트 생성과 비밀번호 변경은 이 연결 서버의 구글 관리자 계정으로만 가능합니다.");
  }
}

function projectKey_(name) { return "PROJECT_" + hash_(String(name)); }
function registry_() {
  return Object.entries(PropertiesService.getScriptProperties().getProperties())
    .filter(([key]) => key.startsWith("PROJECT_"))
    .map(([, value]) => JSON.parse(value));
}
function readProject_(name) {
  const raw = PropertiesService.getScriptProperties().getProperty(projectKey_(name));
  return raw ? JSON.parse(raw) : null;
}
function writeProject_(project) {
  PropertiesService.getScriptProperties().setProperty(projectKey_(project.name), JSON.stringify(project));
}

function validatePassword_(password) {
  if (typeof password !== "string" || password.length < 4 || password.length > 128 || !password.trim()) {
    throw new Error("새 비밀번호는 4~128자로 입력해주세요.");
  }
}

function createManagedProject(input) {
  requireOwner_();
  const name = String(input?.name || "").trim().normalize("NFC");
  const password = input?.password;
  const requestId = String(input?.requestId || "");
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) || RESERVED_PROJECTS.includes(name)) throw new Error("기존 현장과 겹치지 않는 이름을 80자 이내로 입력해주세요.");
  validatePassword_(password);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new Error("생성 요청이 올바르지 않습니다. 화면을 다시 열어주세요.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let project = readProject_(name);
    if (project) {
      if (project.requestId !== requestId) throw new Error("같은 이름의 현장이 이미 있습니다. 아래 목록에서 확인해주세요.");
      if (!equal_(project.verifier, hash_(project.salt + hash_(password)))) throw new Error("재시도할 때는 처음 입력한 비밀번호를 사용해주세요.");
      if (!project.spreadsheetId) throw new Error("시트 생성 결과 확인이 필요합니다. 중복 생성을 막기 위해 중단했습니다. 관리자에게 문의해주세요.");
      if (project.status === "ready") return projectResult_(project);
    } else {
      if (registry_().length >= 200) throw new Error("자동 연결 현장 한도(200개)에 도달했습니다.");
      const salt = Utilities.getUuid();
      project = { name, requestId, salt, verifier: hash_(salt + hash_(password)), status: "creating", createdAt: new Date().toISOString() };
      // Journal before creation: an ambiguous timeout must never create a second sheet.
      writeProject_(project);
      const ss = SpreadsheetApp.create("화림 업무일지 - " + name);
      project.spreadsheetId = ss.getId();
      writeProject_(project);
    }
    const ss = SpreadsheetApp.openById(project.spreadsheetId);
    ss.setSpreadsheetTimeZone("Asia/Seoul");
    ensureSheet_(ss, "업무현황", WORK_HEADERS);
    ensureSheet_(ss, "자재현황", MATERIAL_HEADERS);
    ensureSheet_(ss, "최종현황", ["프로젝트", "그룹", "항목", "값", "구분", "저장일"]);
    ensureSheet_(ss, "앱저장소", ["프로젝트", "키", "값", "수정일"]);
    SpreadsheetApp.flush();
    project.status = "ready";
    writeProject_(project);
    return projectResult_(project);
  } finally { lock.releaseLock(); }
}

function projectResult_(project) {
  return { name: project.name, spreadsheetUrl: "https://docs.google.com/spreadsheets/d/" + project.spreadsheetId + "/edit", passwordRevision: project.passwordRevision || 0 };
}

function changeManagedProjectPassword(input) {
  requireOwner_();
  const name = String(input?.name || "").trim().normalize("NFC");
  const password = input?.password;
  validatePassword_(password);
  const expectedRevision = input?.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("현장 목록을 새로고침한 뒤 다시 선택해주세요.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const project = readProject_(name);
    if (!project || project.status !== "ready") throw new Error("자동 연결이 완료된 현장만 비밀번호를 변경할 수 있습니다.");
    const revision = project.passwordRevision || 0;
    const alreadyMatches = equal_(project.verifier, hash_(project.salt + hash_(password)));
    // A lost response can be retried, but a stale form cannot undo a later change.
    if (revision !== expectedRevision) {
      if (revision === expectedRevision + 1 && alreadyMatches) return projectResult_(project);
      throw new Error("다른 화면에서 비밀번호가 변경되었습니다. 취소 후 목록을 새로고침하고 다시 선택해주세요.");
    }
    if (!alreadyMatches) {
      project.salt = Utilities.getUuid();
      project.verifier = hash_(project.salt + hash_(password));
      project.passwordRevision = revision + 1;
      project.passwordChangedAt = new Date().toISOString();
      writeProject_(project);
    }
    return projectResult_(project);
  } finally { lock.releaseLock(); }
}

function doGet(e) {
  const params = e?.parameter || {};
  try {
    if (params.action === "manage") {
      requireOwner_();
      const html = MANAGER_HTML.replace('"__REQUESTED_PROJECT__"', JSON.stringify(String(params.project || "")).replace(/</g, "\\u003c"));
      return HtmlService.createHtmlOutput(html).setTitle("화림 프로젝트 관리").addMetaTag("viewport", "width=device-width, initial-scale=1");
    }
    if (params.action === "projects") return json_({ ok: true, connectorVersion: CONNECTOR_VERSION, projects: registry_().filter((p) => p.status === "ready").map((p) => ({ name: p.name })) }, params.callback);
    if (params.action === "health") return json_({ ok: true, connectorVersion: CONNECTOR_VERSION, configured: Boolean(PropertiesService.getScriptProperties().getProperty("CONNECTOR_OWNER")) }, params.callback);
    if (params.action !== "load") throw new Error("지원하지 않는 요청입니다.");
    const project = authorize_(params);
    const ss = SpreadsheetApp.openById(project.spreadsheetId);
    return json_({ ok: true, scriptVersion: COMPATIBLE_VERSION, project: project.name,
      workEntries: readRecords_(ss.getSheetByName("업무현황"), WORK_FIELDS, project.name),
      materialOrders: readRecords_(ss.getSheetByName("자재현황"), MATERIAL_FIELDS, project.name),
      stateData: readState_(ss, project.name), summarySnapshot: [] }, params.callback);
  } catch (error) {
    if (params.action === "manage") return HtmlService.createHtmlOutput('<html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="font:16px sans-serif;padding:32px"><h2>구글 관리자 로그인이 필요합니다</h2><p>스크립트를 배포한 구글 계정으로 로그인한 브라우저에서 다시 열어주세요.</p><p>일반 사용자는 업무일지에서 프로젝트 비밀번호로 접속하면 됩니다.</p></body></html>');
    return json_({ ok: false, message: error.message }, params.callback);
  }
}

function listManagedProjects() {
  requireOwner_();
  return registry_().filter((p) => p.status === "ready").map(projectResult_);
}

function authorize_(input) {
  const project = readProject_(String(input.project || ""));
  if (project && passwordAttemptBlocked_(project.name)) throw new Error("비밀번호 오류가 반복되어 잠시 접속을 제한했습니다. 1분 후 다시 시도해주세요.");
  if (!project || project.status !== "ready" || !/^[a-f0-9]{64}$/.test(String(input.accessKey || "")) || !equal_(project.verifier, hash_(project.salt + input.accessKey))) {
    if (project) notePasswordFailure_(project.name);
    throw new Error("프로젝트 또는 비밀번호가 올바르지 않습니다.");
  }
  clearPasswordFailures_(project.name);
  return project;
}

function doPost(e) {
  let lock;
  try {
    const text = e?.postData?.contents || "{}";
    if (text.length > 2000000) throw new Error("한 번에 저장할 수 있는 크기를 초과했습니다.");
    const input = JSON.parse(text);
    authorize_(input);
    const allowed = ["workEntries", "materialOrders", "deleteWorkEntries", "deleteMaterialOrders", "appState", "summarySnapshot"];
    if (!allowed.includes(input.type)) throw new Error("지원하지 않는 동기화 요청입니다.");
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    // Reject writes queued with the previous password before a password change.
    const project = authorize_(input);
    // The sheet ID always comes from the private registry, never from the request.
    const ss = SpreadsheetApp.openById(project.spreadsheetId);
    const records = Array.isArray(input.records) ? input.records : [];
    if (records.length > 5000) throw new Error("한 번에 5000건 이하로 저장해주세요.");
    if (input.type === "appState") saveState_(ss, project.name, input.stateData || {});
    else if (input.type === "summarySnapshot") {
      const sheet = ss.getSheetByName("최종현황");
      const rows = records.map((r) => [cell_(project.name), cell_(r.group), cell_(r.name), cell_(r.value), cell_(r.type), new Date().toISOString()]);
      replaceBody_(sheet, rows, 6);
    } else {
      const work = input.type === "workEntries" || input.type === "deleteWorkEntries";
      const fields = work ? WORK_FIELDS : MATERIAL_FIELDS;
      const sheet = ss.getSheetByName(work ? "업무현황" : "자재현황");
      const removing = input.type.startsWith("delete");
      const ids = records.map((r) => String(r.id || ""));
      if (ids.some((id) => !/^[\w-]{1,100}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error("기록 ID가 없거나 중복됩니다.");
      const current = readRecords_(sheet, fields, project.name);
      const byId = new Map(current.map((r) => [r.id, r]));
      if (removing) ids.forEach((id) => byId.delete(id));
      else records.forEach((r) => byId.set(r.id, { ...r, project: project.name }));
      const rows = [...byId.values()].map((r) => fields.map((key) => {
        if (key === "project") return cell_(project.name);
        if (key === "contractFlag") return r[key] ? "Y" : "";
        if (NUMBER_FIELDS.includes(key) && r[key] !== "" && r[key] != null) {
          const value = Number(r[key]);
          if (!Number.isFinite(value) || value < 0) throw new Error("금액과 공수는 0 이상의 숫자로 입력해주세요.");
          return value;
        }
        return cell_(r[key]);
      }));
      replaceBody_(sheet, rows, fields.length);
    }
    SpreadsheetApp.flush();
    return json_({ ok: true, scriptVersion: COMPATIBLE_VERSION });
  } catch (error) { return json_({ ok: false, message: error.message }); }
  finally { if (lock?.hasLock()) lock.releaseLock(); }
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}
function readRecords_(sheet, fields, project) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, fields.length).getValues().map((row, i) => {
    const record = { sourceRow: i + 2, status: "synced" };
    fields.forEach((field, j) => {
      const value = row[j];
      record[field] = field === "contractFlag" ? value === "Y" : value instanceof Date ? Utilities.formatDate(value, "Asia/Seoul", field === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm:ssXXX") : value;
    });
    return record;
  }).filter((r) => r.id && r.project === project);
}
function replaceBody_(sheet, rows, width) {
  if (!sheet) throw new Error("시트 구조를 확인해주세요.");
  const oldLength = Math.max(0, sheet.getLastRow() - 1);
  if (rows.length) {
    const needed = rows.length + 1 - sheet.getMaxRows();
    if (needed > 0) sheet.insertRowsAfter(sheet.getMaxRows(), needed);
    sheet.getRange(2, 1, rows.length, width).setValues(rows);
  }
  // Write first; a failed write must not clear the previous records.
  if (oldLength > rows.length) sheet.getRange(rows.length + 2, 1, oldLength - rows.length, width).clearContent();
}
function saveState_(ss, project, value) {
  const text = JSON.stringify({ ...value, project });
  const rows = [];
  for (let i = 0; i < text.length; i += 40000) rows.push([cell_(project), "appState:" + (i / 40000), cell_(text.slice(i, i + 40000)), new Date().toISOString()]);
  replaceBody_(ss.getSheetByName("앱저장소"), rows, 4);
}
function readState_(ss, project) {
  const sheet = ss.getSheetByName("앱저장소");
  if (!sheet || sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().filter((r) => r[0] === project && /^appState:\d+$/.test(r[1]));
  if (!rows.length) return {};
  rows.sort((a, b) => Number(a[1].split(":")[1]) - Number(b[1].split(":")[1]));
  return JSON.parse(rows.map((r) => r[2]).join(""));
}
function cell_(value) {
  if (value == null) return "";
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("올바르지 않은 숫자입니다."); return value; }
  const text = String(value);
  if (text.length > 45000) throw new Error("한 칸의 내용은 45000자 이내로 입력해주세요.");
  return /^[=+\-@']/.test(text) ? "'" + text : text;
}
function hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map((b) => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}
function equal_(a, b) {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
function json_(value, callback) {
  const valid = /^[a-zA-Z_$][\w$]{0,120}$/.test(String(callback || ""));
  const body = JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return ContentService.createTextOutput(valid ? callback + "(" + body + ");" : body).setMimeType(valid ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

const MANAGER_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;padding:24px;background:#f4eee5;color:#302113;font:16px/1.6 system-ui,sans-serif}main{max-width:720px;margin:24px auto;padding:28px;background:#fffaf2;border:1px solid #decbb4;border-radius:20px}h1{font-size:25px;line-height:1.3}h2{font-size:19px}h3{margin:0;font-size:18px}label{display:block;margin-top:16px;font-weight:600}input{display:block;width:100%;min-width:0;padding:12px;margin-top:6px;border:1px solid #cbb496;border-radius:8px;font:inherit}button,.link{display:inline-block;cursor:pointer;background:#63401f;color:white;border:1px solid #63401f;border-radius:8px;padding:11px 16px;font:inherit;text-decoration:none}button:disabled{opacity:.6;cursor:wait}.secondary{background:transparent;color:#63401f}.muted{font-size:14px;color:#74624f}.status{white-space:pre-wrap;overflow-wrap:anywhere}.status:empty{display:none}a{color:#63401f;overflow-wrap:anywhere}fieldset{border:0;padding:0;margin:0;min-width:0}.submit{width:100%;margin-top:18px}.section-head,.project-row,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head{margin-top:24px;flex-wrap:wrap}.section-head button,.project-row button{font-size:14px;flex-shrink:0}.project-row{padding:14px 0;border-bottom:1px solid #e6d6c3}.project-row strong{display:block;overflow-wrap:anywhere}.project-info{min-width:0}.project-info a{font-size:14px}#projects{list-style:none;padding:0;margin:0}#changeForm{margin:18px 0;padding:20px;background:#f7ead7;border:1px solid #c49b6c;border-radius:12px;scroll-margin-top:16px}.password-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.actions{margin-top:18px}.actions button{flex:1}.create-section{margin-top:28px;border-top:1px solid #decbb4;padding-top:12px}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #b27839;outline-offset:3px}@media(max-width:480px){body{padding:12px}main{padding:20px;margin:0}.password-fields{grid-template-columns:1fr;gap:0}#changeForm{padding:16px}.project-row{align-items:flex-start;flex-wrap:wrap}.project-row button{margin-left:auto}}
</style></head><body><main><p class="muted">화림 업무일지 · 구글 관리자 전용</p><h1>프로젝트 관리</h1><p>현장을 새로 만들거나, 자동 연결된 현장의 접속 비밀번호를 변경합니다.</p>
<div class="section-head"><h2>자동 연결된 현장</h2><button id="refresh" type="button" class="secondary">목록 새로고침</button></div><ul id="projects" aria-label="자동 연결된 현장 목록"><li>목록을 불러오는 중입니다.</li></ul>
<form id="changeForm" hidden aria-labelledby="changeTitle"><fieldset id="changeFields"><h3 id="changeTitle">비밀번호 변경 · <span id="changeName"></span></h3>
<p class="muted">업무·자재 자료와 시트 연결은 그대로 유지됩니다. 변경 후에는 새 비밀번호로 다시 접속해주세요. 이미 기기에 내려받은 자료는 삭제되지 않습니다.</p>
<div class="password-fields"><label>새 비밀번호<input id="newPassword" type="password" minlength="4" maxlength="128" required autocomplete="new-password" placeholder="4자 이상 입력"></label><label>새 비밀번호 확인<input id="newConfirm" type="password" minlength="4" maxlength="128" required autocomplete="new-password"></label></div>
<p class="muted">새 비밀번호는 4자 이상입니다. 4자리는 추측하기 쉬우므로 가능한 길게 설정하세요. 기존 비밀번호는 직접 변경하기 전까지 유지됩니다.</p><div class="actions"><button id="cancelChange" type="button" class="secondary">취소</button><button type="submit">비밀번호 변경 저장</button></div></fieldset><p id="changeStatus" class="status" role="status" aria-live="polite"></p></form>
<p id="status" class="status" role="status" aria-live="polite"></p><div id="result"></div>
<p class="muted">이 목록은 새 자동 연결 서버에서 만든 현장입니다. 기존 제천2조은삼·천안1·화순은 각 현장의 Apps Script에서 비밀번호를 관리합니다.</p>
<section class="create-section"><h2>새 프로젝트 자동 연결</h2><p class="muted">현장명과 비밀번호를 정하면 전용 구글시트를 만들고 업무일지에 자동 연결합니다.</p><form id="createForm"><fieldset id="createFields">
<label>새 현장 이름<input id="name" maxlength="80" required placeholder="예: 제천3 신축현장" autocomplete="off"></label>
<div class="password-fields"><label>프로젝트 비밀번호<input id="password" type="password" minlength="4" maxlength="128" required autocomplete="new-password" placeholder="4자 이상 입력"></label><label>비밀번호 확인<input id="confirm" type="password" minlength="4" maxlength="128" required autocomplete="new-password"></label></div>
<p class="muted">비밀번호는 4~128자로 설정해주세요. 구글 계정 비밀번호를 사용하지 마세요.</p><button id="create" class="submit" type="submit">프로젝트 + 구글시트 만들기</button></fieldset><p id="createStatus" class="status" role="status" aria-live="polite"></p></form></section>
<p><a href="https://hwarim371-ops.github.io/1bo/" target="_blank" rel="noopener" class="link">업무일지 열기</a></p></main><script>
const $=id=>document.getElementById(id),form=$('createForm'),statusBox=$('status'),changeForm=$('changeForm');
let request=null,busy=false,selected=null,requestedProject="__REQUESTED_PROJECT__";
function readRequest(){try{return JSON.parse(sessionStorage.getItem('pendingProject')||'null')}catch{return null}}
request=readRequest();if(request)$('name').value=request.name;
function remember(value){try{if(value)sessionStorage.setItem('pendingProject',JSON.stringify(value));else sessionStorage.removeItem('pendingProject')}catch{}}
function setBusy(value){busy=value;$('createFields').disabled=value;$('changeFields').disabled=value;$('refresh').disabled=value;document.querySelectorAll('[data-change]').forEach(b=>b.disabled=value)}
function clearChange(){changeForm.reset();changeForm.hidden=true;selected=null;$('changeStatus').textContent=''}
function openChange(project){if(busy)return;clearChange();selected=project;$('changeName').textContent=project.name;changeForm.hidden=false;statusBox.textContent='';$('newPassword').focus()}
function link(project){const anchor=document.createElement('a');anchor.textContent='구글시트 열기';anchor.href=project.spreadsheetUrl;anchor.target='_blank';anchor.rel='noopener';return anchor}
function projectRow(project){const item=document.createElement('li'),info=document.createElement('div'),name=document.createElement('strong'),edit=document.createElement('button');item.className='project-row';info.className='project-info';name.textContent=project.name;info.append(name,link(project));edit.type='button';edit.textContent='비밀번호 변경';edit.className='secondary';edit.dataset.change='';edit.setAttribute('aria-label',project.name+' 비밀번호 변경');edit.disabled=busy;edit.addEventListener('click',()=>openChange(project));item.append(info,edit);return item}
let listRequest=0;
function refresh(){const revision=++listRequest;google.script.run.withSuccessHandler(items=>{if(revision!==listRequest)return;const list=$('projects');list.replaceChildren(...items.map(projectRow));if(!items.length)list.textContent='아직 자동 생성한 현장이 없습니다.';const target=items.find(p=>p.name===requestedProject);if(target&&!busy){requestedProject='';openChange(target)}}).withFailureHandler(error=>{if(revision===listRequest)statusBox.textContent=error.message}).listManagedProjects()}
$('refresh').addEventListener('click',()=>{if(!busy)refresh()});$('cancelChange').addEventListener('click',()=>{if(!busy)clearChange()});
changeForm.addEventListener('submit',event=>{event.preventDefault();if(busy||!selected||!changeForm.reportValidity())return;const password=$('newPassword').value;
if(password.length<4||password.length>128||!password.trim()){$('changeStatus').textContent='새 비밀번호는 4~128자로 입력해주세요.';return}
if(password!==$('newConfirm').value){$('changeStatus').textContent='비밀번호 확인이 일치하지 않습니다.';return}
setBusy(true);$('changeStatus').textContent='비밀번호를 변경하는 중입니다. 창을 닫지 마세요.';
google.script.run.withSuccessHandler(project=>{setBusy(false);clearChange();statusBox.textContent=project.name+' 비밀번호가 저장되었습니다. 자료는 그대로이며, 다음 접속부터 새 비밀번호를 사용하세요.';refresh()}).withFailureHandler(error=>{setBusy(false);$('changeStatus').textContent=error.message+'\\n연결이 끊겼다면 같은 비밀번호로 다시 시도할 수 있습니다.'}).changeManagedProjectPassword({name:selected.name,password,expectedRevision:selected.passwordRevision});
});
form.addEventListener('submit',event=>{event.preventDefault();if(busy||!form.reportValidity())return;const name=$('name').value.trim(),password=$('password').value;
if(password.length<4||password.length>128||!password.trim()){$('createStatus').textContent='새 비밀번호는 4~128자로 입력해주세요.';return}
if(password!==$('confirm').value){$('createStatus').textContent='비밀번호 확인이 일치하지 않습니다.';return}
if(!request||request.name!==name){request={name,requestId:crypto.randomUUID()};remember(request)}setBusy(true);$('createStatus').textContent='구글시트를 만들고 연결하는 중입니다. 창을 닫지 마세요.';
google.script.run.withSuccessHandler(project=>{setBusy(false);$('createStatus').textContent='생성과 연결이 완료되었습니다. 업무일지로 돌아가 목록 새로고침 후 이 현장을 선택하세요.';$('result').replaceChildren(link(project));form.reset();request=null;remember(null);refresh()}).withFailureHandler(error=>{setBusy(false);$('createStatus').textContent=error.message+'\\n연결이 끊겼다면 같은 이름과 비밀번호로 다시 시도하세요. 중복 생성은 방지됩니다.'}).createManagedProject({name,password,requestId:request.requestId});
});refresh();
</script></body></html>`;
