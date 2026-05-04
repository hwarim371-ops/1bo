const STORAGE_KEY = "jecheon-field-app-v2";
const appConfig = window.APP_CONFIG || {};
const sourceData = window.SHEET_DATA || {};

const today = new Date();
const isoToday = toISODate(today);

const views = {
  input: "업무등록",
  logs: "업무현황",
  materialInput: "자재등록",
  materials: "자재현황",
  summary: "최종현황",
  settings: "환경설정"
};

const kindLabels = {
  labor: "인력",
  equipment: "장비",
  shared: "공투"
};

const syncLabels = {
  synced: "원본",
  sent: "전송시도",
  local: "로컬",
  sending: "전송중",
  failed: "전송실패"
};

const defaultProjects = normalizeProjects(appConfig.projects);

const seedState = {
  activeView: "input",
  activeKind: "labor",
  role: "manager",
  activeProject: defaultProjects[0]?.name || "제천2덕동골",
  projects: defaultProjects,
  syncEndpoint: "",
  lastSync: "",
  summaryTab: "total",
  summaryFocus: {},
  extraSummaryItems: [],
  draft: [],
  config: normalizeConfig(sourceData.config),
  entries: normalizeEntries(sourceData.workEntries),
  materialOrders: normalizeMaterialOrders(sourceData.materialOrders),
  dashboard: sourceData.dashboard || {}
};

let state = loadState();
const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  initializeDefaults();
  renderAll();
});

function cacheElements() {
  Object.assign(elements, {
    todayLabel: document.querySelector("#todayLabel"),
    viewTitle: document.querySelector("#viewTitle"),
    projectSelect: document.querySelector("#projectSelect"),
    sidebarStatus: document.querySelector("#sidebarStatus"),
    navItems: Array.from(document.querySelectorAll(".nav-item")),
    views: Array.from(document.querySelectorAll(".view")),
    metricLabelA: document.querySelector("#metricLabelA"),
    metricLabelB: document.querySelector("#metricLabelB"),
    metricLabelC: document.querySelector("#metricLabelC"),
    metricLabelD: document.querySelector("#metricLabelD"),
    metricEntries: document.querySelector("#metricEntries"),
    metricLabor: document.querySelector("#metricLabor"),
    metricEquipment: document.querySelector("#metricEquipment"),
    metricWarnings: document.querySelector("#metricWarnings"),
    entryForm: document.querySelector("#entryForm"),
    entryDate: document.querySelector("#entryDate"),
    mainProcess: document.querySelector("#mainProcess"),
    subProcess: document.querySelector("#subProcess"),
    detailProcess: document.querySelector("#detailProcess"),
    segmentButtons: Array.from(document.querySelectorAll(".segment")),
    resourceCountLabel: document.querySelector("#resourceCountLabel"),
    resourceCount: document.querySelector("#resourceCount"),
    resourceRows: document.querySelector("#resourceRows"),
    entryMemo: document.querySelector("#entryMemo"),
    addDraftButton: document.querySelector("#addDraftButton"),
    draftTray: document.querySelector("#draftTray"),
    draftList: document.querySelector("#draftList"),
    draftCount: document.querySelector("#draftCount"),
    logDateFilter: document.querySelector("#logDateFilter"),
    logProcessFilter: document.querySelector("#logProcessFilter"),
    clearLogFilters: document.querySelector("#clearLogFilters"),
    logTableBody: document.querySelector("#logTableBody"),
    materialForm: document.querySelector("#materialForm"),
    materialDate: document.querySelector("#materialDate"),
    materialProcess: document.querySelector("#materialProcess"),
    materialProduct: document.querySelector("#materialProduct"),
    materialVendor: document.querySelector("#materialVendor"),
    materialArea: document.querySelector("#materialArea"),
    materialOrderAmount: document.querySelector("#materialOrderAmount"),
    materialLowPrice: document.querySelector("#materialLowPrice"),
    materialHighPrice: document.querySelector("#materialHighPrice"),
    materialCreditAmount: document.querySelector("#materialCreditAmount"),
    materialMemo: document.querySelector("#materialMemo"),
    materialList: document.querySelector("#materialList"),
    materialCount: document.querySelector("#materialCount"),
    materialProcessFilter: document.querySelector("#materialProcessFilter"),
    materialSearch: document.querySelector("#materialSearch"),
    materialTableBody: document.querySelector("#materialTableBody"),
    summaryStart: document.querySelector("#summaryStart"),
    summaryEnd: document.querySelector("#summaryEnd"),
    summaryCards: document.querySelector("#summaryCards"),
    summaryTabs: document.querySelector("#summaryTabs"),
    summaryChartTitle: document.querySelector("#summaryChartTitle"),
    summaryChartMode: document.querySelector("#summaryChartMode"),
    summaryChart: document.querySelector("#summaryChart"),
    summaryExtraForm: document.querySelector("#summaryExtraForm"),
    summaryExtraName: document.querySelector("#summaryExtraName"),
    summaryExtraAmount: document.querySelector("#summaryExtraAmount"),
    summaryExtraType: document.querySelector("#summaryExtraType"),
    summaryExtraList: document.querySelector("#summaryExtraList"),
    processSettings: document.querySelector("#processSettings"),
    processAddForm: document.querySelector("#processAddForm"),
    newProcessName: document.querySelector("#newProcessName"),
    subProcessAddForm: document.querySelector("#subProcessAddForm"),
    subProcessParent: document.querySelector("#subProcessParent"),
    newSubProcessName: document.querySelector("#newSubProcessName"),
    equipmentSettings: document.querySelector("#equipmentSettings"),
    laborSettings: document.querySelector("#laborSettings"),
    paymentSettings: document.querySelector("#paymentSettings"),
    syncEndpoint: document.querySelector("#syncEndpoint"),
    saveSyncButton: document.querySelector("#saveSyncButton"),
    restoreSyncButton: document.querySelector("#restoreSyncButton"),
    syncState: document.querySelector("#syncState"),
    quickAddForm: document.querySelector("#quickAddForm"),
    quickAddType: document.querySelector("#quickAddType"),
    quickAddName: document.querySelector("#quickAddName"),
    resetDataButton: document.querySelector("#resetDataButton"),
    exportButton: document.querySelector("#exportButton"),
    emptyStateTemplate: document.querySelector("#emptyStateTemplate")
  });
}

function bindEvents() {
  elements.navItems.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  elements.projectSelect.addEventListener("change", () => {
    state.activeProject = elements.projectSelect.value;
    saveState();
    renderAll();
  });

  elements.mainProcess.addEventListener("change", renderSubProcessOptions);

  elements.segmentButtons.forEach((button) => {
    button.addEventListener("click", () => setKind(button.dataset.kind));
  });

  elements.resourceCount.addEventListener("change", () => {
    renderResourceRows();
  });

  elements.resourceRows.addEventListener("change", (event) => {
    if (event.target.matches(".resource-item, .resource-work, .resource-payment")) {
      updateResourceRowCost(event.target.closest(".resource-row"));
    }
  });

  elements.resourceRows.addEventListener("input", (event) => {
    if (event.target.matches(".resource-cost")) {
      event.target.dataset.auto = "false";
    }
  });

  elements.addDraftButton.addEventListener("click", () => {
    const entries = buildEntriesFromForm();
    if (!entries) return;
    state.draft.push(...entries);
    saveState();
    clearEntryDetailFields();
    renderDrafts();
    renderMetrics();
  });

  elements.entryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await commitWorkEntries();
  });

  elements.logDateFilter.addEventListener("change", renderLogs);
  elements.logProcessFilter.addEventListener("change", renderLogs);
  elements.clearLogFilters.addEventListener("click", () => {
    elements.logDateFilter.value = "";
    elements.logProcessFilter.value = "";
    renderLogs();
  });

  elements.materialForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await commitMaterialOrder();
  });

  elements.materialProcessFilter.addEventListener("change", renderMaterialTable);
  elements.materialSearch.addEventListener("input", renderMaterialTable);
  elements.summaryStart.addEventListener("change", renderSummary);
  elements.summaryEnd.addEventListener("change", renderSummary);
  elements.summaryTabs.querySelectorAll("[data-summary-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.summaryTab = button.dataset.summaryTab;
      state.summaryFocus = {};
      saveState();
      renderSummary();
    });
  });

  elements.summaryExtraForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addSummaryExtraItem();
  });

  elements.saveSyncButton.addEventListener("click", () => {
    const endpoint = elements.syncEndpoint.value.trim();
    const project = getActiveProject();
    project.syncEndpoint = endpoint;
    if (getActiveProjectName() === "제천2덕동골") state.syncEndpoint = endpoint;
    saveState();
    renderSyncState();
  });

  elements.restoreSyncButton.addEventListener("click", restoreFromGoogleSheet);

  elements.processAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addProcess();
  });

  elements.subProcessAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addSubProcess();
  });

  elements.quickAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    quickAddSetting();
  });

  elements.resetDataButton.addEventListener("click", () => {
    const confirmed = window.confirm("원본 시트에서 가져온 초기 상태로 되돌릴까요?");
    if (!confirmed) return;
    state = clone(seedState);
    saveState();
    initializeDefaults();
    renderAll();
  });

  elements.exportButton.addEventListener("click", syncAllPending);
}

