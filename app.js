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
  editingEntryId: "",
  editingMaterialId: "",
  draft: [],
  config: normalizeConfig(sourceData.config),
  entries: normalizeEntries(sourceData.workEntries),
  materialOrders: normalizeMaterialOrders(sourceData.materialOrders),
  dashboard: sourceData.dashboard || {}
};

let state = loadState();
const elements = {};
let savingWork = false;
let savingMaterial = false;
let syncingAll = false;

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
    cancelEntryEditButton: document.querySelector("#cancelEntryEditButton"),
    entrySubmitButton: document.querySelector("#entrySubmitButton"),
    entrySyncButton: document.querySelector("#entrySyncButton"),
    draftTray: document.querySelector("#draftTray"),
    draftList: document.querySelector("#draftList"),
    draftCount: document.querySelector("#draftCount"),
    logDateFilter: document.querySelector("#logDateFilter"),
    logEndDateFilter: document.querySelector("#logEndDateFilter"),
    logProcessFilter: document.querySelector("#logProcessFilter"),
    logDateQuickFilter: document.querySelector("#logDateQuickFilter"),
    logMainQuickFilter: document.querySelector("#logMainQuickFilter"),
    logSubQuickFilter: document.querySelector("#logSubQuickFilter"),
    logDetailFilter: document.querySelector("#logDetailFilter"),
    logEquipmentFilter: document.querySelector("#logEquipmentFilter"),
    logLaborFilter: document.querySelector("#logLaborFilter"),
    logPaymentFilter: document.querySelector("#logPaymentFilter"),
    logMemoFilter: document.querySelector("#logMemoFilter"),
    logEditBar: document.querySelector("#logEditBar"),
    logInlineSaveButton: document.querySelector("#logInlineSaveButton"),
    logInlineCancelButton: document.querySelector("#logInlineCancelButton"),
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
    cancelMaterialEditButton: document.querySelector("#cancelMaterialEditButton"),
    materialSubmitButton: document.querySelector("#materialSubmitButton"),
    materialList: document.querySelector("#materialList"),
    materialCount: document.querySelector("#materialCount"),
    materialStartDateFilter: document.querySelector("#materialStartDateFilter"),
    materialEndDateFilter: document.querySelector("#materialEndDateFilter"),
    materialProcessFilter: document.querySelector("#materialProcessFilter"),
    materialDateQuickFilter: document.querySelector("#materialDateQuickFilter"),
    materialProcessQuickFilter: document.querySelector("#materialProcessQuickFilter"),
    materialProductFilter: document.querySelector("#materialProductFilter"),
    materialVendorFilter: document.querySelector("#materialVendorFilter"),
    materialAreaFilter: document.querySelector("#materialAreaFilter"),
    materialMemoFilter: document.querySelector("#materialMemoFilter"),
    materialSearch: document.querySelector("#materialSearch"),
    clearMaterialFilters: document.querySelector("#clearMaterialFilters"),
    materialEditBar: document.querySelector("#materialEditBar"),
    materialInlineSaveButton: document.querySelector("#materialInlineSaveButton"),
    materialInlineCancelButton: document.querySelector("#materialInlineCancelButton"),
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
    projectAddForm: document.querySelector("#projectAddForm"),
    newProjectName: document.querySelector("#newProjectName"),
    newProjectEndpoint: document.querySelector("#newProjectEndpoint"),
    projectSettings: document.querySelector("#projectSettings"),
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
    state.editingEntryId = "";
    state.editingMaterialId = "";
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
    if (state.editingEntryId) {
      window.alert("수정 중에는 항목 추가를 사용할 수 없습니다. 수정 저장 또는 수정 취소를 먼저 해주세요.");
      return;
    }
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

  elements.entrySyncButton.addEventListener("click", syncAllPending);
  elements.cancelEntryEditButton.addEventListener("click", cancelEntryEdit);
  elements.logInlineSaveButton.addEventListener("click", () => saveInlineEntry(elements.logTableBody.querySelector("[data-editing-entry]")));
  elements.logInlineCancelButton.addEventListener("click", cancelEntryEdit);
  elements.logDateFilter.addEventListener("change", renderLogs);
  elements.logEndDateFilter.addEventListener("change", renderLogs);
  elements.logProcessFilter.addEventListener("change", renderLogs);
  [
    elements.logDateQuickFilter,
    elements.logMainQuickFilter,
    elements.logSubQuickFilter,
    elements.logDetailFilter,
    elements.logEquipmentFilter,
    elements.logLaborFilter,
    elements.logPaymentFilter,
    elements.logMemoFilter
  ].forEach((input) => {
    input.addEventListener(input.tagName === "INPUT" ? "input" : "change", renderLogs);
  });
  elements.clearLogFilters.addEventListener("click", () => {
    elements.logDateFilter.value = "";
    elements.logEndDateFilter.value = "";
    elements.logProcessFilter.value = "";
    elements.logDateQuickFilter.value = "";
    elements.logMainQuickFilter.value = "";
    elements.logSubQuickFilter.value = "";
    elements.logDetailFilter.value = "";
    elements.logEquipmentFilter.value = "";
    elements.logLaborFilter.value = "";
    elements.logPaymentFilter.value = "";
    elements.logMemoFilter.value = "";
    renderLogs();
  });

  elements.materialForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await commitMaterialOrder();
  });

  elements.cancelMaterialEditButton.addEventListener("click", cancelMaterialEdit);
  elements.materialInlineSaveButton.addEventListener("click", () => saveInlineMaterial(elements.materialTableBody.querySelector("[data-editing-material]")));
  elements.materialInlineCancelButton.addEventListener("click", cancelMaterialEdit);
  elements.materialStartDateFilter.addEventListener("change", renderMaterialTable);
  elements.materialEndDateFilter.addEventListener("change", renderMaterialTable);
  elements.materialProcessFilter.addEventListener("change", renderMaterialTable);
  [
    elements.materialDateQuickFilter,
    elements.materialProcessQuickFilter,
    elements.materialProductFilter,
    elements.materialVendorFilter,
    elements.materialAreaFilter,
    elements.materialMemoFilter
  ].forEach((input) => {
    input.addEventListener(input.tagName === "INPUT" ? "input" : "change", renderMaterialTable);
  });
  elements.materialSearch.addEventListener("input", renderMaterialTable);
  elements.clearMaterialFilters.addEventListener("click", () => {
    elements.materialStartDateFilter.value = "";
    elements.materialEndDateFilter.value = "";
    elements.materialProcessFilter.value = "";
    elements.materialDateQuickFilter.value = "";
    elements.materialProcessQuickFilter.value = "";
    elements.materialProductFilter.value = "";
    elements.materialVendorFilter.value = "";
    elements.materialAreaFilter.value = "";
    elements.materialMemoFilter.value = "";
    elements.materialSearch.value = "";
    renderMaterialTable();
  });
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

  elements.projectAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addProject();
  });

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
  renderEditState();
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
  if (state.activeView !== "logs") state.editingEntryId = "";
  if (state.activeView !== "materials") state.editingMaterialId = "";
  saveState();
  renderNavigation();
  renderMetrics();
  renderEditState();
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

