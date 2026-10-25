// Existing project servers verify administrator sessions with this fixed server.
const ADMINISTRATOR_ENDPOINT = "https://script.google.com/macros/s/AKfycbx-EbImEOkTV9IuVnTbW0RISTmBabde91_rRtKE_qdMGdXVUreb12qbTaa7QT6iUZsP/exec";

function requireLegacyOwner_() {
  const active = Session.getActiveUser().getEmail();
  if (!active || active !== Session.getEffectiveUser().getEmail()) throw new Error("스크립트 소유자만 초기 설정을 실행할 수 있습니다.");
}

function administratorRequest_(input) {
  let result;
  try {
    const response = UrlFetchApp.fetch(ADMINISTRATOR_ENDPOINT, {
      method: "post", contentType: "application/json", payload: JSON.stringify(input),
      followRedirects: true, validateHttpsCertificates: true, muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error("HTTP");
    const text = response.getContentText();
    if (text.length > 10000) throw new Error("SIZE");
    result = JSON.parse(text);
    if (!result || typeof result.ok !== "boolean") throw new Error("FORMAT");
  } catch (error) {
    throw new Error("관리자 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요. 계속되면 서버의 연결 권한을 확인해주세요.");
  }
  if (!result.ok) throw new Error(typeof result.message === "string" ? result.message.slice(0, 300) : "관리자 비밀번호로 다시 확인해주세요.");
  return result;
}

function loginPasswordAdministrator(password) {
  if (typeof password !== "string" || password.length < 4 || password.length > 128 || !password.trim()) throw new Error("관리자 비밀번호는 4~128자로 입력해주세요.");
  const result = administratorRequest_({ action: "administratorLogin", password });
  if (typeof result.token !== "string" || !/^[a-zA-Z0-9-]{32,100}$/.test(result.token) || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 900000) {
    throw new Error("관리자 확인 응답이 올바르지 않습니다. 다시 로그인해주세요.");
  }
  return { token: result.token, expiresAt: result.expiresAt };
}

function requirePasswordAdministrator_(token) {
  if (typeof token !== "string" || !/^[a-zA-Z0-9-]{32,100}$/.test(token)) throw new Error("관리자 비밀번호로 다시 확인해주세요.");
  // Do not cache successful verification: password rotation and logout must revoke it.
  administratorRequest_({ action: "verifyAdministrator", adminToken: token });
}

function logoutPasswordAdministrator(token) {
  if (typeof token !== "string" || !/^[a-zA-Z0-9-]{32,100}$/.test(token)) return;
  administratorRequest_({ action: "logoutAdministrator", adminToken: token });
}

function checkAdministratorConnection() {
  requireLegacyOwner_();
  const response = UrlFetchApp.fetch(ADMINISTRATOR_ENDPOINT + "?action=health", { followRedirects: true, validateHttpsCertificates: true, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error("관리자 서버 연결을 확인해주세요.");
  const result = JSON.parse(response.getContentText());
  if (result.ok !== true || result.configured !== true) throw new Error("관리자 서버 설정을 확인해주세요.");
  console.log("공통 관리자 서버 연결 확인 완료. 비밀번호와 현장 자료는 변경하지 않았습니다.");
  return { ok: true };
}