function initializeDefaults() {
  elements.todayLabel.textContent = `오늘 ${formatDate(isoToday)}`;
  elements.entryDate.value = elements.entryDate.value || isoToday;
  elements.materialDate.value = elements.materialDate.value || isoToday;
  elements.summaryStart.value = elements.summaryStart.value || sourceData.dashboard?.constructionStartDate || shiftDate(today, -30);
  elements.summaryEnd.value = elements.summaryEnd.value || isoToday;
  renderProjectOptions();
  elements.syncEndpoint.value = getSyncEndpoint();
}

function renderAll() {
  renderNavigation();
  renderProjectOptions();
  renderOptions();
  renderKindFields();
  renderResourceRows();
  renderDrafts();
  renderMetrics();
  renderLogs();
  renderMaterialCards();
  renderMaterialTable();
  renderSummary();
  renderSettings();
  renderSyncState();
}

function renderProjectOptions() {
  const current = state.activeProject || state.projects[0]?.name || "제천2덕동골";
  fillSelect(elements.projectSelect, state.projects.map((project) => project.name));
  elements.projectSelect.value = state.projects.some((project) => project.name === current)
    ? current
    : state.projects[0]?.name || "제천2덕동골";
  state.activeProject = elements.projectSelect.value;
}

function renderNavigation() {
  if (!views[state.activeView]) state.activeView = "input";
  elements.viewTitle.textContent = views[state.activeView];
  document.querySelector(".brand-block h1").textContent = state.activeProject || "제천2덕동골";

  elements.navItems.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });

  elements.views.forEach((view) => {
    view.classList.toggle("active", view.id === `view-${state.activeView}`);
  });

  elements.sidebarStatus.textContent = getSyncEndpoint() ? "구글시트 연결됨" : "로컬 저장 모드";
}

function setView(viewName) {
  state.activeView = views[viewName] ? viewName : "input";
  saveState();
  renderNavigation();
  renderMetrics();
}

function renderOptions() {
  const mainProcesses = state.config.processes.map((process) => process.name);
  fillSelect(elements.mainProcess, mainProcesses);
  fillSelect(elements.materialProcess, mainProcesses);
  fillSelect(elements.subProcessParent, mainProcesses);
  fillSelect(elements.logProcessFilter, ["전체 공정", ...mainProcesses]);
  fillSelect(elements.materialProcessFilter, ["전체 공정", ...mainProcesses]);
  renderSubProcessOptions();
  renderResourceRows();
}

function renderSubProcessOptions() {
  const selectedMain = elements.mainProcess.value || state.config.processes[0]?.name;
  const process = state.config.processes.find((item) => item.name === selectedMain) || state.config.processes[0];
  fillSelect(elements.subProcess, process ? process.subs : []);
}

function fillSelect(select, values) {
  const current = select.value;
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || "선택 안 함";
    select.append(option);
  });
  if (values.includes(current)) {
    select.value = current;
  }
}

function setKind(kind) {
  if (kind === "shared") kind = "labor";
  state.activeKind = kind;
  saveState();
  renderKindFields();
  renderResourceRows();
}

function renderKindFields() {
  if (state.activeKind === "shared") state.activeKind = "labor";
  elements.segmentButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.kind === state.activeKind);
  });

  elements.resourceCountLabel.textContent = state.activeKind === "labor" ? "투입 인원 수" : "투입 장비 수";
  Array.from(elements.resourceCount.options).forEach((option) => {
    option.textContent = `${option.value}${state.activeKind === "labor" ? "명" : "대"}`;
  });
}

function renderResourceRows() {
  const count = Number(elements.resourceCount.value || 1);
  const existing = Array.from(elements.resourceRows.querySelectorAll(".resource-row")).map((row) => ({
    item: row.querySelector(".resource-item")?.value || "",
    workAmount: row.querySelector(".resource-work")?.value || "1",
    cost: row.querySelector(".resource-cost")?.value || "",
    costAuto: row.querySelector(".resource-cost")?.dataset.auto !== "false",
    payment: row.querySelector(".resource-payment")?.value || ""
  }));

  elements.resourceRows.innerHTML = "";
  for (let index = 0; index < count; index += 1) {
    const prior = existing[index] || {};
    const row = document.createElement("div");
    row.className = "resource-row";
    row.innerHTML = `
      <div class="resource-row-title">${state.activeKind === "labor" ? "인력" : "장비"} ${index + 1}</div>
      <label>
        <span>${state.activeKind === "labor" ? "인력" : "장비"}</span>
        <select class="resource-item"></select>
      </label>
      <label>
        <span>투입공수</span>
        <select class="resource-work">
          <option value="1">일공수</option>
          <option value="0.5">반공수</option>
        </select>
      </label>
      <label>
        <span>비용</span>
        <input class="resource-cost" type="number" min="0" step="1000" data-auto="${prior.costAuto === false ? "false" : "true"}">
      </label>
      <label>
        <span>결제여부</span>
        <select class="resource-payment"></select>
      </label>
    `;

    const itemSelect = row.querySelector(".resource-item");
    fillSelect(itemSelect, state.activeKind === "labor" ? state.config.labor : state.config.equipment);
    if (prior.item && Array.from(itemSelect.options).some((option) => option.value === prior.item)) itemSelect.value = prior.item;

    const workSelect = row.querySelector(".resource-work");
    workSelect.value = ["1", "0.5"].includes(String(prior.workAmount)) ? String(prior.workAmount) : "1";

    const paymentSelect = row.querySelector(".resource-payment");
    fillSelect(paymentSelect, ["", ...state.config.payments]);
    if (prior.payment && Array.from(paymentSelect.options).some((option) => option.value === prior.payment)) paymentSelect.value = prior.payment;

    const costInput = row.querySelector(".resource-cost");
    costInput.value = prior.cost || "";
    elements.resourceRows.append(row);
    updateResourceRowCost(row);
  }
}

function updateResourceRowCost(row) {
  if (!row) return;
  const costInput = row.querySelector(".resource-cost");
  if (costInput.value && costInput.dataset.auto === "false") return;

  const item = row.querySelector(".resource-item")?.value || "";
  const workAmount = numberOrBlank(row.querySelector(".resource-work")?.value);
  const entry = state.activeKind === "labor"
    ? { labor: item, workAmount }
    : { equipment: item, workAmount };
  costInput.value = estimateCost(entry) || "";
  costInput.dataset.auto = "true";
}