function fillFilterSelect(select, values, allLabel = "전체") {
  const current = select.value;
  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  select.append(allOption);
  uniqueValues(values).forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  if (Array.from(select.options).some((option) => option.value === current)) {
    select.value = current;
  }
}

function getSubProcesses(mainProcess) {
  const process = state.config.processes.find((item) => item.name === mainProcess);
  return process ? process.subs : [];
}

function optionsHtml(values, selected, labels = {}) {
  const hasBlank = values.some((value) => value === "");
  const list = hasBlank ? ["", ...uniqueValues(values)] : uniqueValues(values);
  return list.map((value) => {
    const text = labels[value] || value || "선택 안 함";
    return `<option value="${escapeAttr(value)}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(text)}</option>`;
  }).join("");
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
  if (savingWork) return;
  savingWork = true;
  elements.entrySubmitButton.disabled = true;
  elements.entrySubmitButton.textContent = "저장 중";
  try {
  if (state.editingEntryId) {
    const entries = buildEntriesFromForm();
    if (!entries) return;
    if (entries.length !== 1) {
      window.alert("수정은 한 항목씩 가능합니다. 투입 수를 1개로 맞춰주세요.");
      return;
    }
    const original = state.entries.find((entry) => entry.id === state.editingEntryId);
    const updated = {
      ...entries[0],
      id: state.editingEntryId,
      createdAt: original?.createdAt || entries[0].createdAt,
      updatedAt: new Date().toISOString(),
      status: getSyncEndpoint() ? "sending" : "local"
    };
    state.entries = state.entries.map((entry) => entry.id === state.editingEntryId ? updated : entry);
    state.editingEntryId = "";
    saveState();
    renderAll();

    if (getSyncEndpoint()) {
      const sent = await syncPayload("workEntries", [updated]);
      updateEntrySyncStatus([updated], sent ? "sent" : "failed");
      if (sent) await syncSharedBackup();
    }

    clearEntryDetailFields();
    setView("logs");
    renderAll();
    return;
  }

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
  } finally {
    savingWork = false;
    elements.entrySubmitButton.disabled = false;
    renderEditState();
  }
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
  const startFilter = elements.logDateFilter.value;
  const endFilter = elements.logEndDateFilter.value;
  const processFilter = elements.logProcessFilter.value;
  const quickDate = elements.logDateQuickFilter.value;
  const quickMain = elements.logMainQuickFilter.value;
  const quickSub = elements.logSubQuickFilter.value;
  const detailText = elements.logDetailFilter.value.trim().toLowerCase();
  const quickEquipment = elements.logEquipmentFilter.value;
  const quickLabor = elements.logLaborFilter.value;
  const quickPayment = elements.logPaymentFilter.value;
  const memoText = elements.logMemoFilter.value.trim().toLowerCase();
  const canManage = state.role === "manager";
  const sourceRows = projectEntries();
  renderLogColumnFilters(sourceRows);

  const rows = sourceRows.filter((entry) => {
    const dateMatch = (!startFilter || entry.date >= startFilter) && (!endFilter || entry.date <= endFilter);
    const quickDateMatch = !quickDate || entry.date === quickDate;
    const processMatch = !processFilter || processFilter === "전체 공정" || entry.mainProcess === processFilter;
    const mainMatch = !quickMain || entry.mainProcess === quickMain;
    const subMatch = !quickSub || entry.subProcess === quickSub;
    const detailMatch = !detailText || String(entry.detailProcess || "").toLowerCase().includes(detailText);
    const equipmentMatch = !quickEquipment || entry.equipment === quickEquipment;
    const laborMatch = !quickLabor || entry.labor === quickLabor;
    const paymentMatch = !quickPayment || entry.paymentStatus === quickPayment;
    const memoMatch = !memoText || String(entry.memo || "").toLowerCase().includes(memoText);
    return dateMatch && quickDateMatch && processMatch && mainMatch && subMatch && detailMatch && equipmentMatch && laborMatch && paymentMatch && memoMatch;
  }).sort(compareDateAsc);

  elements.logTableBody.innerHTML = "";

  if (rows.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="13">${emptyState().outerHTML}</td>`;
    elements.logTableBody.append(row);
    return;
  }

  rows.forEach((entry) => {
    const tr = document.createElement("tr");
    if (state.editingEntryId === entry.id) {
      tr.dataset.editingEntry = entry.id;
      tr.innerHTML = renderEntryEditRow(entry);
      elements.logTableBody.append(tr);
      return;
    }
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
          <button class="icon-btn" type="button" title="수정" data-edit="${entry.id}" ${canManage ? "" : "disabled"}>수정</button>
          <button class="icon-btn delete" type="button" title="삭제" data-delete="${entry.id}" ${canManage ? "" : "disabled"}>X</button>
        </div>
      </td>
    `;
    elements.logTableBody.append(tr);
  });

  elements.logTableBody.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => beginEntryEdit(button.dataset.edit));
  });
  elements.logTableBody.querySelectorAll("[data-inline-main]").forEach((select) => {
    select.addEventListener("change", () => refreshInlineSubProcess(select.closest("tr")));
  });
  elements.logTableBody.querySelectorAll("[data-save-entry]").forEach((button) => {
    button.addEventListener("click", () => saveInlineEntry(button.closest("tr")));
  });
  elements.logTableBody.querySelectorAll("[data-cancel-entry]").forEach((button) => {
    button.addEventListener("click", cancelEntryEdit);
  });
  elements.logTableBody.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteEntry(button.dataset.delete));
  });
}

