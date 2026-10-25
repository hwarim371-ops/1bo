(function () {
  "use strict";
  const endpoint = String(window.APP_CONFIG?.projectDirectoryEndpoint || "");
  let session = null, expiration = null, busy = false, generation = 0;
  const $ = id => document.getElementById(id);

  function request(action, values) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) return Promise.reject(new Error("관리자 서버 주소를 확인해주세요."));
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID(), frame = document.createElement("iframe"), form = document.createElement("form");
      frame.name = "admin_" + requestId; frame.hidden = true; frame.title = "관리자 확인 응답";
      form.method = "POST"; form.action = endpoint; form.target = frame.name; form.hidden = true;
      Object.entries({ ...values, adminBrowserAction: action, requestId, origin: location.origin }).forEach(([name, value]) => {
        const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.append(input);
      });
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true; clearTimeout(timeout); window.removeEventListener("message", receive); form.remove(); frame.remove();
        if (error) reject(error); else resolve(result);
      };
      const receive = event => {
        if (!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin) || event.data?.type !== "hwarim-administrator" || event.data.requestId !== requestId) return;
        // Apps Script wraps the response in nested frames. Accept only our frame tree.
        let source = event.source, ours = false;
        try { for (let i = 0; source && i < 5; i++) { if (source === frame.contentWindow) { ours = true; break; } if (source === source.parent) break; source = source.parent; } } catch { return; }
        if (!ours) return;
        if (event.data.ok !== true) return finish(new Error(event.data.message || "관리자 확인에 실패했습니다."));
        finish(null, event.data);
      };
      const timeout = setTimeout(() => finish(new Error("관리자 확인이 지연됩니다. 연결을 확인한 뒤 다시 시도해주세요.")), 30000);
      window.addEventListener("message", receive);
      document.body.append(frame, form);
      try { form.submit(); } catch { finish(new Error("관리자 서버를 열지 못했습니다.")); }
    });
  }

  function notify() { window.dispatchEvent(new Event("administratorchange")); }
  function lock() {
    const token = session?.token; session = null; ++generation; clearTimeout(expiration); notify();
    if (token) request("logout", { adminToken: token }).catch(() => {});
  }
  function token() {
    if (session && session.expiresAt <= Date.now()) lock();
    return session?.token || "";
  }
  function open() {
    const dialog = $("administratorDialog");
    if (!dialog) return;
    $("administratorStatus").textContent = "현장 비밀번호가 아닌 대표님용 관리자 비밀번호를 입력하세요.";
    if (!dialog.open) dialog.showModal();
    $("administratorPassword").focus();
  }
  window.AdministratorAccess = { token, lock, open, ensure() { if (token()) return true; open(); return false; } };

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("administratorLoginForm"), dialog = $("administratorDialog"), fields = $("administratorLoginFields");
    if (!form) return;
    $("administratorCancel").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => { ++generation; busy = false; fields.disabled = false; form.reset(); });
    form.addEventListener("submit", async event => {
      event.preventDefault(); if (busy || !form.reportValidity()) return;
      const current = ++generation, password = $("administratorPassword").value;
      form.reset(); busy = true; fields.disabled = true; $("administratorStatus").textContent = "관리자 확인 중...";
      try {
        const result = await request("login", { password });
        if (current !== generation) { request("logout", { adminToken: result.token }).catch(() => {}); return; }
        if (typeof result.token !== "string" || !/^[a-zA-Z0-9-]{32,100}$/.test(result.token) || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 900000) throw new Error("관리자 응답을 확인하지 못했습니다.");
        session = { token: result.token, expiresAt: result.expiresAt };
        expiration = setTimeout(lock, result.expiresAt - Date.now()); dialog.close(); notify();
      } catch (error) { if (current === generation) $("administratorStatus").textContent = error.message; }
      finally { if (current === generation) { busy = false; fields.disabled = false; } }
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) token(); });
  });
})();