function buildEntriesFromForm() {
  const formDate = elements.entryDate.value;
  const mainProcess = elements.mainProcess.value;
  const subProcess = elements.subProcess.value;

  if (!formDate || !mainProcess || !subProcess) {
    window.alert("날짜, 주공정, 부공정을 먼저 선택해주세요.");
    return null;
  }

  const rows = Array.from(elements.resourceRows.querySelectorAll(".resource-row"));
  if (rows.length === 0) {
    window.alert("투입 항목을 먼저 선택해주세요.");
    return null;
  }

  const entries = rows.map((row) => {
    const item = row.querySelector(".resource-item")?.value || "";
    const workAmount = numberOrBlank(row.querySelector(".resource-work")?.value);
    const equipment = state.activeKind === "equipment" ? item : "";
    const labor = state.activeKind === "labor" ? item : "";
    const cost = numberOrBlank(row.querySelector(".resource-cost")?.value) || estimateCost({ equipment, labor, workAmount });

    return {
      id: cryptoId(),
      project: getActiveProjectName(),
      date: formDate,
      mainProcess,
      subProcess,
      detailProcess: elements.detailProcess.value.trim(),
      equipment,
      labor,
      workAmount,
      costType: labor ? "인건비" : "장비대",
      cost,
      paymentStatus: row.querySelector(".resource-payment")?.value || "",
      memo: elements.entryMemo.value.trim(),
      status: "local",
      createdAt: new Date().toISOString()
    };
  });

  if (entries.some((entry) => !entry.equipment && !entry.labor)) {
    window.alert("비어 있는 인력 또는 장비 항목이 있습니다.");
    return null;
  }

  return entries;
}

async function commitWorkEntries() {
  if (state.draft.length === 0) {
    const entries = buildEntriesFromForm();
    if (!entries) return;
    state.draft.push(...entries);
  }

  const entriesToSave = state.draft.map((entry) => ({
    ...entry,
    status: getSyncEndpoint() ? "sending" : "local"
  }));

  state.entries.unshift(...entriesToSave);
  state.draft = [];
  saveState();
  renderAll();

  if (getSyncEndpoint()) {
    const sent = await syncPayload("workEntries", entriesToSave);
    updateEntrySyncStatus(entriesToSave, sent ? "sent" : "failed");
    if (sent) await syncSharedBackup();
  }

  clearEntryDetailFields();
  setView("logs");
  renderAll();
}

function updateEntrySyncStatus(savedEntries, status) {
  const ids = new Set(savedEntries.map((entry) => entry.id));
  state.entries = state.entries.map((entry) => ids.has(entry.id) ? { ...entry, status } : entry);
  if (status === "sent") state.lastSync = new Date().toISOString();
  saveState();
}

function clearEntryDetailFields() {
  elements.detailProcess.value = "";
  elements.entryMemo.value = "";
  elements.resourceCount.value = "1";
  renderResourceRows();
}

function renderDrafts() {
  elements.draftCount.textContent = `${state.draft.length}건`;
  elements.draftList.innerHTML = "";
  elements.draftTray.classList.toggle("hidden", state.draft.length === 0);

  if (state.draft.length === 0) {
    return;
  }

  state.draft.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "draft-card";
    card.innerHTML = `
      <header>
        <strong>${escapeHtml(entry.mainProcess)}</strong>
        <div class="row-actions">
          <button class="icon-btn delete" type="button" title="삭제" data-draft-delete="${entry.id}">X</button>
        </div>
      </header>
      <p>${escapeHtml(entry.subProcess)}${entry.detailProcess ? ` · ${escapeHtml(entry.detailProcess)}` : ""}</p>
      <p>${entry.equipment ? `장비 ${escapeHtml(entry.equipment)}` : `인력 ${escapeHtml(entry.labor)}`} · ${formatWorkAmount(entry.workAmount)}</p>
      <p>${escapeHtml(entry.costType)} · ${formatMoney(entry.cost)}</p>
    `;
    elements.draftList.append(card);
  });

  elements.draftList.querySelectorAll("[data-draft-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.draft = state.draft.filter((entry) => entry.id !== button.dataset.draftDelete);
      saveState();
      renderDrafts();
      renderMetrics();
    });
  });

}

function renderMetrics() {
  if (["input", "logs"].includes(state.activeView)) {
  const todayEntries = todayWorkEntries();
    const labor = sum(todayEntries.filter((entry) => entry.labor).map((entry) => Number(entry.workAmount || 0)));
    const equipment = todayEntries.filter((entry) => entry.equipment).length;
    const pending = state.entries.filter((entry) => ["local", "failed"].includes(entry.status)).length + state.draft.length;
    setMetrics("오늘 업무", `${todayEntries.length}건`, "투입 공수", labor.toFixed(1), "투입 장비", `${equipment}대`, "확인 필요", `${pending}건`);
    return;
  }

  if (["materialInput", "materials"].includes(state.activeView)) {
    const todayMaterials = state.materialOrders.filter((order) => order.date === isoToday);
  const projectMaterials = projectMaterialOrders();
  const materialCost = sum(projectMaterials.map((order) => Number(order.orderAmount || 0)));
  const credit = sum(projectMaterials.map((order) => Number(order.creditAmount || 0)));
  const comparisonProfit = sum(projectMaterials.map((order) => Math.max(0, Number(order.highPrice || 0) - Number(order.orderAmount || 0))));
    setMetrics("오늘 자재", `${todayMaterials.length}건`, "발주 금액", formatMoney(materialCost), "외상금액", formatMoney(credit), "비교 이익", formatMoney(comparisonProfit));
    return;
  }

  if (state.activeView === "summary") {
    const totals = calculateTotals(filteredWorkRows(), filteredMaterialRows());
    setMetrics("총 공사비", formatMoney(totals.totalCost), "인건비", formatMoney(totals.laborCost), "자재비", formatMoney(totals.materialCost), "외상", formatMoney(totals.credit));
    return;
  }

  const subCount = sum(state.config.processes.map((process) => process.subs.length));
  setMetrics("주공정", `${state.config.processes.length}개`, "부공정", `${subCount}개`, "장비", `${state.config.equipment.length}개`, "인력", `${state.config.labor.length}개`);
}

function setMetrics(labelA, valueA, labelB, valueB, labelC, valueC, labelD, valueD) {
  elements.metricLabelA.textContent = labelA;
  elements.metricEntries.textContent = valueA;
  elements.metricLabelB.textContent = labelB;
  elements.metricLabor.textContent = valueB;
  elements.metricLabelC.textContent = labelC;
  elements.metricEquipment.textContent = valueC;
  elements.metricLabelD.textContent = labelD;
  elements.metricWarnings.textContent = valueD;
}

function renderLogs() {
  const dateFilter = elements.logDateFilter.value;
  const processFilter = elements.logProcessFilter.value;
  const canManage = state.role === "manager";

  const rows = projectEntries().filter((entry) => {
    const dateMatch = !dateFilter || entry.date === dateFilter;
    const processMatch = !processFilter || processFilter === "전체 공정" || entry.mainProcess === processFilter;
    return dateMatch && processMatch;
  });

  elements.logTableBody.innerHTML = "";

  if (rows.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="13">${emptyState().outerHTML}</td>`;
    elements.logTableBody.append(row);
    return;
  }

  rows.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(entry.date)}</td>
      <td>${escapeHtml(entry.mainProcess)}</td>
      <td>${escapeHtml(entry.subProcess)}</td>
      <td>${escapeHtml(entry.detailProcess || "")}</td>
      <td>${escapeHtml(entry.equipment || "")}</td>
      <td>${escapeHtml(entry.labor || "")}</td>
      <td>${formatWorkAmount(entry.workAmount)}</td>
      <td>${escapeHtml(entry.costType || "")}</td>
      <td>${formatMoney(entry.cost)}</td>
      <td>${escapeHtml(entry.paymentStatus || "")}</td>
      <td>${escapeHtml(entry.memo || "")}</td>
      <td><span class="status-badge ${entry.status === "failed" ? "pending" : "done"}">${syncLabels[entry.status] || entry.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn delete" type="button" title="삭제" data-delete="${entry.id}" ${canManage && entry.status !== "synced" ? "" : "disabled"}>X</button>
        </div>
      </td>
    `;
    elements.logTableBody.append(tr);
  });

  elements.logTableBody.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteEntry(button.dataset.delete));
  });
}