function renderLogColumnFilters(rows) {
  fillFilterSelect(elements.logDateQuickFilter, uniqueValues(rows.map((entry) => entry.date)), "전체 날짜");
  fillFilterSelect(elements.logMainQuickFilter, uniqueValues(rows.map((entry) => entry.mainProcess)), "전체");
  fillFilterSelect(elements.logSubQuickFilter, uniqueValues(rows.map((entry) => entry.subProcess)), "전체");
  fillFilterSelect(elements.logEquipmentFilter, uniqueValues(rows.map((entry) => entry.equipment)), "전체");
  fillFilterSelect(elements.logLaborFilter, uniqueValues(rows.map((entry) => entry.labor)), "전체");
  fillFilterSelect(elements.logPaymentFilter, uniqueValues(rows.map((entry) => entry.paymentStatus)), "전체");
}

function renderEntryEditRow(entry) {
  const mainOptions = state.config.processes.map((process) => process.name);
  const subs = getSubProcesses(entry.mainProcess);
  return `
    <td><input class="inline-cell" data-field="date" type="date" value="${escapeAttr(entry.date || "")}"></td>
    <td><select class="inline-cell" data-field="mainProcess" data-inline-main>${optionsHtml(mainOptions, entry.mainProcess)}</select></td>
    <td><select class="inline-cell" data-field="subProcess" data-inline-sub>${optionsHtml(subs, entry.subProcess)}</select></td>
    <td><input class="inline-cell" data-field="detailProcess" type="text" value="${escapeAttr(entry.detailProcess || "")}"></td>
    <td><select class="inline-cell" data-field="equipment">${optionsHtml(["", ...state.config.equipment], entry.equipment)}</select></td>
    <td><select class="inline-cell" data-field="labor">${optionsHtml(["", ...state.config.labor], entry.labor)}</select></td>
    <td><select class="inline-cell" data-field="workAmount">${optionsHtml(["1", "0.5"], String(entry.workAmount || "1"), { "1": "일공수", "0.5": "반공수" })}</select></td>
    <td><select class="inline-cell" data-field="costType">${optionsHtml(["인건비", "장비대"], entry.costType || "인건비")}</select></td>
    <td><input class="inline-cell" data-field="cost" type="number" min="0" step="1000" value="${escapeAttr(entry.cost || "")}"></td>
    <td><select class="inline-cell" data-field="paymentStatus">${optionsHtml(["", ...state.config.payments], entry.paymentStatus)}</select></td>
    <td><input class="inline-cell" data-field="memo" type="text" value="${escapeAttr(entry.memo || "")}"></td>
    <td><span class="status-badge pending">수정중</span></td>
    <td>
      <div class="row-actions">
        <button class="icon-btn approve" type="button" data-save-entry>저장</button>
        <button class="icon-btn" type="button" data-cancel-entry>취소</button>
      </div>
    </td>
  `;
}

