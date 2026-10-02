(function () {
  "use strict";
  const config = window.APP_CONFIG || {};
  const endpoint = String(config.projectDirectoryEndpoint || "");
  const validEndpoint = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  let pending = null;

  function list() {
    if (!validEndpoint.test(endpoint)) return Promise.resolve([]);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
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
      const timer = setTimeout(() => finish(new Error("프로젝트 목록 연결이 지연됩니다. 기존 현장은 그대로 사용할 수 있습니다.")), 20000);
      window[callback] = (payload) => {
        if (!payload?.ok || !Array.isArray(payload.projects)) {
          finish(new Error("프로젝트 목록을 불러오지 못했습니다. 다시 시도해주세요."));
          return;
        }
        const projects = payload.projects.filter((p) => typeof p.name === "string" && p.name.trim() && p.name.length <= 80);
        finish(null, projects.map((p) => ({ name: p.name, syncEndpoint: endpoint, spreadsheetId: "", managed: true })));
      };
      script.onerror = () => finish(new Error("구글 연결을 확인해주세요. 기존 프로젝트와 기록은 유지됩니다."));
      script.src = endpoint + "?action=projects&callback=" + callback + "&t=" + Date.now();
      document.body.append(script);
    }).finally(() => { pending = null; });
    return pending;
  }

  window.ProjectDirectory = {
    enabled: validEndpoint.test(endpoint),
    managerUrl: validEndpoint.test(endpoint) ? endpoint + "?action=manage" : "",
    list
  };
})();