function deleteEntry(id) {
  const confirmed = window.confirm("이 업무현황 항목을 앱에서 삭제할까요?");
  if (!confirmed) return;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  saveState();
  renderAll();
}

async function commitMaterialOrder() {
  const order = {
    id: cryptoId(),
    project: getActiveProjectName(),
    date: elements.materialDate.value || isoToday,
    process: elements.materialProcess.value,
    product: elements.materialProduct.value.trim(),
    vendor: elements.materialVendor.value.trim(),
    area: elements.materialArea.value.trim(),
    orderAmount: numberOrBlank(elements.materialOrderAmount.value),
    lowPrice: numberOrBlank(elements.materialLowPrice.value),
    highPrice: numberOrBlank(elements.materialHighPrice.value),
    memo: elements.materialMemo.value.trim(),
    creditAmount: numberOrBlank(elements.materialCreditAmount.value),
    status: getSyncEndpoint() ? "sending" : "local",
    createdAt: new Date().toISOString()
  };

  if (!order.process || !order.product) {
    window.alert("공정과 제품명을 입력해주세요.");
    return;
  }

  state.materialOrders.unshift(order);
  saveState();
  clearMaterialForm();
  renderAll();

  if (getSyncEndpoint()) {
    const sent = await syncPayload("materialOrders", [order]);
    state.materialOrders = state.materialOrders.map((item) => item.id === order.id ? { ...item, status: sent ? "sent" : "failed" } : item);
    if (sent) state.lastSync = new Date().toISOString();
    saveState();
    if (sent) await syncSharedBackup();
  }

  setView("materials");
  renderAll();
}

function clearMaterialForm() {
  elements.materialProduct.value = "";
  elements.materialVendor.value = "";
  elements.materialArea.value = "";
  elements.materialOrderAmount.value = "";
  elements.materialLowPrice.value = "";
  elements.materialHighPrice.value = "";
  elements.materialCreditAmount.value = "";
  elements.materialMemo.value = "";
}

function renderMaterialCards() {
  elements.materialList.innerHTML = "";
  const projectMaterials = projectMaterialOrders();
  elements.materialCount.textContent = `${projectMaterials.length}건`;

  const recent = projectMaterials.slice(0, 5);
  if (recent.length === 0) {
    elements.materialList.append(emptyState());
    return;
  }

  recent.forEach((material) => {
    const row = document.createElement("article");
    row.className = `material-row ${Number(material.creditAmount || 0) > 0 ? "low" : ""}`;
    row.innerHTML = `
      <header>
        <strong>${escapeHtml(material.product || "제품명 없음")}</strong>
        <span class="pill ${Number(material.creditAmount || 0) > 0 ? "" : "muted"}">${formatMoney(material.orderAmount)}</span>
      </header>
      <p>${formatDate(material.date)} · ${escapeHtml(material.process || "")} · ${escapeHtml(material.vendor || "")}</p>
      <div class="material-meta">
        <span>비교 ${formatMoney(Number(material.highPrice || 0) - Number(material.orderAmount || 0))}</span>
        <span>외상 ${formatMoney(material.creditAmount)}</span>
      </div>
    `;
    elements.materialList.append(row);
  });
}

function renderMaterialTable() {
  const processFilter = elements.materialProcessFilter.value;
  const search = elements.materialSearch.value.trim().toLowerCase();
  const rows = projectMaterialOrders().filter((order) => {
    const processMatch = !processFilter || processFilter === "전체 공정" || order.process === processFilter;
    const searchText = `${order.product} ${order.vendor} ${order.memo}`.toLowerCase();
    return processMatch && (!search || searchText.includes(search));
  });

  elements.materialTableBody.innerHTML = "";
  if (rows.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="11">${emptyState().outerHTML}</td>`;
    elements.materialTableBody.append(row);
    return;
  }

  rows.forEach((order) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(order.date)}</td>
      <td>${escapeHtml(order.process)}</td>
      <td>${escapeHtml(order.product)}</td>
      <td>${escapeHtml(order.vendor)}</td>
      <td>${escapeHtml(order.area)}</td>
      <td>${formatMoney(order.orderAmount)}</td>
      <td>${formatMoney(order.lowPrice)}</td>
      <td>${formatMoney(order.highPrice)}</td>
      <td>${escapeHtml(order.memo)}</td>
      <td>${formatMoney(order.creditAmount)}</td>
      <td><span class="status-badge ${order.status === "failed" ? "pending" : "done"}">${syncLabels[order.status] || order.status || "원본"}</span></td>
    `;
    elements.materialTableBody.append(tr);
  });
}

function renderSummary() {
  const workRows = filteredWorkRows();
  const materialRows = filteredMaterialRows();
  const totals = calculateTotals(workRows, materialRows);
  const startDate = getProjectStartDate(workRows, materialRows);
  const workDays = countUnique(workRows.map((row) => row.date));
  const elapsedDays = startDate ? daysBetween(startDate, isoToday) + 1 : 0;

  const stats = [
    { label: "총공사비", value: formatMoney(totals.totalCost), tone: "total" },
    { label: "현지출액", value: formatMoney(Math.max(0, totals.totalCost - totals.credit)), tone: "spent" },
    { label: "외상", value: formatMoney(totals.credit), tone: "credit" },
    ...projectExtraSummaryItems().map((item) => ({
      label: item.name,
      value: formatMoney(item.amount),
      tone: item.type === "credit" ? "credit" : "spent"
    })),
    { label: "공사 시작일", value: formatDate(startDate) },
    { label: "작업일", value: `${workDays}일` },
    { label: "경과일", value: `${elapsedDays}일` },
    { label: "자재비교이익", value: formatMoney(totals.comparisonProfit), tone: "profit" }
  ];

  elements.summaryCards.innerHTML = "";
  stats.forEach((card) => {
    const el = document.createElement("article");
    el.className = `absolute-stat ${card.tone ? `stat-${card.tone}` : ""}`;
    el.innerHTML = `<span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong>`;
    elements.summaryCards.append(el);
  });

  elements.summaryTabs.querySelectorAll("[data-summary-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.summaryTab === state.summaryTab);
  });

  renderSummaryChart(workRows, materialRows, totals);
  renderSummaryExtraList();
}