function deleteEntry(id) {
  const target = state.entries.find((entry) => entry.id === id);
  const confirmed = window.confirm("이 업무현황 항목을 앱에서 삭제할까요?");
  if (!confirmed) return;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  saveState();
  renderAll();
  if (target && getSyncEndpoint()) {
    syncPayload("deleteWorkEntries", [target]).then((ok) => {
      if (ok) syncSharedBackup();
    });
  }
}

function beginEntryEdit(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  state.editingEntryId = id;
  state.editingMaterialId = "";
  state.draft = [];
  saveState();
  renderLogs();
  renderEditState();
}

function cancelEntryEdit() {
  state.editingEntryId = "";
  saveState();
  renderLogs();
  renderEditState();
}

function refreshInlineSubProcess(row) {
  if (!row) return;
  const main = row.querySelector("[data-field='mainProcess']")?.value || "";
  const sub = row.querySelector("[data-inline-sub]");
  fillSelect(sub, getSubProcesses(main));
}

async function saveInlineEntry(row) {
  if (!row) return;
  const id = row.dataset.editingEntry;
  const original = state.entries.find((entry) => entry.id === id);
  if (!original) return;
  const value = (field) => row.querySelector(`[data-field='${field}']`)?.value || "";
  const updated = {
    ...original,
    date: value("date") || isoToday,
    mainProcess: value("mainProcess"),
    subProcess: value("subProcess"),
    detailProcess: value("detailProcess").trim(),
    equipment: value("equipment"),
    labor: value("labor"),
    workAmount: numberOrBlank(value("workAmount")),
    costType: value("costType"),
    cost: numberOrBlank(value("cost")),
    paymentStatus: value("paymentStatus"),
    memo: value("memo").trim(),
    updatedAt: new Date().toISOString(),
    status: getSyncEndpoint() ? "sending" : "local"
  };

  if (!updated.date || !updated.mainProcess || !updated.subProcess) {
    window.alert("날짜, 주공정, 부공정은 비울 수 없습니다.");
    return;
  }

  state.entries = state.entries.map((entry) => entry.id === id ? updated : entry);
  state.editingEntryId = "";
  saveState();
  renderLogs();
  renderMetrics();

  if (getSyncEndpoint()) {
    const sent = await syncPayload("workEntries", [updated]);
    updateEntrySyncStatus([updated], sent ? "sent" : "failed");
    if (sent) await syncSharedBackup();
    renderAll();
  }
}

async function commitMaterialOrder() {
  if (savingMaterial) return;
  savingMaterial = true;
  elements.materialSubmitButton.disabled = true;
  elements.materialSubmitButton.textContent = "저장 중";
  try {
  const editId = state.editingMaterialId;
  const order = {
    id: editId || cryptoId(),
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
    createdAt: state.materialOrders.find((item) => item.id === editId)?.createdAt || new Date().toISOString(),
    updatedAt: editId ? new Date().toISOString() : ""
  };

  if (!order.process || !order.product) {
    window.alert("공정과 제품명을 입력해주세요.");
    return;
  }

  if (editId) {
    state.materialOrders = state.materialOrders.map((item) => item.id === editId ? order : item);
    state.editingMaterialId = "";
  } else {
    state.materialOrders.unshift(order);
  }
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
  } finally {
    savingMaterial = false;
    elements.materialSubmitButton.disabled = false;
    renderEditState();
  }
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
  renderEditState();
}

function beginMaterialEdit(id) {
  const order = state.materialOrders.find((item) => item.id === id);
  if (!order) return;
  state.editingMaterialId = id;
  state.editingEntryId = "";
  saveState();
  renderMaterialTable();
  renderEditState();
}

function cancelMaterialEdit() {
  state.editingMaterialId = "";
  saveState();
  renderMaterialTable();
  renderEditState();
}

