const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const directorySource = fs.readFileSync(path.join(__dirname, "..", "project-directory.js"), "utf8");
const central = "https://script.google.com/macros/s/TEST_CENTRAL/exec";
const previous = "https://script.google.com/macros/s/TEST_PREVIOUS/exec";
const fixed = "https://script.google.com/macros/s/TEST_FIXED/exec";

// No browser or network is used: every script and timer is controlled by the test.
function browser(config = {}) {
  const scripts = [], timers = new Map(), forbidden = [], storage = new Map();
  let timerId = 0;
  const forbid = (name) => () => { forbidden.push(name); throw new Error(`Forbidden operation: ${name}`); };
  const setTimeout = (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; };
  const clearTimeout = (id) => timers.delete(id);
  const window = { APP_CONFIG: config, SHEET_DATA: {}, setTimeout, clearTimeout, alert: forbid("alert"), confirm: forbid("confirm") };
  const document = {
    addEventListener() {},
    body: { classList: { contains: () => false }, append(script) { scripts.push(script); } },
    createElement(tag) {
      assert.equal(tag, "script");
      return { removed: false, remove() { this.removed = true; } };
    }
  };
  const context = vm.createContext({
    window, document, URL, navigator: { onLine: true }, setTimeout, clearTimeout,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: forbid("localStorage.setItem"), removeItem: forbid("localStorage.removeItem"), clear: forbid("localStorage.clear") },
    fetch: forbid("fetch"), console: { log: forbid("console.log"), warn: forbid("console.warn"), error: forbid("console.error") }
  });
  const run = (code) => vm.runInContext(code, context);
  const respond = (script, payload) => window[new URL(script.src).searchParams.get("callback")](payload);
  const expire = (delay) => {
    const timer = [...timers].find(([, value]) => value.delay === delay);
    assert.ok(timer, `Expected a ${delay}ms timer`);
    timers.delete(timer[0]);
    timer[1].callback();
  };
  return { run, context, scripts, timers, forbidden, storage, forbid, respond, expire };
}

function directory(endpoint = central) {
  const b = browser({ projectDirectoryEndpoint: endpoint });
  b.run(directorySource);
  return { ...b, api: b.context.window.ProjectDirectory };
}