function renderSummaryChart(workRows, materialRows, totals) {
  const tab = state.summaryTab || "total";

  if (tab === "process") {
    const processRows = buildProcessCostRows(workRows, materialRows).filter((row) => Number(row.total || 0) > 0);
    const selected = state.summaryFocus.process || processRows[0]?.process || state.config.processes[0]?.name;
    const selectedRow = processRows.find((row) => row.process === selected) || processRows[0];
    elements.summaryChartTitle.textContent = "공정별 비용";
    elements.summaryChartMode.textContent = selectedRow ? selectedRow.process : "공정 선택";
    elements.summaryChart.innerHTML = "";
    renderDrillButtons(elements.summaryChart, processRows.map((row) => row.process), selected, (value) => {
      state.summaryFocus.process = value;
      saveState();
      renderSummary();
    });
    if (selectedRow) {
      renderPieChart(elements.summaryChart, [
        { name: "자재비", value: selectedRow.material },
        { name: "인건비", value: selectedRow.labor },
        { name: "장비대", value: selectedRow.equipment }
      ]);
    } else {
      elements.summaryChart.append(emptyState());
    }
    return;
  }

  if (tab === "category") {
    const categories = [
      { key: "material", name: "자재비" },
      { key: "labor", name: "인건비" },
      { key: "equipment", name: "장비대" },
      ...projectExtraSummaryItems().map((item) => ({ key: `extra:${item.id}`, name: item.name })),
      { key: "credit", name: "외상" }
    ];
    const selected = state.summaryFocus.category || categories[0].key;
    const selectedCategory = categories.find((item) => item.key === selected) || categories[0];
    elements.summaryChartTitle.textContent = "항목별 비용";
    elements.summaryChartMode.textContent = selectedCategory.name;
    elements.summaryChart.innerHTML = "";
    renderDrillButtons(elements.summaryChart, categories.map((item) => item.name), selectedCategory.name, (value) => {
      state.summaryFocus.category = categories.find((item) => item.name === value)?.key || "material";
      saveState();
      renderSummary();
    });
    renderBarChart(elements.summaryChart, buildCategoryBreakdownRows(selectedCategory.key, workRows, materialRows));
    return;
  }

  const tabMap = {
    total: {
      title: "전체 비용",
      mode: "원형 그래프",
      type: "pie",
    rows: [
        { name: "인건비", value: totals.laborCost },
        { name: "자재비", value: totals.materialCost },
        { name: "장비대", value: totals.equipmentCost },
        ...projectExtraSummaryItems().map((item) => ({ name: item.name, value: Number(item.amount || 0) }))
      ]
    },
    category: {
      title: "항목별 비용",
      mode: "막대 그래프",
      type: "bar",
      rows: [
        { name: "인건비", value: totals.laborCost },
        { name: "자재비", value: totals.materialCost },
        { name: "장비대", value: totals.equipmentCost },
        ...projectExtraSummaryItems().map((item) => ({ name: item.name, value: Number(item.amount || 0) })),
        { name: "외상", value: totals.credit }
      ]
    },
    process: {
      title: "공정별 비용",
      mode: "막대 그래프",
      type: "bar",
      rows: buildProcessCostRows(workRows, materialRows).map((row) => ({
        name: row.process,
        value: row.total,
        meta: `자재 ${formatMoney(row.material)} · 인건비 ${formatMoney(row.labor)} · 장비 ${formatMoney(row.equipment)}`
      }))
    },
    vendor: {
      title: "업체별 발주",
      mode: "상위 업체",
      type: "rank",
      rows: groupSum(materialRows, (row) => row.vendor || "업체 미입력", (row) => Number(row.orderAmount || 0)).slice(0, 10)
    },
    payment: {
      title: "결제·외상",
      mode: "관리 항목",
      type: "rank",
      rows: buildPaymentRows(workRows, materialRows).slice(0, 10)
    }
  };

  const config = tabMap[tab] || tabMap.total;
  elements.summaryChartTitle.textContent = config.title;
  elements.summaryChartMode.textContent = config.mode;
  elements.summaryChart.innerHTML = "";

  if (config.type === "pie") {
    renderPieChart(elements.summaryChart, config.rows);
    return;
  }

  if (config.type === "rank") {
    renderRankList(elements.summaryChart, config.rows, "금액");
    return;
  }

  renderBarChart(elements.summaryChart, config.rows);
}

function renderDrillButtons(container, values, selected, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "drill-tabs";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `drill-tab ${value === selected ? "active" : ""}`;
    button.textContent = value;
    button.addEventListener("click", () => onSelect(value));
    wrap.append(button);
  });
  container.append(wrap);
}

function buildCategoryBreakdownRows(category, workRows, materialRows) {
  if (category.startsWith("extra:")) {
    const item = projectExtraSummaryItems().find((entry) => `extra:${entry.id}` === category);
    return item ? [{ name: item.name, value: Number(item.amount || 0) }] : [];
  }

  if (category === "credit") {
    const rows = groupSum(materialRows, (row) => row.process || "공정 미입력", (row) => Number(row.creditAmount || 0));
    const extras = projectExtraSummaryItems()
      .filter((item) => item.type === "credit")
      .map((item) => ({ name: item.name, value: Number(item.amount || 0) }));
    return [...rows, ...extras];
  }

  return state.config.processes.map((process) => {
    const work = workRows.filter((row) => row.mainProcess === process.name);
    const material = materialRows.filter((row) => row.process === process.name);
    let value = 0;
    if (category === "material") value = sum(material.map((row) => Number(row.orderAmount || 0)));
    if (category === "labor") value = sum(work.filter((row) => row.costType === "인건비").map((row) => Number(row.cost || 0)));
    if (category === "equipment") value = sum(work.filter((row) => row.costType === "장비대").map((row) => Number(row.cost || 0)));
    return { name: process.name, value };
  });
}

function renderPieChart(container, rows) {
  const colors = ["#176f63", "#2f6ca5", "#b36b00", "#ad3e32", "#5d6470"];
  const total = sum(rows.map((row) => Number(row.value || 0)));

  if (!total) {
    container.append(emptyState());
    return;
  }

  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += (Number(row.value || 0) / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(", ");

  const wrap = document.createElement("div");
  wrap.className = "pie-chart-wrap";
  wrap.innerHTML = `
    <div class="pie-chart" style="background: conic-gradient(${stops})"></div>
    <div class="chart-legend">
      ${rows.map((row, index) => `
        <div class="legend-row">
          <span style="background:${colors[index % colors.length]}"></span>
          <strong>${escapeHtml(row.name)}</strong>
          <em>${formatMoney(row.value)} · ${Math.round((Number(row.value || 0) / total) * 100)}%</em>
        </div>
      `).join("")}
    </div>
  `;
  container.append(wrap);
}

function renderBarChart(container, rows) {
  const meaningful = rows.filter((row) => Number(row.value || 0) > 0);
  const max = Math.max(...meaningful.map((row) => Number(row.value || 0)), 1);

  if (meaningful.length === 0) {
    container.append(emptyState());
    return;
  }

  const list = document.createElement("div");
  list.className = "chart-list";
  meaningful.forEach((row) => {
    const item = document.createElement("div");
    item.className = "bar-row chart-bar-row";
    item.innerHTML = `
      <span class="bar-label">${escapeHtml(row.name)}</span>
      <div>
        <div class="bar-track"><div class="bar-fill" style="width: ${(Number(row.value || 0) / max) * 100}%"></div></div>
        ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ""}
      </div>
      <strong>${formatMoney(row.value)}</strong>
    `;
    list.append(item);
  });
  container.append(list);
}

function buildProcessCostRows(workRows, materialRows) {
  const sourceCosts = state.dashboard.processCosts || [];
  return state.config.processes.map((process) => {
    const work = workRows.filter((row) => row.mainProcess === process.name);
    const material = materialRows.filter((row) => row.process === process.name);
    const materialCost = sum(material.map((row) => Number(row.orderAmount || 0)));
    const laborCost = sum(work.filter((row) => row.costType === "인건비").map((row) => Number(row.cost || 0)));
    const equipmentCost = sum(work.filter((row) => row.costType === "장비대").map((row) => Number(row.cost || 0)));
    const source = sourceCosts.find((row) => row.process === process.name) || {};
    return {
      process: process.name,
      total: source.total || materialCost + laborCost + equipmentCost,
      material: source.material || materialCost,
      labor: source.labor || laborCost,
      equipment: source.equipment || equipmentCost
    };
  });
}

function buildPaymentRows(workRows, materialRows) {
  const payment = groupSum(workRows, (row) => row.paymentStatus || "결제 미입력", (row) => Number(row.cost || 0));
  const credit = sum(materialRows.map((row) => Number(row.creditAmount || 0)));
  const extraCredits = projectExtraSummaryItems()
    .filter((item) => item.type === "credit")
    .map((item) => ({ name: item.name, value: Number(item.amount || 0) }));
  return [{ name: "자재 외상", value: credit }, ...extraCredits, ...payment].filter((row) => row.value || row.name !== "자재 외상");
}

function renderRankList(container, rows, suffix) {
  container.innerHTML = "";
  if (rows.length === 0) {
    container.append(emptyState());
    return;
  }
  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "rank-item";
    item.innerHTML = `
      <span>${index + 1}</span>
      <strong>${escapeHtml(row.name)}</strong>
      <em>${formatMoney(row.value)} ${suffix}</em>
    `;
    container.append(item);
  });
}