async function saveInlineMaterial(row) {
  if (!row) return;
  const id = row.dataset.editingMaterial;
  const original = state.materialOrders.find((order) => order.id === id);
  if (!original) return;
  const value = (field) => row.querySelector(`[data-field='${field}']`)?.value || "";
  const updated = {
    ...original,
    date: value("date") || isoToday,
    process: value("process"),
    product: value("product").trim(),
    vendor: value("vendor").trim(),
    area: value("area").trim(),
    orderAmount: numberOrBlank(value("orderAmount")),
    lowPrice: numberOrBlank(value("lowPrice")),
    highPrice: numberOrBlank(value("highPrice")),
    memo: value("memo").trim(),
    creditAmount: numberOrBlank(value("creditAmount")),
    updatedAt: new Date().toISOString(),
    status: getSyncEndpoint() ? "sending" : "local"
  };

  if (!updated.process || !updated.product) {
    window.alert("공정과 제품명은 비울 수 없습니다.");
    return;
  }

  state.materialOrders = state.materialOrders.map((order) => order.id === id ? updated : order);
  state.editingMaterialId = "";
  saveState();
  renderMaterialTable();
  renderMaterialCards();
  renderMetrics();

  if (getSyncEndpoint()) {
    const sent = await syncPayload("materialOrders", [updated]);
    state.materialOrders = state.materialOrders.map((order) => order.id === updated.id ? { ...order, status: sent ? "sent" : "failed" } : order);
    if (sent) state.lastSync = new Date().toISOString();
    saveState();
    if (sent) await syncSharedBackup();
    renderAll();
  }
}

function deleteMaterialOrder(id) {
  const target = state.materialOrders.find((order) => order.id === id);
  const confirmed = window.confirm("이 자재현황 항목을 앱에서 삭제할까요?");
  if (!confirmed) return;
  state.materialOrders = state.materialOrders.filter((order) => order.id !== id);
  saveState();
  renderAll();
  if (target && getSyncEndpoint()) {
    syncPayload("deleteMaterialOrders", [target]).then((ok) => {
      if (ok) syncSharedBackup();
    });
  }
}

function renderEditState() {
  const editingEntry = Boolean(state.editingEntryId);
  const editingMaterial = Boolean(state.editingMaterialId);
  elements.cancelEntryEditButton.classList.toggle("hidden", !editingEntry);
  elements.addDraftButton.classList.toggle("hidden", editingEntry);
  elements.entrySubmitButton.textContent = editingEntry ? "수정 저장" : "업무현황 저장";
  elements.logEditBar.classList.toggle("hidden", !editingEntry);
  elements.cancelMaterialEditButton.classList.toggle("hidden", !editingMaterial);
  elements.materialSubmitButton.textContent = editingMaterial ? "수정 저장" : "자재현황 저장";
  elements.materialEditBar.classList.toggle("hidden", !editingMaterial);
}

function ensureSelectValue(select, value) {
  if (!select || value === undefined || value === null) return;
  const text = String(value);
  if (text && !Array.from(select.options).some((option) => option.value === text)) {
    const option = document.createElement("option");
    option.value = text;
    option.textContent = text;
    select.prepend(option);
  }
  select.value = text;
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
  const startFilter = elements.materialStartDateFilter.value;
  const endFilter = elements.materialEndDateFilter.value;
  const processFilter = elements.materialProcessFilter.value;
  const quickDate = elements.materialDateQuickFilter.value;
  const quickProcess = elements.materialProcessQuickFilter.value;
  const productText = elements.materialProductFilter.value.trim().toLowerCase();
  const vendorText = elements.materialVendorFilter.value.trim().toLowerCase();
  const areaText = elements.materialAreaFilter.value.trim().toLowerCase();
  const memoText = elements.materialMemoFilter.value.trim().toLowerCase();
  const search = elements.materialSearch.value.trim().toLowerCase();
  const sourceRows = projectMaterialOrders();
  renderMaterialColumnFilters(sourceRows);
  const rows = sourceRows.filter((order) => {
    const dateMatch = (!startFilter || order.date >= startFilter) && (!endFilter || order.date <= endFilter);
    const quickDateMatch = !quickDate || order.date === quickDate;
    const processMatch = !processFilter || processFilter === "전체 공정" || order.process === processFilter;
    const quickProcessMatch = !quickProcess || order.process === quickProcess;
    const searchText = `${order.product} ${order.vendor} ${order.memo}`.toLowerCase();
    const productMatch = !productText || String(order.product || "").toLowerCase().includes(productText);
    const vendorMatch = !vendorText || String(order.vendor || "").toLowerCase().includes(vendorText);
    const areaMatch = !areaText || String(order.area || "").toLowerCase().includes(areaText);
    const memoMatch = !memoText || String(order.memo || "").toLowerCase().includes(memoText);
    return dateMatch && quickDateMatch && processMatch && quickProcessMatch && productMatch && vendorMatch && areaMatch && memoMatch && (!search || searchText.includes(search));
  }).sort(compareDateAsc);

  elements.materialTableBody.innerHTML = "";
  if (rows.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="12">${emptyState().outerHTML}</td>`;
    elements.materialTableBody.append(row);
    return;
  }

  rows.forEach((order) => {
    const tr = document.createElement("tr");
    if (state.editingMaterialId === order.id) {
      tr.dataset.editingMaterial = order.id;
      tr.innerHTML = renderMaterialEditRow(order);
      elements.materialTableBody.append(tr);
      return;
    }
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
      <td>
        <div class="row-actions">
          <button class="icon-btn" type="button" title="수정" data-edit-material="${order.id}">수정</button>
          <button class="icon-btn delete" type="button" title="삭제" data-delete-material="${order.id}">X</button>
        </div>
      </td>
    `;
    elements.materialTableBody.append(tr);
  });

  elements.materialTableBody.querySelectorAll("[data-edit-material]").forEach((button) => {
    button.addEventListener("click", () => beginMaterialEdit(button.dataset.editMaterial));
  });
  elements.materialTableBody.querySelectorAll("[data-save-material]").forEach((button) => {
    button.addEventListener("click", () => saveInlineMaterial(button.closest("tr")));
  });
  elements.materialTableBody.querySelectorAll("[data-cancel-material]").forEach((button) => {
    button.addEventListener("click", cancelMaterialEdit);
  });
  elements.materialTableBody.querySelectorAll("[data-delete-material]").forEach((button) => {
    button.addEventListener("click", () => deleteMaterialOrder(button.dataset.deleteMaterial));
  });
}

