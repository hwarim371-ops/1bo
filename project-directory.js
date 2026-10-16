(function () {
  "use strict";
  const config = window.APP_CONFIG || {};
  const endpoint = String(config.projectDirectoryEndpoint || "");
  const validEndpoint = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  let pending = null;

  function request(action) {
    return new Promise((resolve, reject) => {
      const callback = "projectDirectory_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      let settled = false;
      const finish = (error, payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.remove();
        // A timed-out Google response can still arrive later.
        window[callback] = () => {};
        setTimeout(() => delete window[callback], 60000);
        if (error) reject(error);
        else resolve(payload);
      };
      const timer = setTimeout(() => finish(new Error("목록 서버 응답이 지연됩니다. 잠시 후 다시 점검해주세요. 기존 현장과 기록은 유지됩니다.")), 20000);
      window[callback] = (payload) => {
        if (!payload?.ok || (action === "projects" ? !Array.isArray(payload.projects) : typeof payload.configured !== "boolean")) {
          finish(new Error("목록 서버 응답을 확인하지 못했습니다. 관리자에게 연결 서버 상태 확인을 요청해주세요."));
          return;
        }
        finish(null, payload);
      };
      script.onerror = () => finish(new Error("목록 서버 응답을 불러오지 못했습니다. 네트워크를 확인하고 외부 브라우저에서도 점검해주세요. 기존 현장과 기록은 유지됩니다."));
      script.src = endpoint + "?action=" + action + "&callback=" + callback + "&t=" + Date.now();
      document.body.append(script);
    });
  }

  function list() {
    if (!validEndpoint.test(endpoint)) return Promise.resolve([]);
    if (pending) return pending;
    pending = request("projects").then((payload) => payload.projects
      .filter((p) => typeof p?.name === "string" && p.name.trim() && p.name.length <= 80)
      .map((p) => ({ name: p.name, syncEndpoint: endpoint, spreadsheetId: "", managed: true })))
      .finally(() => { pending = null; });
    return pending;
  }

  function health() {
    if (!validEndpoint.test(endpoint)) return Promise.reject(new Error("목록 서버 주소가 설정되지 않았습니다."));
    return request("health");
  }

  window.ProjectDirectory = {
    enabled: validEndpoint.test(endpoint),
    managerUrl: validEndpoint.test(endpoint) ? endpoint + "?action=manage" : "",
    list,
    health
  };
})();