function renderSettings() {
  renderProcessSettings();
  renderEditableTags(elements.equipmentSettings, "equipment", state.config.equipment);
  renderEditableTags(elements.laborSettings, "labor", state.config.labor);
  renderEditableTags(elements.paymentSettings, "payment", state.config.payments);
}

function addSummaryExtraItem() {
  const name = elements.summaryExtraName.value.trim();
  const amount = numberOrBlank(elements.summaryExtraAmount.value);
  if (!name || !amount) {
    window.alert("추가 항목명과 금액을 입력해주세요.");
    return;
  }
  state.extraSummaryItems.push({ id: cryptoId(), project: getActiveProjectName(), name, amount, type: elements.summaryExtraType.value || "spent" });
  elements.summaryExtraName.value = "";
  elements.summaryExtraAmount.value = "";
  elements.summaryExtraType.value = "spent";
  saveState();
  renderSummary();
  renderMetrics();
}

function renderSummaryExtraList() {
  elements.summaryExtraList.innerHTML = "";
  projectExtraSummaryItems().forEach((item) => {
    const button = document.createElement("button");
    button.className = "extra-chip";
    button.type = "button";
    button.innerHTML = `${escapeHtml(item.name)} <small>${item.type === "credit" ? "외상" : "현지출액"}</small> <strong>${formatMoney(item.amount)}</strong> <span>X</span>`;
    button.addEventListener("click", () => {
      state.extraSummaryItems = state.extraSummaryItems.filter((entry) => entry.id !== item.id);
      saveState();
      renderSummary();
      renderMetrics();
    });
    elements.summaryExtraList.append(button);
  });
}

function renderProcessSettings() {
  elements.processSettings.innerHTML = "";
  state.config.processes.forEach((process) => {
    const card = document.createElement("article");
    card.className = "process-card settings-process-card";
    const subTags = process.subs.map((sub) => `
      <button class="tag removable-tag" type="button" data-remove-sub="${escapeAttr(process.name)}" data-sub-name="${escapeAttr(sub)}">
        ${escapeHtml(sub)} <span>X</span>
      </button>
    `).join("");
    card.innerHTML = `
      <header>
        <strong>${escapeHtml(process.name)}</strong>
        <button class="icon-btn delete" type="button" title="주공정 삭제" data-remove-process="${escapeAttr(process.name)}">X</button>
      </header>
      <div class="tag-list">${subTags || '<span class="muted-text">부공정이 없습니다</span>'}</div>
    `;
    elements.processSettings.append(card);
  });

  elements.processSettings.querySelectorAll("[data-remove-process]").forEach((button) => {
    button.addEventListener("click", () => removeProcess(button.dataset.removeProcess));
  });
  elements.processSettings.querySelectorAll("[data-remove-sub]").forEach((button) => {
    button.addEventListener("click", () => removeSubProcess(button.dataset.removeSub, button.dataset.subName));
  });
}

function renderEditableTags(container, type, values) {
  container.innerHTML = "";
  values.forEach((value) => {
    const tag = document.createElement("button");
    tag.className = "tag removable-tag";
    tag.type = "button";
    tag.dataset.removeType = type;
    tag.dataset.removeValue = value;
    tag.innerHTML = `${escapeHtml(value)} <span>X</span>`;
    tag.addEventListener("click", () => removeSettingItem(type, value));
    container.append(tag);
  });
}

function addProcess() {
  const name = elements.newProcessName.value.trim();
  if (!name) return;
  if (!state.config.processes.some((process) => process.name === name)) {
    state.config.processes.push({ name, subs: [] });
  }
  elements.newProcessName.value = "";
  saveState();
  renderAll();
}

function addSubProcess() {
  const parent = elements.subProcessParent.value;
  const name = elements.newSubProcessName.value.trim();
  if (!parent || !name) return;

  state.config.processes = state.config.processes.map((process) => {
    if (process.name !== parent || process.subs.includes(name)) return process;
    return { ...process, subs: [...process.subs, name] };
  });
  elements.newSubProcessName.value = "";
  saveState();
  renderAll();
}

function removeProcess(name) {
  const confirmed = window.confirm(`${name} 주공정을 삭제할까요?`);
  if (!confirmed) return;
  state.config.processes = state.config.processes.filter((process) => process.name !== name);
  saveState();
  renderAll();
}

function removeSubProcess(processName, subName) {
  state.config.processes = state.config.processes.map((process) => {
    if (process.name !== processName) return process;
    return { ...process, subs: process.subs.filter((sub) => sub !== subName) };
  });
  saveState();
  renderAll();
}

function quickAddSetting() {
  const type = elements.quickAddType.value;
  const name = elements.quickAddName.value.trim();
  if (!name) return;

  const key = type === "payment" ? "payments" : type;
  if (!state.config[key].includes(name)) {
    state.config[key].push(name);
  }

  elements.quickAddName.value = "";
  saveState();
  renderAll();
}

function removeSettingItem(type, value) {
  const key = type === "payment" ? "payments" : type;
  state.config[key] = state.config[key].filter((item) => item !== value);
  saveState();
  renderAll();
}

function renderSyncState() {
  const endpoint = getSyncEndpoint();
  elements.syncEndpoint.value = endpoint;
  if (endpoint) {
    elements.syncState.textContent = state.lastSync ? `연결됨 ${formatDateTime(state.lastSync)}` : "연결됨";
    elements.syncState.classList.remove("muted");
  } else {
    elements.syncState.textContent = "로컬 저장";
    elements.syncState.classList.add("muted");
  }
}

async function syncPayload(type, records, extra = {}) {
  const endpoint = getSyncEndpoint();
  if (!endpoint) return false;
  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        spreadsheetId: getActiveProject().spreadsheetId || "",
        project: getActiveProjectName(),
        type,
        records,
        ...extra
      })
    });
    return true;
  } catch {
    return false;
  }
}

async function syncSharedBackup() {
  if (!getSyncEndpoint()) return false;
  const appStateOk = await syncPayload("appState", [], { stateData: buildSharedStatePayload() });
  const summaryOk = await syncPayload("summarySnapshot", buildSummarySnapshotRows());
  return appStateOk && summaryOk;
}