function app(endpoint = previous) {
  const b = browser({ projects: [{ name: "화순", syncEndpoint: fixed }], projectDirectoryEndpoint: central });
  const saved = {
    activeProject: "양평",
    projects: [{ name: "양평", syncEndpoint: endpoint, managed: false }],
    entries: [{ id: "unsent-work", project: "양평", cost: 123, status: "failed", memo: "보존할 업무" }],
    materialOrders: [{ id: "unsent-material", project: "양평", orderAmount: 45, status: "local" }],
    sheetEdits: { "양평": { work: { row: { memo: { before: "기존", value: "수정 중" } } } } },
    workForms: { "양평": { memo: "작성 중" } },
    pendingShared: { "양평": { config: { labor: ["기존 인부"] } } },
    draft: [{ memo: "아직 저장하지 않은 작성 내용" }]
  };
  b.storage.set("jecheon-field-app-v2", JSON.stringify(saved, null, 2));
  b.storage.set("unrelated-setting", "  preserved bytes\n");
  b.run(appSource);
  b.run(`
    elements.accessProjectSelect = { value: "양평" };
    elements.connectionCheckButton = { disabled: false, textContent: "연결 점검" };
    elements.connectionStatus = { textContent: "", classList: { add() {}, remove() {}, toggle() {} } };
    elements.accessGate = { classList: { contains: () => false } };
    elements.accessPassword = {};
  `);
  b.context.forbid = b.forbid;
  b.run(`
    Object.defineProperty(elements.accessPassword, "value", { get: forbid("password read") });
    getAccessKey = forbid("accessKey read");
    projectAccessKeys.get = forbid("accessKey map read");
    hashPassword = forbid("password hash");
    restoreFromGoogleSheet = forbid("restore");
    refreshProjectDirectory = forbid("directory refresh");
    saveState = forbid("saveState");
  `);
  const snapshot = () => ({ state: b.run("JSON.stringify(state)"), storage: JSON.stringify([...b.storage]) });
  return { ...b, snapshot };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function publicRequest(script, action) {
  const url = new URL(script.src);
  assert.equal(url.origin + url.pathname, central);
  assert.equal(url.searchParams.get("action"), action);
  assert.ok(url.searchParams.get("callback"));
  assert.deepEqual([...url.searchParams.keys()].filter((key) => !["action", "callback", "t"].includes(key)), []);
}

test("public health and directory requests use only the configured endpoint without credentials", async () => {
  const b = directory();
  const health = b.api.health(), list = b.api.list();
  assert.equal(b.scripts.length, 2);
  publicRequest(b.scripts[0], "health");
  publicRequest(b.scripts[1], "projects");
  b.respond(b.scripts[0], { ok: true, configured: true });
  b.respond(b.scripts[1], { ok: true, projects: [{ name: "양평", syncEndpoint: previous }, null, {}, { name: "" }, { name: " ".repeat(2) }, { name: "x".repeat(81) }] });
  assert.equal((await health).configured, true);
  assert.deepEqual(JSON.parse(JSON.stringify(await list)), [{ name: "양평", syncEndpoint: central, spreadsheetId: "", managed: true }]);
  assert.ok(b.scripts.every((script) => script.removed));
  assert.deepEqual(b.forbidden, []);
});

test("unconfigured directory does not create any network request", async () => {
  for (const endpoint of ["", "https://example.invalid/exec", central + "?accessKey=unexpected"]) {
    const b = directory(endpoint);
    assert.equal(b.api.enabled, false);
    assert.equal(b.api.managerUrl, "");
    assert.equal((await b.api.list()).length, 0);
    await assert.rejects(b.api.health(), /설정/);
    assert.equal(b.scripts.length, 0);
    assert.deepEqual(b.forbidden, []);
  }
});

test("directory list shares an in-flight read and permits retry after a failed request", async () => {
  const b = directory();
  const first = b.api.list();
  assert.equal(b.api.list(), first);
  const rejection = assert.rejects(first, /외부 브라우저/);
  b.scripts[0].onerror();
  await rejection;
  const retry = b.api.list();
  assert.equal(b.scripts.length, 2);
  b.respond(b.scripts[1], { ok: true, projects: [{ name: "양평" }] });
  assert.equal((await retry)[0].name, "양평");
});

test("malformed public payloads are rejected before they become diagnostic evidence", async () => {
  for (const [action, payloads] of [
    ["health", [null, { ok: false, configured: true }, { ok: true }, { ok: true, configured: "true" }]],
    ["list", [null, { ok: false, projects: [] }, { ok: true }, { ok: true, projects: {} }]]
  ]) {
    for (const payload of payloads) {
      const b = directory();
      const rejected = assert.rejects(b.api[action](), /응답/);
      b.respond(b.scripts[0], payload);
      await rejected;
      assert.equal(b.scripts[0].removed, true);
      assert.deepEqual(b.forbidden, []);
    }
  }
});

test("public request timeout makes a late callback harmless", async () => {
  const b = directory();
  const rejected = assert.rejects(b.api.health(), /지연/);
  const script = b.scripts[0];
  const callback = new URL(script.src).searchParams.get("callback");
  const capturedCallback = b.context.window[callback];
  b.expire(20000);
  await rejected;
  assert.equal(script.removed, true);
  assert.doesNotThrow(() => b.respond(script, { ok: true, configured: true }));
  assert.doesNotThrow(() => capturedCallback({ ok: true, configured: true }));
  assert.doesNotThrow(() => script.onerror());
  b.expire(60000);
  assert.equal(b.context.window[callback], undefined);
});

test("manual same-name mismatch is reported without changing records, settings, credentials or stored bytes", async () => {
  const b = app();
  b.run(directorySource);
  b.run('state.activeProject = "화순"');
  const before = b.snapshot();
  const checked = b.run("checkProjectConnection()");
  assert.equal(b.run("elements.connectionCheckButton.disabled"), true);
  assert.equal(b.scripts.length, 2);
  publicRequest(b.scripts[0], "health");
  publicRequest(b.scripts[1], "projects");
  b.respond(b.scripts[0], { ok: true, configured: true });
  b.respond(b.scripts[1], { ok: true, projects: [{ name: "양평" }] });
  await checked;
  const message = b.run("elements.connectionStatus.textContent");
  assert.match(message, /양평 연결 점검/);
  assert.match(message, /주소와 다릅니다/);
  assert.match(message, /오래된 연결일 수 있지만 이름만으로/);
  assert.match(message, /비밀번호 로그인과 실제 시트 접근은 아직 확인하지 않았습니다/);
  assert.equal(b.run("elements.connectionCheckButton.disabled"), false);
  assert.deepEqual(b.snapshot(), before);
  assert.deepEqual(b.forbidden, []);
});

test("matching directory address is confirmed without claiming successful authenticated access", async () => {
  const b = app(central);
  b.run(directorySource);
  const before = b.snapshot();
  const checked = b.run("checkProjectConnection()");
  b.respond(b.scripts[0], { ok: true, configured: true });
  b.respond(b.scripts[1], { ok: true, projects: [{ name: "양평" }] });
  await checked;
  const message = b.run("elements.connectionStatus.textContent");
  assert.match(message, /연결 주소와 같습니다/);
  assert.match(message, /공개 상태 응답은 정상/);
  assert.match(message, /실제 시트 접근은 아직 확인하지 않았습니다/);
  assert.deepEqual(b.snapshot(), before);
  assert.deepEqual(b.forbidden, []);
});

test("configured fixed project is not mislabeled as an old address even when its name appears centrally", async () => {
  const b = app();
  b.run(directorySource);
  b.run('elements.accessProjectSelect.value = "화순"');
  const before = b.snapshot();
  const checked = b.run("checkProjectConnection()");
  b.respond(b.scripts[0], { ok: true, configured: true });
  b.respond(b.scripts[1], { ok: true, projects: [{ name: "화순" }] });
  await checked;
  const message = b.run("elements.connectionStatus.textContent");
  assert.match(message, /앱에 지정된 기존 현장 주소/);
  assert.doesNotMatch(message, /오래된 연결일 수 있지만/);
  assert.deepEqual(b.snapshot(), before);
  assert.deepEqual(b.forbidden, []);
});

test("missing saved endpoint and missing public entry are explained without creating a project", async () => {
  const b = app("");
  b.run(directorySource);
  const before = b.snapshot();
  const checked = b.run("checkProjectConnection()");
  b.respond(b.scripts[0], { ok: true, configured: false });
  b.respond(b.scripts[1], { ok: true, projects: [] });
  await checked;
  const message = b.run("elements.connectionStatus.textContent");
  assert.match(message, /연결 주소가 없습니다/);
  assert.match(message, /공개 목록에 이 현장이 없습니다/);
  assert.match(message, /설정이 완료되지 않았습니다/);
  assert.deepEqual(b.snapshot(), before);
  assert.deepEqual(b.forbidden, []);
});

test("failed or malformed public checks remain inconclusive and preserve local data", async () => {
  for (const failure of ["network", "malformed"]) {
    const b = app();
    b.run(directorySource);
    const before = b.snapshot();
    const checked = b.run("checkProjectConnection()");
    for (const script of b.scripts) {
      if (failure === "network") script.onerror();
      else b.respond(script, { ok: true, projects: "invalid", configured: "invalid" });
    }
    await checked;
    const message = b.run("elements.connectionStatus.textContent");
    assert.match(message, /주소와 비교하지 못했습니다/);
    assert.match(message, /이 결과만으로 판단할 수 없습니다/);
    assert.doesNotMatch(message, /주소와 같습니다|오래된 연결일 수 있지만/);
    assert.equal(b.run("elements.connectionCheckButton.disabled"), false);
    assert.deepEqual(b.snapshot(), before);
    assert.deepEqual(b.forbidden, []);
  }
});

test("unavailable diagnostic API leaves data intact and does not attempt login or a fallback request", async () => {
  const b = app();
  const before = b.snapshot();
  await b.run("checkProjectConnection()");
  assert.match(b.run("elements.connectionStatus.textContent"), /점검을 사용할 수 없습니다/);
  assert.deepEqual(b.snapshot(), before);
  assert.equal(b.scripts.length, 0);
  assert.deepEqual(b.forbidden, []);
});

test("selection or endpoint changes discard pending diagnostic results", async () => {
  for (const [change, expectedMessage] of [
    ['elements.accessProjectSelect.value = "화순"', /양평 연결 정보 확인 중/],
    ['state.projects.find(p => p.name === "양평").syncEndpoint = "changed"', /연결 정보가 변경되었습니다. 다시 점검/]
  ]) {
    const b = app();
    const health = deferred(), projects = deferred();
    b.context.window.ProjectDirectory = { enabled: true, health: () => health.promise, list: () => projects.promise };
    const checked = b.run("checkProjectConnection()");
    b.run(change);
    health.resolve({ ok: true, configured: true });
    projects.resolve([{ name: "양평", syncEndpoint: central }]);
    await checked;
    assert.match(b.run("elements.connectionStatus.textContent"), expectedMessage);
    assert.doesNotMatch(b.run("elements.connectionStatus.textContent"), /주소와 다릅니다|주소와 같습니다|공개 상태 응답은 정상/);
    assert.equal(b.run("elements.connectionCheckButton.disabled"), false);
    assert.deepEqual(b.forbidden, []);
  }
});

test("newer diagnostic wins and an older completion cannot reenable its pending button", async () => {
  const b = app();
  const oldHealth = deferred(), newHealth = deferred();
  const oldProjects = deferred(), newProjects = deferred();
  const healthRequests = [oldHealth, newHealth], projectRequests = [oldProjects, newProjects];
  b.context.window.ProjectDirectory = { enabled: true, health: () => healthRequests.shift().promise, list: () => projectRequests.shift().promise };
  const older = b.run("checkProjectConnection()"), newer = b.run("checkProjectConnection()");
  const pendingMessage = b.run("elements.connectionStatus.textContent");
  oldHealth.resolve({ ok: true, configured: true });
  oldProjects.resolve([{ name: "양평", syncEndpoint: central }]);
  await older;
  assert.equal(b.run("elements.connectionStatus.textContent"), pendingMessage);
  assert.equal(b.run("elements.connectionCheckButton.disabled"), true);
  newHealth.resolve({ ok: true, configured: true });
  newProjects.resolve([{ name: "양평", syncEndpoint: previous }]);
  await newer;
  assert.match(b.run("elements.connectionStatus.textContent"), /연결 주소와 같습니다/);
  assert.equal(b.run("elements.connectionCheckButton.disabled"), false);
  assert.deepEqual(b.forbidden, []);
});

test("reset invalidates an outstanding check before the login UI continues", async () => {
  const b = app();
  const health = deferred(), projects = deferred();
  b.context.window.ProjectDirectory = { enabled: true, health: () => health.promise, list: () => projects.promise };
  const checked = b.run("checkProjectConnection()");
  b.run("resetConnectionCheck(); elements.connectionCheckButton.disabled = true;");
  const resetMessage = b.run("elements.connectionStatus.textContent");
  health.resolve({ ok: true, configured: true });
  projects.resolve([{ name: "양평", syncEndpoint: central }]);
  await checked;
  assert.equal(b.run("elements.connectionStatus.textContent"), resetMessage);
  assert.equal(b.run("elements.connectionCheckButton.disabled"), true);
  assert.deepEqual(b.forbidden, []);
});

test("load failure has an actionable code and project-specific message without exposing its endpoint", async () => {
  const b = app();
  const before = b.snapshot();
  const rejected = assert.rejects(b.run('loadSheetBackupJsonp("")'), (error) => {
    assert.equal(error.code, "LOAD_FAILED");
    assert.match(error.message, /양평/);
    assert.match(error.message, /선택 현장 연결 점검/);
    assert.match(error.message, /이 오류만으로 비밀번호가 틀렸다고 판단할 수 없습니다/);
    assert.ok(!error.message.includes(previous));
    return true;
  });
  b.scripts[0].onerror();
  await rejected;
  assert.doesNotThrow(() => b.respond(b.scripts[0], { ok: true }));
  assert.deepEqual(b.snapshot(), before);
  assert.deepEqual(b.forbidden, []);
});

test("load timeout captures original project and ignores late or repeated responses", async () => {
  const b = app();
  const rejected = assert.rejects(b.run('loadSheetBackupJsonp("")'), (error) => {
    assert.equal(error.code, "TIMEOUT");
    assert.match(error.message, /양평/);
    assert.match(error.message, /15초/);
    assert.match(error.message, /캐시를 삭제하지 마세요/);
    return true;
  });
  const script = b.scripts[0], callback = new URL(script.src).searchParams.get("callback");
  const capturedCallback = b.context.window[callback];
  b.run('state.activeProject = "화순"');
  b.expire(15000);
  await rejected;
  assert.equal(script.removed, true);
  assert.doesNotThrow(() => b.respond(script, { ok: true }));
  assert.doesNotThrow(() => capturedCallback({ ok: true }));
  assert.doesNotThrow(() => script.onerror());
  b.expire(60000);
  assert.equal(b.context.window[callback], undefined);
  assert.deepEqual(b.forbidden, []);
});

test("load accepts one successful payload and preserves unauthorized errors without bypassing authentication", async () => {
  const b = app();
  const loaded = b.run('loadSheetBackupJsonp("")');
  const payload = { ok: true, workEntries: [], materialOrders: [] };
  b.respond(b.scripts[0], payload);
  assert.equal(await loaded, payload);
  assert.doesNotThrow(() => b.scripts[0].onerror());
  const rejected = assert.rejects(b.run('loadSheetBackupJsonp("")'), /비밀번호가 올바르지 않습니다/);
  b.respond(b.scripts[1], { ok: false, code: "UNAUTHORIZED" });
  await rejected;
  assert.deepEqual(b.forbidden, []);
});