function renderMaterialColumnFilters(rows) {
  fillFilterSelect(elements.materialDateQuickFilter, uniqueValues(rows.map((order) => order.date)), "전체 날짜");
  fillFilterSelect(elements.materialProcessQuickFilter, uniqueValues(rows.map((order) => order.process)), "전체");
}

function renderMaterialEditRow(order) {
  const mainOptions = state.config.processes.map((process) => process.name);
  return `
    <td><input class="inline-cell" data-field="date" type="date" value="${escapeAttr(order.date || "")}"></td>
    <td><select class="inline-cell" data-field="process">${optionsHtml(mainOptions, order.process)}</select></td>
    <td><input class="inline-cell" data-field="product" type="text" value="${escapeAttr(order.product || "")}"></td>
    <td><input class="inline-cell" data-field="vendor" type="text" value="${escapeAttr(order.vendor || "")}"></td>
    <td><input class="inline-cell" data-field="area" type="text" value="${escapeAttr(order.area || "")}"></td>
    <td><input class="inline-cell" data-field="orderAmount" type="number" min="0" step="1000" value="${escapeAttr(order.orderAmount || "")}"></td>
    <td><input class="inline-cell" data-field="lowPrice" type="number" min="0" step="1000" value="${escapeAttr(order.lowPrice || "")}"></td>
    <td><input class="inline-cell" data-field="highPrice" type="number" min="0" step="1000" value="${escapeAttr(order.highPrice || "")}"></td>
    <td><input class="inline-cell" data-field="memo" type="text" value="${escapeAttr(order.memo || "")}"></td>
    <td><input class="inline-cell" data-field="creditAmount" type="number" min="0" step="1000" value="${escapeAttr(order.creditAmount || "")}"></td>
    <td><span class="status-badge pending">수정중</span></td>
    <td>
      <div class="row-actions">
        <button class="icon-btn approve" type="button" data-save-material>저장</button>
        <button class="icon-btn" type="button" data-cancel-material>취소</button>
      </div>
    </td>
  `;
}