async function syncAllPending() {
  if (!getSyncEndpoint()) {
    window.alert("환경설정에서 현재 프로젝트의 Apps Script 웹앱 URL을 먼저 저장해주세요.");
    setView("settings");
    return;
  }

  const projectName = getActiveProjectName();
  let workRows = state.entries.filter((entry) => (entry.project || "제천2덕동골") === projectName && ["local", "failed"].includes(entry.status));
  let materialRows = state.materialOrders.filter((entry) => (entry.project || "제천2덕동골") === projectName && ["local", "failed"].includes(entry.status));

  if (workRows.length === 0 && materialRows.length === 0) {
    const sendAll = window.confirm("새 업무/자재 항목은 없습니다. 확인을 누르면 현재 프로젝트의 전체 업무/자재도 다시 전송합니다. 빈 시트를 처음 채울 때만 사용하세요. 취소를 누르면 최종현황과 환경설정 백업만 저장합니다.");
    if (sendAll) {
      workRows = projectEntries();
      materialRows = projectMaterialOrders();
    }
  }

  elements.exportButton.disabled = true;
  elements.exportButton.textContent = "저장 중";

  const workOk = workRows.length ? await syncPayload("workEntries", workRows) : true;
  const materialOk = materialRows.length ? await syncPayload("materialOrders", materialRows) : true;
  const backupOk = await syncSharedBackup();

  const workIds = new Set(workRows.map((entry) => entry.id));
  const materialIds = new Set(materialRows.map((entry) => entry.id));

  state.entries = state.entries.map((entry) => workIds.has(entry.id) ? { ...entry, status: workOk ? "sent" : "failed" } : entry);
  state.materialOrders = state.materialOrders.map((entry) => materialIds.has(entry.id) ? { ...entry, status: materialOk ? "sent" : "failed" } : entry);
  if (workOk && materialOk) state.lastSync = new Date().toISOString();
  saveState();
  renderAll();

  elements.exportButton.disabled = false;
  elements.exportButton.textContent = "구글시트에 저장";
  window.alert(workOk && materialOk && backupOk ? "구글시트 저장과 앱 백업 요청을 보냈습니다." : "일부 저장 요청에 실패했습니다. Apps Script URL과 권한을 확인해주세요.");
}

function buildSharedStatePayload() {
  return {
    project: getActiveProjectName(),
    savedAt: new Date().toISOString(),
    config: state.config,
    extraSummaryItems: projectExtraSummaryItems(),
    summaryRange: {
      start: elements.summaryStart.value || "",
      end: elements.summaryEnd.value || ""
    }
  };
}

function buildSummarySnapshotRows() {
  const workRows = filteredWorkRows();
  const materialRows = filteredMaterialRows();
  const totals = calculateTotals(workRows, materialRows);
  const startDate = getProjectStartDate(workRows, materialRows);
  const workDays = countUnique(workRows.map((row) => row.date));
  const elapsedDays = startDate ? daysBetween(startDate, isoToday) + 1 : 0;

  return [
    { group: "총괄", name: "총공사비", value: totals.totalCost, type: "금액" },
    { group: "총괄", name: "현지출액", value: Math.max(0, totals.totalCost - totals.credit), type: "금액" },
    { group: "총괄", name: "외상", value: totals.credit, type: "금액" },
    ...projectExtraSummaryItems().map((item) => ({
      group: "추가항목",
      name: item.name,
      value: Number(item.amount || 0),
      type: item.type === "credit" ? "외상" : "현지출액"
    })),
    { group: "일정", name: "공사 시작일", value: startDate || "", type: "날짜" },
    { group: "일정", name: "작업일", value: `${workDays}일`, type: "일수" },
    { group: "일정", name: "경과일", value: `${elapsedDays}일`, type: "일수" },
    { group: "비용분석", name: "인건비", value: totals.laborCost, type: "금액" },
    { group: "비용분석", name: "자재비", value: totals.materialCost, type: "금액" },
    { group: "비용분석", name: "장비대", value: totals.equipmentCost, type: "금액" },
    { group: "비용분석", name: "자재비교이익", value: totals.comparisonProfit, type: "금액" }
  ];
}

async function restoreFromGoogleSheet() {
  if (!getSyncEndpoint()) {
    window.alert("환경설정에서 현재 프로젝트의 Apps Script 웹앱 URL을 먼저 저장해주세요.");
    return;
  }

  const confirmed = window.confirm("현재 프로젝트의 로컬 데이터를 구글시트 백업으로 바꿀까요?");
  if (!confirmed) return;

  elements.restoreSyncButton.disabled = true;
  elements.restoreSyncButton.textContent = "불러오는 중";

  try {
    const backup = await loadSheetBackupJsonp();
    const projectName = getActiveProjectName();
    const stateData = backup.stateData || {};

    state.entries = [
      ...state.entries.filter((entry) => (entry.project || "제천2덕동골") !== projectName),
      ...normalizeEntries(backup.workEntries || []).map((entry) => ({ ...entry, project: projectName, status: "synced" }))
    ];
    state.materialOrders = [
      ...state.materialOrders.filter((entry) => (entry.project || "제천2덕동골") !== projectName),
      ...normalizeMaterialOrders(backup.materialOrders || []).map((order) => ({ ...order, project: projectName, status: "synced" }))
    ];

    if (stateData.config) {
      state.config = normalizeConfig(stateData.config);
    }

    if (Array.isArray(stateData.extraSummaryItems)) {
      state.extraSummaryItems = [
        ...state.extraSummaryItems.filter((item) => (item.project || "제천2덕동골") !== projectName),
        ...stateData.extraSummaryItems.map((item) => ({
          ...item,
          id: item.id || cryptoId(),
          project: projectName,
          type: item.type || "spent"
        }))
      ];
    }

    state.lastSync = stateData.savedAt || new Date().toISOString();
    saveState();
    renderAll();
    window.alert("구글시트 백업을 불러왔습니다.");
  } catch {
    window.alert("구글시트 백업을 불러오지 못했습니다. Apps Script 배포 권한과 URL을 확인해주세요.");
  } finally {
    elements.restoreSyncButton.disabled = false;
    elements.restoreSyncButton.textContent = "구글시트에서 불러오기";
  }
}

function loadSheetBackupJsonp() {
  return new Promise((resolve, reject) => {
    const endpoint = getSyncEndpoint();
    const callbackName = `sheetBackup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const separator = endpoint.includes("?") ? "&" : "?";
    const script = document.createElement("script");
    const timer = window.setTimeout(() => cleanup(reject, new Error("timeout")), 15000);

    function cleanup(done, value) {
      window.clearTimeout(timer);
      script.remove();
      delete window[callbackName];
      done(value);
    }

    window[callbackName] = (payload) => {
      if (payload && payload.ok) cleanup(resolve, payload);
      else cleanup(reject, new Error(payload?.message || "load failed"));
    };

    script.onerror = () => cleanup(reject, new Error("load failed"));
    script.src = `${endpoint}${separator}action=load&project=${encodeURIComponent(getActiveProjectName())}&callback=${encodeURIComponent(callbackName)}`;
    document.body.append(script);
  });
}

function estimateCost(entry) {
  const amount = Number(entry.workAmount || 1);
  if (entry.labor) {
    const match = String(entry.labor).match(/(\d+)/);
    return match ? Number(match[1]) * 10000 * amount : "";
  }
  if (String(entry.equipment).trim() === "공투") {
    return 700000 * amount;
  }
  return "";
}

function exportCsv() {
  if (["materialInput", "materials"].includes(state.activeView)) {
    const headers = ["날짜", "공정", "제품", "업체명", "지역", "발주 금액", "최저가", "최고가", "비고", "외상금액"];
    const rows = state.materialOrders.map((order) => [
      order.date,
      order.process,
      order.product,
      order.vendor,
      order.area,
      order.orderAmount,
      order.lowPrice,
      order.highPrice,
      order.memo,
      order.creditAmount
    ]);
    downloadCsv([headers, ...rows], `jecheon-materials-${isoToday}.csv`);
    return;
  }

  const headers = ["날짜", "주공정", "부공정", "세부공정", "장비", "인부", "투입공수", "비용 구분", "비용", "결제여부", "비고"];
  const rows = state.entries.map((entry) => [
    entry.date,
    entry.mainProcess,
    entry.subProcess,
    entry.detailProcess,
    entry.equipment,
    entry.labor,
    entry.workAmount,
    entry.costType,
    entry.cost,
    entry.paymentStatus,
    entry.memo
  ]);

  downloadCsv([headers, ...rows], `jecheon-worklog-${isoToday}.csv`);
}

function downloadCsv(rows, filename) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function filteredWorkRows() {
  const start = elements.summaryStart.value || "0000-01-01";
  const end = elements.summaryEnd.value || "9999-12-31";
  return projectEntries().filter((entry) => entry.date >= start && entry.date <= end);
}

function filteredMaterialRows() {
  const start = elements.summaryStart.value || "0000-01-01";
  const end = elements.summaryEnd.value || "9999-12-31";
  return projectMaterialOrders().filter((entry) => !entry.date || (entry.date >= start && entry.date <= end));
}

function todayWorkEntries() {
  return projectEntries().filter((entry) => entry.date === isoToday);
}

function getActiveProjectName() {
  return state.activeProject || state.projects[0]?.name || "제천2덕동골";
}

function getActiveProject() {
  const name = getActiveProjectName();
  let project = state.projects.find((item) => item.name === name);
  if (!project) {
    project = { name, syncEndpoint: "" };
    state.projects.push(project);
  }
  return project;
}

function getSyncEndpoint() {
  return getActiveProject().syncEndpoint || (getActiveProjectName() === "제천2덕동골" ? state.syncEndpoint : "") || "";
}

function projectEntries() {
  const name = getActiveProjectName();
  return state.entries.filter((entry) => (entry.project || "제천2덕동골") === name);
}

function projectMaterialOrders() {
  const name = getActiveProjectName();
  return state.materialOrders.filter((entry) => (entry.project || "제천2덕동골") === name);
}

function projectExtraSummaryItems() {
  const name = getActiveProjectName();
  return state.extraSummaryItems.filter((entry) => (entry.project || "제천2덕동골") === name);
}

function calculateTotals(workRows, materialRows) {
  const laborCost = sum(workRows.filter((entry) => entry.costType === "인건비").map((entry) => Number(entry.cost || 0)));
  const equipmentCost = sum(workRows.filter((entry) => entry.costType === "장비대").map((entry) => Number(entry.cost || 0)));
  const materialCost = sum(materialRows.map((entry) => Number(entry.orderAmount || 0)));
  const extraCredit = sum(projectExtraSummaryItems().filter((entry) => entry.type === "credit").map((entry) => Number(entry.amount || 0)));
  const credit = sum(materialRows.map((entry) => Number(entry.creditAmount || 0))) + extraCredit;
  const comparisonProfit = sum(materialRows.map((entry) => Math.max(0, Number(entry.highPrice || 0) - Number(entry.orderAmount || 0))));
  const extraCost = sum(projectExtraSummaryItems().map((entry) => Number(entry.amount || 0)));
  return {
    laborCost,
    equipmentCost,
    materialCost,
    extraCost,
    credit,
    comparisonProfit,
    totalCost: laborCost + equipmentCost + materialCost + extraCost
  };
}

function groupSum(rows, nameGetter, valueGetter) {
  const map = new Map();
  rows.forEach((row) => {
    const name = nameGetter(row);
    map.set(name, (map.get(name) || 0) + valueGetter(row));
  });
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function countUnique(values) {
  return new Set(values.filter(Boolean)).size;
}

function getProjectStartDate(workRows, materialRows) {
  const dates = [
    state.dashboard.constructionStartDate,
    ...workRows.map((row) => row.date),
    ...materialRows.map((row) => row.date)
  ].filter(Boolean).sort();
  return dates[0] || "";
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.floor((endDate - startDate) / 86400000));
}

function emptyState() {
  return elements.emptyStateTemplate.content.firstElementChild.cloneNode(true);
}

function normalizeProjects(projects = []) {
  const fallback = [
    { name: "제천2덕동골", syncEndpoint: "", spreadsheetId: "" },
    { name: "밀양", syncEndpoint: "", spreadsheetId: "" },
    { name: "서울", syncEndpoint: "", spreadsheetId: "" }
  ];
  const source = Array.isArray(projects) && projects.length ? projects : fallback;
  return source.map((project) => ({
    name: project.name || "프로젝트",
    syncEndpoint: project.syncEndpoint || "",
    spreadsheetId: project.spreadsheetId || ""
  }));
}

function mergeProjects(savedProjects = [], configuredProjects = []) {
  const names = [...configuredProjects, ...savedProjects].map((project) => project.name).filter(Boolean);
  return [...new Set(names)].map((name) => {
    const configured = configuredProjects.find((project) => project.name === name) || {};
    const saved = savedProjects.find((project) => project.name === name) || {};
    return {
      ...configured,
      ...saved,
      name,
      syncEndpoint: saved.syncEndpoint || configured.syncEndpoint || "",
      spreadsheetId: saved.spreadsheetId || configured.spreadsheetId || ""
    };
  });
}

function normalizeConfig(config = {}) {
  return {
    processes: config.processes?.length ? config.processes : [],
    equipment: config.equipment?.length ? config.equipment : [],
    labor: config.labor?.length ? config.labor : [],
    payments: config.payments?.length ? config.payments : [],
    workAmounts: [1, 0.5],
    costTypes: config.costTypes?.length ? config.costTypes : ["장비대", "인건비"]
  };
}

function normalizeEntries(entries = []) {
  return entries.map((entry) => ({
    id: entry.id || cryptoId(),
    project: entry.project || "제천2덕동골",
    sourceRow: entry.sourceRow || "",
    date: entry.date || "",
    mainProcess: entry.mainProcess || "",
    subProcess: entry.subProcess || "",
    detailProcess: entry.detailProcess || "",
    equipment: entry.equipment || "",
    labor: entry.labor || "",
    workAmount: entry.workAmount || "",
    costType: entry.costType || "",
    cost: entry.cost || "",
    paymentStatus: entry.paymentStatus || "",
    memo: entry.memo || "",
    status: entry.status || "synced",
    createdAt: entry.createdAt || ""
  }));
}

function normalizeMaterialOrders(materialOrders = []) {
  return materialOrders.map((order) => ({
    id: order.id || cryptoId(),
    project: order.project || "제천2덕동골",
    sourceRow: order.sourceRow || "",
    date: order.date || "",
    process: order.process || "",
    product: order.product || "",
    vendor: order.vendor || "",
    area: order.area || "",
    orderAmount: order.orderAmount || "",
    lowPrice: order.lowPrice || "",
    highPrice: order.highPrice || "",
    memo: order.memo || "",
    creditAmount: order.creditAmount || "",
    status: order.status || "synced",
    createdAt: order.createdAt || ""
  }));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return clone(seedState);

  try {
    const parsed = JSON.parse(raw);
    const loaded = {
      ...clone(seedState),
      ...parsed,
      config: {
        ...clone(seedState.config),
        ...parsed.config
      },
      entries: parsed.entries?.length ? parsed.entries.map((entry) => ({ ...entry, project: entry.project || "제천2덕동골" })) : clone(seedState.entries),
      materialOrders: parsed.materialOrders?.length ? parsed.materialOrders.map((order) => ({ ...order, project: order.project || "제천2덕동골" })) : clone(seedState.materialOrders),
      projects: mergeProjects(parsed.projects || [], clone(seedState.projects)),
      extraSummaryItems: (parsed.extraSummaryItems || []).map((item) => ({ ...item, project: item.project || "제천2덕동골", type: item.type || "spent" }))
    };
    if (loaded.syncEndpoint && loaded.projects[0] && !loaded.projects[0].syncEndpoint) {
      loaded.projects[0].syncEndpoint = loaded.syncEndpoint;
    }
    if (!views[loaded.activeView]) loaded.activeView = "input";
    if (!loaded.projects.some((project) => project.name === loaded.activeProject)) {
      loaded.activeProject = loaded.projects[0]?.name || "제천2덕동골";
    }
    return loaded;
  } catch {
    return clone(seedState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(date, offset) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return toISODate(next);
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return String(value);
  return `${year}.${month}.${day}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(toISODate(date))} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (!number) return "0원";
  return `${number.toLocaleString("ko-KR")}원`;
}

function formatWorkAmount(value) {
  if (String(value) === "1") return "일공수";
  if (String(value) === "0.5") return "반공수";
  return value || "";
}

function numberOrBlank(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isNaN(number) ? "" : number;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cryptoId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