function renderSummary() {
  const workRows = filteredWorkRows();
  const materialRows = filteredMaterialRows();
  const totals = calculateTotals(workRows, materialRows);
  const startDate = getProjectStartDate(workRows, materialRows);
  const workDays = countUnique(workRows.map((row) => row.date));
  const elapsedDays = startDate ? daysBetween(startDate, isoToday) + 1 : 0;

  const moneyStats = [
    { label: "총공사비", value: formatMoney(totals.totalCost), tone: "total" },
    { label: "현지출액", value: formatMoney(Math.max(0, totals.totalCost - totals.credit)), tone: "spent" },
    { label: "외상", value: formatMoney(totals.credit), tone: "credit" },
    ...projectExtraSummaryItems().map((item) => ({
      label: item.name,
      value: formatMoney(item.amount),
      tone: item.type === "credit" ? "credit" : "spent"
    })),
    { label: "자재비교이익", value: formatMoney(totals.comparisonProfit), tone: "profit" }
  ];
  const metaStats = [
    { label: "공사 시작일", value: formatDate(startDate) },
    { label: "작업일", value: `${workDays}일` },
    { label: "경과일", value: `${elapsedDays}일` },
    { label: "업무 기록", value: `${workRows.length}건` },
    { label: "자재 기록", value: `${materialRows.length}건` }
  ];

  elements.summaryCards.innerHTML = "";
  const moneyWrap = document.createElement("div");
  moneyWrap.className = "summary-money-strip";
  moneyStats.forEach((card) => {
    const el = document.createElement("article");
    el.className = `absolute-stat ${card.tone ? `stat-${card.tone}` : ""}`;
    el.innerHTML = `<span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong>`;
    moneyWrap.append(el);
  });
  const metaWrap = document.createElement("aside");
  metaWrap.className = "summary-meta-strip";
  metaWrap.innerHTML = `
    <strong>운영 기준</strong>
    ${metaStats.map((item) => `
      <div class="summary-meta-item">
        <span>${escapeHtml(item.label)}</span>
        <em>${escapeHtml(item.value)}</em>
      </div>
    `).join("")}
  `;
  elements.summaryCards.append(moneyWrap, metaWrap);

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
  const colors = ["#7a4d24", "#b88746", "#6d7650", "#ad3e32", "#5d6470", "#a98b65"];
  const meaningful = rows.filter((row) => Number(row.value || 0) > 0);
  const total = sum(meaningful.map((row) => Number(row.value || 0)));

  if (!total) {
    container.append(emptyState());
    return;
  }

  let cursor = 0;
  const stops = meaningful.map((row, index) => {
    const start = cursor;
    cursor += (Number(row.value || 0) / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(", ");

  const wrap = document.createElement("div");
  wrap.className = "pie-chart-wrap";
  wrap.innerHTML = `
    <div class="pie-visual">
      <div class="pie-chart" style="background: conic-gradient(${stops})"></div>
      <div class="pie-center">
        <span>합계</span>
        <strong>${formatMoney(total)}</strong>
      </div>
    </div>
    <div class="chart-legend">
      ${meaningful.map((row, index) => {
        const percent = Math.round((Number(row.value || 0) / total) * 100);
        return `
        <div class="legend-row">
          <span style="background:${colors[index % colors.length]}"></span>
          <strong>${escapeHtml(row.name)}</strong>
          <em>${formatMoney(row.value)} · ${percent}%</em>
          <div class="legend-meter"><i style="width:${percent}%"></i></div>
        </div>
      `;}).join("")}
    </div>
  `;
  container.append(wrap);
}

function renderBarChart(container, rows) {
  const meaningful = rows.filter((row) => Number(row.value || 0) > 0);
  const max = Math.max(...meaningful.map((row) => Number(row.value || 0)), 1);
  const total = sum(meaningful.map((row) => Number(row.value || 0)));

  if (meaningful.length === 0) {
    container.append(emptyState());
    return;
  }

  const list = document.createElement("div");
  list.className = "chart-list";
  meaningful.forEach((row) => {
    const percentOfTotal = total ? Math.round((Number(row.value || 0) / total) * 100) : 0;
    const item = document.createElement("div");
    item.className = "bar-row chart-bar-row";
    item.innerHTML = `
      <span class="bar-label">${escapeHtml(row.name)}</span>
      <div>
        <div class="bar-track"><div class="bar-fill" style="width: ${(Number(row.value || 0) / max) * 100}%"></div></div>
        ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ""}
      </div>
      <strong>${formatMoney(row.value)} <span>${percentOfTotal}%</span></strong>
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
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "rank-item";
    item.innerHTML = `
      <span>${index + 1}</span>
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <div class="rank-meter"><i style="width:${(Number(row.value || 0) / max) * 100}%"></i></div>
      </div>
      <em>${formatMoney(row.value)} ${suffix}</em>
    `;
    container.append(item);
  });
}

function renderSettings() {
  renderProjectSettings();
  renderProcessSettings();
  renderEditableTags(elements.equipmentSettings, "equipment", state.config.equipment);
  renderEditableTags(elements.laborSettings, "labor", state.config.labor);
  renderEditableTags(elements.paymentSettings, "payment", state.config.payments);
}

function renderProjectSettings() {
  elements.projectSettings.innerHTML = "";
  state.projects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "process-card settings-process-card";
    card.innerHTML = `
      <header>
        <strong>${escapeHtml(project.name)}</strong>
        <button class="icon-btn delete" type="button" title="프로젝트 삭제" data-remove-project="${escapeAttr(project.name)}" ${state.projects.length <= 1 ? "disabled" : ""}>X</button>
      </header>
      <p>${project.syncEndpoint ? "구글시트 연결됨" : "URL 미등록"}</p>
    `;
    elements.projectSettings.append(card);
  });

  elements.projectSettings.querySelectorAll("[data-remove-project]").forEach((button) => {
    button.addEventListener("click", () => removeProject(button.dataset.removeProject));
  });
}

function addProject() {
  const name = elements.newProjectName.value.trim();
  const endpoint = elements.newProjectEndpoint.value.trim();
  if (!name) {
    window.alert("프로젝트명을 입력해주세요.");
    return;
  }
  const existing = state.projects.find((project) => project.name === name);
  if (existing) {
    existing.syncEndpoint = endpoint || existing.syncEndpoint;
  } else {
    state.projects.push({ name, syncEndpoint: endpoint, spreadsheetId: "" });
  }
  state.activeProject = name;
  elements.newProjectName.value = "";
  elements.newProjectEndpoint.value = "";
  saveState();
  renderAll();
  syncSharedBackup();
}

function removeProject(name) {
  if (state.projects.length <= 1) return;
  const confirmed = window.confirm(`${name} 프로젝트를 목록에서 삭제할까요? 구글시트 데이터는 삭제되지 않습니다.`);
  if (!confirmed) return;
  state.projects = state.projects.filter((project) => project.name !== name);
  state.entries = state.entries.filter((entry) => (entry.project || "제천2덕동골") !== name);
  state.materialOrders = state.materialOrders.filter((order) => (order.project || "제천2덕동골") !== name);
  state.extraSummaryItems = state.extraSummaryItems.filter((item) => (item.project || "제천2덕동골") !== name);
  if (state.activeProject === name) state.activeProject = state.projects[0]?.name || "제천2덕동골";
  saveState();
  renderAll();
  syncSharedBackup();
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
  const cleanupOk = await syncPayload("cleanup", []);
  return appStateOk && summaryOk && cleanupOk;
}

async function syncAllPending() {
  if (syncingAll) return;
  if (!getSyncEndpoint()) {
    window.alert("환경설정에서 현재 프로젝트의 Apps Script 웹앱 URL을 먼저 저장해주세요.");
    setView("settings");
    return;
  }
  syncingAll = true;

  const projectName = getActiveProjectName();
  dedupeProjectState(projectName);
  const workRows = state.entries.filter((entry) => (entry.project || "제천2덕동골") === projectName && ["local", "failed"].includes(entry.status));
  const materialRows = state.materialOrders.filter((entry) => (entry.project || "제천2덕동골") === projectName && ["local", "failed"].includes(entry.status));

  elements.exportButton.disabled = true;
  elements.exportButton.textContent = "저장 중";
  if (elements.entrySyncButton) {
    elements.entrySyncButton.disabled = true;
    elements.entrySyncButton.textContent = "저장 중";
  }

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
  if (elements.entrySyncButton) {
    elements.entrySyncButton.disabled = false;
    elements.entrySyncButton.textContent = "구글시트에 저장";
  }
  syncingAll = false;
  const sentCount = workRows.length + materialRows.length;
  window.alert(workOk && materialOk && backupOk
    ? sentCount
      ? `새 항목 ${sentCount}건과 앱 백업을 구글시트에 저장했습니다.`
      : "새 업무/자재 항목은 없어 앱 백업만 저장했습니다."
    : "일부 저장 요청에 실패했습니다. Apps Script URL과 권한을 확인해주세요.");
}

function buildSharedStatePayload() {
  return {
    project: getActiveProjectName(),
    savedAt: new Date().toISOString(),
    projects: state.projects,
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

    if (Array.isArray(stateData.projects) && stateData.projects.length) {
      state.projects = mergeProjects(stateData.projects, state.projects);
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

function dedupeProjectState(projectName = getActiveProjectName()) {
  const beforeWork = state.entries.length;
  const beforeMaterials = state.materialOrders.length;
  state.entries = dedupeRecords(
    state.entries,
    (entry) => (entry.project || "제천2덕동골") === projectName,
    workContentKey
  );
  state.materialOrders = dedupeRecords(
    state.materialOrders,
    (order) => (order.project || "제천2덕동골") === projectName,
    materialContentKey
  );
  if (state.entries.length !== beforeWork || state.materialOrders.length !== beforeMaterials) {
    saveState();
  }
}

function dedupeRecords(records, inScope, keyGetter) {
  const scoped = records.filter(inScope);
  const scopedKeys = new Set();
  const keepIds = new Set();
  for (let index = scoped.length - 1; index >= 0; index -= 1) {
    const record = scoped[index];
    const key = keyGetter(record);
    if (scopedKeys.has(key)) continue;
    scopedKeys.add(key);
    keepIds.add(record.id);
  }
  return records.filter((record) => !inScope(record) || keepIds.has(record.id));
}

function workContentKey(entry) {
  return [
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
  ].map(normalizeKeyPart).join("|");
}

function materialContentKey(order) {
  return [
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
  ].map(normalizeKeyPart).join("|");
}

function normalizeKeyPart(value) {
  return String(value ?? "").trim();
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

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
}

function compareDateAsc(a, b) {
  const dateA = a.date || "9999-12-31";
  const dateB = b.date || "9999-12-31";
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
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
      extraSummaryItems: (parsed.extraSummaryItems || []).map((item) => ({ ...item, project: item.project || "제천2덕동골", type: item.type || "spent" })),
      editingEntryId: "",
      editingMaterialId: ""
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
