const STORAGE_KEY = "jecheon-field-app-v2";
const REQUIRED_SCRIPT_VERSION = "secure-sync-2026-06-12";
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
  synced: "시트",
  sent: "시트저장",
  local: "저장대기",
  sending: "전송중",
  failed: "전송실패"
};
const DEFAULT_PAYMENT_STATUS = "외상";

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
  deletedRecords: { work: [], material: [] },
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
let selectedContractEntryIds = new Set();
let currentLogRows = [];
let currentMaterialRows = [];
let logSheetEditMode = false;
const projectAccessKeys = new Map();

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  bindEvents();
  initializeDefaults();
  renderAll();
  registerServiceWorker();
  await showProjectAccessGate(getActiveProjectName());
});

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // 설치 기능이 지원되지 않아도 웹 업무일지는 정상적으로 동작합니다.
    });
  });
}

function cacheElements() {
  Object.assign(elements, {
    todayLabel: document.querySelector("#todayLabel"),
    accessGate: document.querySelector("#accessGate"),
    accessForm: document.querySelector("#accessForm"),
    accessProjectSelect: document.querySelector("#accessProjectSelect"),
    accessPassword: document.querySelector("#accessPassword"),
    accessError: document.querySelector("#accessError"),
    accessSubmitButton: document.querySelector("#accessSubmitButton"),
    syncOverlay: document.querySelector("#syncOverlay"),
    syncSpinner: document.querySelector("#syncSpinner"),
    syncOverlayEyebrow: document.querySelector("#syncOverlayEyebrow"),
    syncOverlayTitle: document.querySelector("#syncOverlayTitle"),
    syncOverlayMessage: document.querySelector("#syncOverlayMessage"),
    lockProjectButton: document.querySelector("#lockProjectButton"),
    viewTitle: document.querySelector("#viewTitle"),
    brandProjectTitle: document.querySelector("#brandProjectTitle"),
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
    contractToolbar: document.querySelector("#contractToolbar"),
    contractSelectionSummary: document.querySelector("#contractSelectionSummary"),
    contractTotalAmount: document.querySelector("#contractTotalAmount"),
    applyContractButton: document.querySelector("#applyContractButton"),
    cancelContractButton: document.querySelector("#cancelContractButton"),
    clearContractSelection: document.querySelector("#clearContractSelection"),
    clearLogFilters: document.querySelector("#clearLogFilters"),
    toggleLogSheetEditButton: document.querySelector("#toggleLogSheetEditButton"),
    logBulkEditBar: document.querySelector("#logBulkEditBar"),
    logBulkField: document.querySelector("#logBulkField"),
    logBulkValue: document.querySelector("#logBulkValue"),
    applyLogBulkEdit: document.querySelector("#applyLogBulkEdit"),
    logTableSummary: document.querySelector("#logTableSummary"),
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
    materialBulkEditBar: document.querySelector("#materialBulkEditBar"),
    materialBulkField: document.querySelector("#materialBulkField"),
    materialBulkValue: document.querySelector("#materialBulkValue"),
    applyMaterialBulkEdit: document.querySelector("#applyMaterialBulkEdit"),
    materialTableSummary: document.querySelector("#materialTableSummary"),
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
    pushSyncButton: document.querySelector("#pushSyncButton"),
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
  elements.accessForm.addEventListener("submit", handleProjectAccess);
  elements.accessProjectSelect.addEventListener("change", () => {
    state.activeProject = elements.accessProjectSelect.value;
    saveState();
    elements.accessPassword.value = "";
    setAccessError("");
  });
  elements.lockProjectButton.addEventListener("click", () => showProjectAccessGate(getActiveProjectName()));

  elements.navItems.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  elements.projectSelect.addEventListener("change", async () => {
    state.activeProject = elements.projectSelect.value;
    state.editingEntryId = "";
    state.editingMaterialId = "";
    saveState();
    renderAll();
    await showProjectAccessGate(state.activeProject);
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

  if (elements.entrySyncButton) elements.entrySyncButton.addEventListener("click", pushCurrentProjectToGoogleSheet);
  elements.cancelEntryEditButton.addEventListener("click", cancelEntryEdit);
  elements.logInlineSaveButton.addEventListener("click", () => logSheetEditMode ? saveLogSheetEdits() : saveInlineEntry(elements.logTableBody.querySelector("[data-editing-entry]")));
  elements.logInlineCancelButton.addEventListener("click", () => logSheetEditMode ? cancelLogSheetEditMode() : cancelEntryEdit());
  elements.applyContractButton.addEventListener("click", applyContractDistribution);
  elements.cancelContractButton.addEventListener("click", cancelContractDistribution);
  elements.clearContractSelection.addEventListener("click", clearContractSelection);
  elements.toggleLogSheetEditButton.addEventListener("click", startLogSheetEditMode);
  elements.applyLogBulkEdit.addEventListener("click", applyLogBulkEdit);
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
  elements.applyMaterialBulkEdit.addEventListener("click", applyMaterialBulkEdit);
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
    queueSharedBackup();
  });

  elements.restoreSyncButton.addEventListener("click", restoreFromGoogleSheet);
  if (elements.pushSyncButton) elements.pushSyncButton.addEventListener("click", pushCurrentProjectToGoogleSheet);

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

  if (elements.resetDataButton) elements.resetDataButton.addEventListener("click", () => {
    const confirmed = window.confirm("원본 시트에서 가져온 초기 상태로 되돌릴까요?");
    if (!confirmed) return;
    state = clone(seedState);
    saveState();
    initializeDefaults();
    renderAll();
  });

  if (elements.exportButton) elements.exportButton.addEventListener("click", pushCurrentProjectToGoogleSheet);
}

async function showProjectAccessGate(projectName) {
  state.activeProject = projectName || state.projects[0]?.name || "제천2덕동골";
  saveState();
  fillSelect(elements.accessProjectSelect, state.projects.map((project) => project.name));
  elements.accessProjectSelect.value = state.activeProject;
  elements.accessPassword.value = "";
  setAccessError("");
  elements.accessGate.classList.remove("hidden");
  document.body.classList.add("project-locked");
  window.setTimeout(() => elements.accessPassword.focus(), 0);
}

async function handleProjectAccess(event) {
  event.preventDefault();
  const projectName = elements.accessProjectSelect.value;
  const password = elements.accessPassword.value;
  if (!projectName || !password) {
    setAccessError("프로젝트와 비밀번호를 입력해주세요.");
    return;
  }

  state.activeProject = projectName;
  saveState();
  renderAll();
  elements.accessSubmitButton.disabled = true;
  setAccessError("");

  try {
    const accessKey = await hashPassword(password);
    projectAccessKeys.set(projectName, accessKey);
    showSyncOverlay("최신 자료를 불러오는 중입니다", `${projectName} 구글시트와 동기화하고 있습니다.`);
    const restored = await restoreFromGoogleSheet({ silent: true, accessKey });
    if (!restored) throw new Error("동기화에 실패했습니다.");
    completeSyncOverlay("동기화 완료", "최신 자료로 접속합니다.");
    await wait(650);
    hideSyncOverlay();
    elements.accessGate.classList.add("hidden");
    document.body.classList.remove("project-locked");
    setView("input");
  } catch (error) {
    projectAccessKeys.delete(projectName);
    hideSyncOverlay();
    setAccessError(error.message || "비밀번호 확인 또는 동기화에 실패했습니다.");
  } finally {
    elements.accessSubmitButton.disabled = false;
  }
}

function setAccessError(message) {
  elements.accessError.textContent = message;
  elements.accessError.classList.toggle("hidden", !message);
}

async function hashPassword(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getAccessKey() {
  return projectAccessKeys.get(getActiveProjectName()) || "";
}

function showSyncOverlay(title, message = "잠시만 기다려주세요.") {
  elements.syncSpinner.classList.remove("complete");
  elements.syncOverlayEyebrow.textContent = "구글시트 동기화";
  elements.syncOverlayTitle.textContent = title;
  elements.syncOverlayMessage.textContent = message;
  elements.syncOverlay.classList.remove("hidden");
}

function completeSyncOverlay(title = "동기화 완료", message = "최신 자료가 반영되었습니다.") {
  elements.syncSpinner.classList.add("complete");
  elements.syncOverlayEyebrow.textContent = "동기화 완료";
  elements.syncOverlayTitle.textContent = title;
  elements.syncOverlayMessage.textContent = message;
}

function hideSyncOverlay() {
  elements.syncOverlay.classList.add("hidden");
}

async function runWithSyncOverlay(title, task) {
  showSyncOverlay(title);
  try {
    const result = await task();
    if (!result) throw new Error("구글시트 동기화를 확인하지 못했습니다.");
    completeSyncOverlay();
    await wait(650);
    return true;
  } catch (error) {
    elements.syncSpinner.classList.remove("complete");
    elements.syncOverlayEyebrow.textContent = "동기화 실패";
    elements.syncOverlayTitle.textContent = "구글시트 저장을 완료하지 못했습니다";
    elements.syncOverlayMessage.textContent = error.message || "연결과 비밀번호를 확인해주세요.";
    await wait(1200);
    return false;
  } finally {
    hideSyncOverlay();
  }
}

function initializeDefaults() {
  elements.todayLabel.textContent = `오늘 ${formatDate(isoToday)}`;
  elements.entryDate.value = elements.entryDate.value || isoToday;
  elements.materialDate.value = elements.materialDate.value || isoToday;
  elements.summaryStart.value = elements.summaryStart.value || sourceData.dashboard?.constructionStartDate || "";
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
  if (elements.brandProjectTitle) elements.brandProjectTitle.textContent = state.activeProject || "현장 프로젝트";
}

function renderNavigation() {
  if (!views[state.activeView]) state.activeView = "input";
  elements.viewTitle.textContent = views[state.activeView];
  if (elements.brandProjectTitle) elements.brandProjectTitle.textContent = state.activeProject || "현장 프로젝트";

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
  if (state.activeView !== "logs") {
    state.editingEntryId = "";
    logSheetEditMode = false;
  }
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
  const source = selected && !values.includes(selected) ? [...values, selected] : values;
  const list = hasBlank ? ["", ...uniqueValues(source)] : uniqueValues(source);
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
    payment: row.querySelector(".resource-payment")?.value || DEFAULT_PAYMENT_STATUS
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
    fillSelect(paymentSelect, ["", ...uniqueValues([...state.config.payments, DEFAULT_PAYMENT_STATUS])]);
    const paymentValue = prior.payment || DEFAULT_PAYMENT_STATUS;
    if (Array.from(paymentSelect.options).some((option) => option.value === paymentValue)) paymentSelect.value = paymentValue;

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
      paymentStatus: row.querySelector(".resource-payment")?.value || DEFAULT_PAYMENT_STATUS,
      memo: elements.entryMemo.value.trim(),
      contractFlag: false,
      contractTotal: "",
      contractGroupId: "",
      contractOriginalCost: "",
      contractOriginalCostType: "",
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
      const sent = await runWithSyncOverlay("수정한 업무현황을 동기화하는 중입니다", async () => {
        const workSaved = await syncPayload("workEntries", [updated]);
        return workSaved && await syncSharedBackup();
      });
      updateEntrySyncStatus([updated], sent ? "sent" : "failed");
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
    const sent = await runWithSyncOverlay("업무현황을 저장하고 동기화하는 중입니다", async () => {
      const workSaved = await syncPayload("workEntries", entriesToSave);
      return workSaved && await syncSharedBackup();
    });
    updateEntrySyncStatus(entriesToSave, sent ? "sent" : "failed");
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

function updateMaterialSyncStatus(savedOrders, status) {
  const ids = new Set(savedOrders.map((order) => order.id));
  state.materialOrders = state.materialOrders.map((order) => ids.has(order.id) ? { ...order, status } : order);
  if (status === "sent") state.lastSync = new Date().toISOString();
  saveState();
}

async function syncWorkRowsWithOverlay(rows, title) {
  if (!getSyncEndpoint()) return true;
  const sent = await runWithSyncOverlay(title, async () => {
    const workSaved = await syncPayload("workEntries", rows);
    return workSaved && await syncSharedBackup();
  });
  updateEntrySyncStatus(rows, sent ? "sent" : "failed");
  renderAll();
  return sent;
}

async function syncMaterialRowsWithOverlay(rows, title) {
  if (!getSyncEndpoint()) return true;
  const sent = await runWithSyncOverlay(title, async () => {
    const materialSaved = await syncPayload("materialOrders", rows);
    return materialSaved && await syncSharedBackup();
  });
  updateMaterialSyncStatus(rows, sent ? "sent" : "failed");
  renderAll();
  return sent;
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
    const labor = sum(todayEntries.filter((entry) => entry.labor).map((entry) => amountOf(entry.workAmount)));
    const equipment = todayEntries.filter((entry) => entry.equipment).length;
    const pending = state.entries.filter((entry) => ["local", "failed"].includes(entry.status)).length + state.draft.length;
    setMetrics("오늘 업무", `${todayEntries.length}건`, "투입 공수", labor.toFixed(1), "투입 장비", `${equipment}대`, "확인 필요", `${pending}건`);
    return;
  }

  if (["materialInput", "materials"].includes(state.activeView)) {
    const todayMaterials = state.materialOrders.filter((order) => order.date === isoToday);
  const projectMaterials = projectMaterialOrders();
  const materialCost = sum(projectMaterials.map((order) => amountOf(order.orderAmount)));
  const credit = sum(projectMaterials.map(materialCreditAmount));
  const comparisonProfit = sum(projectMaterials.map(materialComparisonProfit));
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

function renderTableSummaryCards(container, items) {
  if (!container) return;
  container.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = `table-summary-card ${item.strong ? "strong" : ""}`;
    card.innerHTML = `<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>`;
    container.append(card);
  });
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
  selectedContractEntryIds = new Set([...selectedContractEntryIds].filter((id) => sourceRows.some((entry) => entry.id === id)));
  renderLogColumnFilters(sourceRows);
  renderContractToolbar();

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

  currentLogRows = rows;
  renderWorkTableSummary(rows);
  elements.logTableBody.innerHTML = "";

  if (rows.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="14">${emptyState().outerHTML}</td>`;
    elements.logTableBody.append(row);
    return;
  }

  rows.forEach((entry) => {
    const tr = document.createElement("tr");
    if (logSheetEditMode) {
      tr.dataset.sheetEntry = entry.id;
      tr.className = "sheet-edit-row";
      tr.innerHTML = renderEntrySheetEditRow(entry);
      elements.logTableBody.append(tr);
      return;
    }
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
      <td class="${isPaidPaymentStatus(entry.paymentStatus) ? "payment-complete-cell" : ""}">${escapeHtml(entry.paymentStatus || "")}</td>
      <td>${escapeHtml(entry.memo || "")}</td>
      <td><label class="contract-check-label" title="도급 정리 선택"><input type="checkbox" data-contract-select="${entry.id}" ${selectedContractEntryIds.has(entry.id) ? "checked" : ""}><span>${entry.contractFlag ? "도급" : ""}</span></label></td>
      <td>${statusDotHtml(entry.status)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn split" type="button" title="장비대/인건비 분할" data-split-cost="${entry.id}" ${canManage && canSplitEquipmentEntry(entry) ? "" : "disabled"}>분</button>
          <button class="icon-btn delete" type="button" title="삭제" data-delete="${entry.id}" ${canManage ? "" : "disabled"}>X</button>
        </div>
      </td>
    `;
    elements.logTableBody.append(tr);
  });
  appendWorkTotalRow(rows);

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
  elements.logTableBody.querySelectorAll("[data-split-cost]").forEach((button) => {
    button.addEventListener("click", () => splitEquipmentCost(button.dataset.splitCost));
  });
  elements.logTableBody.querySelectorAll("[data-contract-select]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => toggleContractSelection(checkbox.dataset.contractSelect, checkbox.checked));
  });
}

function canSplitEquipmentEntry(entry) {
  return !entry.contractFlag && amountOf(entry.cost) > 0 && Boolean(entry.equipment || entry.costType === "장비대");
}

function renderWorkTableSummary(rows) {
  const totals = workTableTotals(rows);
  renderTableSummaryCards(elements.logTableSummary, [
    { label: "표시 행", value: `${rows.length}건` },
    { label: "총 투입공수", value: formatWorkAmountNumber(totals.workAmount) },
    { label: "인건비 합계", value: formatMoney(totals.laborCost) },
    { label: "장비대 합계", value: formatMoney(totals.equipmentCost) },
    { label: "업무 총비용", value: formatMoney(totals.totalCost), strong: true },
    { label: "결제 미입력", value: `${totals.pendingCount}건` }
  ]);
}

function appendWorkTotalRow(rows) {
  if (!rows.length) return;
  const totals = workTableTotals(rows);
  const row = document.createElement("tr");
  row.className = "table-total-row";
  row.innerHTML = `
    <td colspan="6">필터 합계</td>
    <td>${formatWorkAmountNumber(totals.workAmount)}</td>
    <td>총비용</td>
    <td>${formatMoney(totals.totalCost)}</td>
    <td colspan="2">인건비 ${formatMoney(totals.laborCost)} · 장비대 ${formatMoney(totals.equipmentCost)}</td>
    <td colspan="3">결제 미입력 ${totals.pendingCount}건</td>
  `;
  elements.logTableBody.append(row);
}

function workTableTotals(rows) {
  const laborCost = sum(rows.filter((entry) => entry.costType === "인건비").map((entry) => amountOf(entry.cost)));
  const equipmentCost = sum(rows.filter((entry) => entry.costType === "장비대").map((entry) => amountOf(entry.cost)));
  return {
    workAmount: sum(rows.map((entry) => amountOf(entry.workAmount))),
    laborCost,
    equipmentCost,
    totalCost: laborCost + equipmentCost,
    pendingCount: rows.filter((entry) => !entry.paymentStatus).length
  };
}

function renderLogColumnFilters(rows) {
  fillFilterSelect(elements.logDateQuickFilter, uniqueValues(rows.map((entry) => entry.date)), "전체 날짜");
  fillFilterSelect(elements.logMainQuickFilter, uniqueValues(rows.map((entry) => entry.mainProcess)), "전체");
  fillFilterSelect(elements.logSubQuickFilter, uniqueValues(rows.map((entry) => entry.subProcess)), "전체");
  fillFilterSelect(elements.logEquipmentFilter, uniqueValues(rows.map((entry) => entry.equipment)), "전체");
  fillFilterSelect(elements.logLaborFilter, uniqueValues(rows.map((entry) => entry.labor)), "전체");
  fillFilterSelect(elements.logPaymentFilter, uniqueValues(rows.map((entry) => entry.paymentStatus)), "전체");
}

function toggleContractSelection(id, checked) {
  if (!id) return;
  if (checked) selectedContractEntryIds.add(id);
  else selectedContractEntryIds.delete(id);
  renderContractToolbar();
}

function clearContractSelection() {
  selectedContractEntryIds.clear();
  elements.contractTotalAmount.value = "";
  renderLogs();
}

function renderContractToolbar() {
  const selected = contractSelectedEntries();
  elements.contractToolbar.classList.toggle("hidden", selected.length === 0);
  if (selected.length === 0) return;
  const dateCount = countUnique(selected.map((entry) => entry.date));
  const selectedTotal = sum(selected.map((entry) => amountOf(entry.cost)));
  elements.contractSelectionSummary.textContent = `선택 ${selected.length}건 · ${dateCount}일 · 선택 합계 ${formatMoney(selectedTotal)}`;
}

async function applyContractDistribution() {
  const selected = contractSelectedEntries().sort(compareDateAsc);
  if (selected.length === 0) {
    window.alert("도급으로 정리할 업무현황 행을 먼저 선택해주세요.");
    return;
  }

  if (selected.some((entry) => !entry.labor || entry.equipment)) {
    window.alert("도급계약 정산은 인건비 행만 선택해서 사용할 수 있습니다. 장비 행은 선택 해제해주세요.");
    return;
  }

  const total = normalizeContractAmount(elements.contractTotalAmount.value);
  if (!total) {
    window.alert("총 도급금액을 입력해주세요. 예: 210 또는 2100000");
    return;
  }

  const byDate = new Map();
  selected.forEach((entry) => {
    const date = entry.date || "날짜 미입력";
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(entry);
  });

  const dateCount = byDate.size || 1;
  const dailyAmount = Math.floor(total / dateCount);
  let distributed = 0;
  const contractGroupId = cryptoId();
  const updatedEntries = [];
  const sortedDates = Array.from(byDate.keys()).sort();

  sortedDates.forEach((date, dateIndex) => {
    const rows = byDate.get(date);
    const dayTotal = dateIndex === sortedDates.length - 1 ? total - distributed : dailyAmount;
    const baseShare = Math.floor(dayTotal / rows.length);
    let dayDistributed = 0;
    rows.forEach((entry, rowIndex) => {
      const share = rowIndex === rows.length - 1 ? dayTotal - dayDistributed : baseShare;
      dayDistributed += share;
      updatedEntries.push({
        ...entry,
        cost: share,
        costType: "인건비",
        paymentStatus: entry.paymentStatus === "도급" ? "" : entry.paymentStatus,
        contractFlag: true,
        contractTotal: total,
        contractGroupId,
        contractOriginalCost: hasStoredContractOriginal(entry) ? entry.contractOriginalCost : entry.cost,
        contractOriginalCostType: hasStoredContractOriginal(entry) ? entry.contractOriginalCostType : entry.costType || "인건비",
        updatedAt: new Date().toISOString(),
        status: getSyncEndpoint() ? "sending" : "local"
      });
    });
    distributed += dayTotal;
  });

  const updatedMap = new Map(updatedEntries.map((entry) => [entry.id, entry]));
  state.entries = state.entries.map((entry) => updatedMap.get(entry.id) || entry);
  saveState();
  renderAll();

  if (getSyncEndpoint()) {
    const sent = await syncPayload("workEntries", updatedEntries);
    updateEntrySyncStatus(updatedEntries, sent ? "sent" : "failed");
    if (sent) await syncSharedBackup();
    renderAll();
  }

  window.alert(`도급금액 ${formatMoney(total)}을 ${dateCount}일 기준으로 ${updatedEntries.length}건에 분배했습니다. 결제여부는 기존 값으로 유지했습니다.`);
}

async function cancelContractDistribution() {
  const selected = contractSelectedEntries();
  if (selected.length === 0) {
    window.alert("도급을 취소할 업무현황 행을 먼저 선택해주세요.");
    return;
  }

  const targets = selected.filter((entry) => entry.contractFlag);
  if (targets.length === 0) {
    window.alert("선택한 항목 중 도급 처리된 행이 없습니다.");
    return;
  }

  const confirmed = window.confirm(`선택한 ${targets.length}건의 도급 표시를 취소할까요? 이전 비용 기록이 있는 항목은 원래 비용으로 되돌립니다.`);
  if (!confirmed) return;

  const updatedEntries = targets.map((entry) => ({
    ...entry,
    cost: hasStoredContractOriginal(entry) ? entry.contractOriginalCost : entry.cost,
    costType: hasStoredContractOriginal(entry) ? entry.contractOriginalCostType || "인건비" : entry.costType || "인건비",
    contractFlag: false,
    contractTotal: "",
    contractGroupId: "",
    contractOriginalCost: "",
    contractOriginalCostType: "",
    updatedAt: new Date().toISOString(),
    status: getSyncEndpoint() ? "sending" : "local"
  }));

  const updatedMap = new Map(updatedEntries.map((entry) => [entry.id, entry]));
  state.entries = state.entries.map((entry) => updatedMap.get(entry.id) || entry);
  saveState();
  renderAll();

  if (getSyncEndpoint()) {
    const sent = await syncPayload("workEntries", updatedEntries);
    updateEntrySyncStatus(updatedEntries, sent ? "sent" : "failed");
    if (sent) await syncSharedBackup();
    renderAll();
  }

  window.alert(`도급 처리 ${updatedEntries.length}건을 취소했습니다.`);
}

function hasStoredContractOriginal(entry) {
  return entry.contractOriginalCost !== "" && entry.contractOriginalCost !== null && entry.contractOriginalCost !== undefined;
}

function contractSelectedEntries() {
  const projectName = getActiveProjectName();
  return state.entries.filter((entry) => (entry.project || "제천2덕동골") === projectName && selectedContractEntryIds.has(entry.id));
}

function normalizeContractAmount(value) {
  const number = numberOrBlank(String(value ?? "").replaceAll(",", ""));
  if (!number) return 0;
  return number < 10000 ? number * 10000 : number;
}

function selectedOptionLabel(select) {
  return select?.options?.[select.selectedIndex]?.textContent || select?.value || "항목";
}

function bulkDisplayValue(value) {
  return value === "" ? "빈값" : String(value);
}

function readBulkValue(field, rawValue, numericFields = [], requiredFields = []) {
  const value = String(rawValue ?? "").trim();
  if (requiredFields.includes(field) && !value) {
    window.alert(`${selectedBulkFieldName(field)} 값은 비워둘 수 없습니다.`);
    return { ok: false };
  }

  if (numericFields.includes(field)) {
    const number = numberOrBlank(value.replaceAll(",", ""));
    if (number === "" || number < 0 || (field === "workAmount" && number <= 0)) {
      window.alert("금액은 0 이상, 공수는 0보다 큰 숫자로 입력해주세요.");
      return { ok: false };
    }
    return { ok: true, value: number };
  }

  return { ok: true, value };
}

function selectedBulkFieldName(field) {
  const labels = {
    mainProcess: "주공정",
    subProcess: "부공정",
    costType: "비용 구분",
    process: "공정",
    product: "제품"
  };
  return labels[field] || "선택 항목";
}

function statusDotHtml(status, label) {
  const text = label || syncLabels[status] || status || "상태";
  const tone = status === "failed" ? "red" : ["local", "sending"].includes(status) ? "yellow" : "green";
  return `<span class="status-dot-badge ${tone}" title="${escapeAttr(text)}" aria-label="${escapeAttr(text)}"></span>`;
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
    <td><span class="contract-marker ${entry.contractFlag ? "active" : ""}">${entry.contractFlag ? "도급" : "-"}</span></td>
    <td>${statusDotHtml("sending", "수정중")}</td>
    <td>
      <div class="row-actions">
        <button class="icon-btn approve" type="button" title="저장" data-save-entry>√</button>
        <button class="icon-btn" type="button" title="취소" data-cancel-entry>X</button>
      </div>
    </td>
  `;
}

function renderEntrySheetEditRow(entry) {
  const mainOptions = state.config.processes.map((process) => process.name);
  const subs = getSubProcesses(entry.mainProcess);
  const paymentOptions = ["", ...uniqueValues([...state.config.payments, DEFAULT_PAYMENT_STATUS])];
  return `
    <td><input class="inline-cell sheet-cell" data-field="date" type="date" value="${escapeAttr(entry.date || "")}"></td>
    <td><select class="inline-cell sheet-cell" data-field="mainProcess" data-inline-main>${optionsHtml(mainOptions, entry.mainProcess)}</select></td>
    <td><select class="inline-cell sheet-cell" data-field="subProcess" data-inline-sub>${optionsHtml(subs, entry.subProcess)}</select></td>
    <td><input class="inline-cell sheet-cell" data-field="detailProcess" type="text" value="${escapeAttr(entry.detailProcess || "")}"></td>
    <td><select class="inline-cell sheet-cell" data-field="equipment">${optionsHtml(["", ...state.config.equipment], entry.equipment)}</select></td>
    <td><select class="inline-cell sheet-cell" data-field="labor">${optionsHtml(["", ...state.config.labor], entry.labor)}</select></td>
    <td><input class="inline-cell sheet-cell" data-field="workAmount" type="number" min="0" step="0.5" value="${escapeAttr(entry.workAmount || "")}"></td>
    <td><select class="inline-cell sheet-cell" data-field="costType">${optionsHtml(["인건비", "장비대"], entry.costType || "인건비")}</select></td>
    <td><input class="inline-cell sheet-cell" data-field="cost" type="number" min="0" step="1000" value="${escapeAttr(entry.cost || "")}"></td>
    <td><select class="inline-cell sheet-cell" data-field="paymentStatus">${optionsHtml(paymentOptions, entry.paymentStatus || DEFAULT_PAYMENT_STATUS)}</select></td>
    <td><input class="inline-cell sheet-cell" data-field="memo" type="text" value="${escapeAttr(entry.memo || "")}"></td>
    <td><span class="contract-marker ${entry.contractFlag ? "active" : ""}">${entry.contractFlag ? "도급" : "-"}</span></td>
    <td>${statusDotHtml("sending", "수정중")}</td>
    <td><span class="sheet-edit-hint">수정중</span></td>
  `;
}

async function deleteEntry(id) {
  const target = state.entries.find((entry) => entry.id === id);
  const confirmed = window.confirm("이 업무현황 항목을 앱에서 삭제할까요?");
  if (!confirmed) return;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  markDeletedRecord("work", target);
  saveState();
  renderAll();
  if (target && getSyncEndpoint()) {
    await syncPayload("deleteWorkEntries", [target]);
    const verified = await verifyDeletedRecord("work", target);
    if (verified) {
      await syncSharedBackup();
      state.lastSync = new Date().toISOString();
      saveState();
      renderSyncState();
    } else {
      window.alert("앱에서는 삭제했지만 구글시트에는 아직 남아 있습니다. app-config.js의 URL이 새 Apps Script 배포 URL인지 확인하고, 앱을 Ctrl+F5로 새로고침해주세요.");
    }
  }
}

function beginEntryEdit(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  logSheetEditMode = false;
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

function startLogSheetEditMode() {
  if (state.editingEntryId) {
    window.alert("수정 중인 행을 먼저 저장하거나 취소해주세요.");
    return;
  }
  if (!currentLogRows.length) {
    window.alert("수정할 업무현황 행이 없습니다.");
    return;
  }
  logSheetEditMode = true;
  state.editingEntryId = "";
  saveState();
  renderLogs();
  renderEditState();
}

function cancelLogSheetEditMode() {
  logSheetEditMode = false;
  renderLogs();
  renderEditState();
}

async function saveLogSheetEdits() {
  const rows = Array.from(elements.logTableBody.querySelectorAll("[data-sheet-entry]"));
  if (!rows.length) {
    cancelLogSheetEditMode();
    return;
  }

  const now = new Date().toISOString();
  const status = getSyncEndpoint() ? "sending" : "local";
  const changedEntries = [];

  for (const row of rows) {
    const id = row.dataset.sheetEntry;
    const original = state.entries.find((entry) => entry.id === id);
    if (!original) continue;
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
      updatedAt: now,
      status
    };

    if (!updated.date || !updated.mainProcess || !updated.subProcess) {
      window.alert("날짜, 주공정, 부공정은 비울 수 없습니다.");
      return;
    }
    if (!updated.equipment && !updated.labor) {
      window.alert("장비 또는 인부 중 하나는 입력되어야 합니다.");
      return;
    }
    if (workSyncKey(updated) !== workSyncKey(original)) {
      changedEntries.push(updated);
    }
  }

  if (!changedEntries.length) {
    logSheetEditMode = false;
    renderLogs();
    renderEditState();
    window.alert("변경된 내용이 없습니다.");
    return;
  }

  const changedMap = new Map(changedEntries.map((entry) => [entry.id, entry]));
  state.entries = state.entries.map((entry) => changedMap.get(entry.id) || entry);
  logSheetEditMode = false;
  saveState();
  renderAll();

  await syncWorkRowsWithOverlay(changedEntries, "업무현황 수정 내용을 동기화하는 중입니다");
}

async function splitEquipmentCost(id) {
  const original = state.entries.find((entry) => entry.id === id);
  if (!original) return;
  if (!canSplitEquipmentEntry(original)) {
    window.alert("도급 처리된 행이거나 장비대 금액이 없는 행은 분할할 수 없습니다.");
    return;
  }

  const currentCost = amountOf(original.cost);
  const rawLaborCost = window.prompt(
    `인건비로 분리할 금액을 입력하세요.\n현재 장비대: ${formatMoney(currentCost)}\n예: 30 또는 300000`,
    ""
  );
  if (rawLaborCost === null) return;

  const laborCost = normalizeContractAmount(rawLaborCost);
  if (!laborCost || laborCost >= currentCost) {
    window.alert("인건비는 0원보다 크고 현재 장비대보다 작아야 합니다.");
    return;
  }

  const defaultLabor = original.labor || state.config.labor[0] || "분할 인건비";
  const rawLaborName = window.prompt("새로 만들 인건비 항목명을 입력하세요.", defaultLabor);
  if (rawLaborName === null) return;
  const laborName = rawLaborName.trim() || defaultLabor;
  const equipmentCost = currentCost - laborCost;

  const confirmed = window.confirm(`장비대 ${formatMoney(currentCost)}을\n장비대 ${formatMoney(equipmentCost)} / 인건비 ${formatMoney(laborCost)}로 나눌까요?`);
  if (!confirmed) return;

  const now = new Date().toISOString();
  const status = getSyncEndpoint() ? "sending" : "local";
  const equipmentEntry = {
    ...original,
    labor: "",
    costType: "장비대",
    cost: equipmentCost,
    updatedAt: now,
    status
  };
  const laborEntry = {
    ...original,
    id: cryptoId(),
    equipment: "",
    labor: laborName,
    costType: "인건비",
    cost: laborCost,
    contractFlag: false,
    contractTotal: "",
    contractGroupId: "",
    contractOriginalCost: "",
    contractOriginalCostType: "",
    createdAt: now,
    updatedAt: now,
    status
  };

  if (!state.config.labor.includes(laborName)) {
    state.config.labor.push(laborName);
  }

  const changedEntries = [equipmentEntry, laborEntry];
  state.entries = state.entries.flatMap((entry) => entry.id === id ? changedEntries : [entry]);
  saveState();
  renderAll();

  const synced = await syncWorkRowsWithOverlay(changedEntries, "장비대와 인건비를 나누고 동기화하는 중입니다");
  const title = synced ? "분할 완료" : "앱에는 분할했지만 구글시트 동기화에 실패했습니다";
  window.alert(`${title}\n장비대: ${formatMoney(equipmentCost)}\n인건비: ${formatMoney(laborCost)}`);
}

async function applyLogBulkEdit() {
  if (state.editingEntryId) {
    window.alert("수정 중인 업무현황 행을 저장하거나 취소한 뒤 일괄수정해주세요.");
    return;
  }

  const targets = currentLogRows.filter((entry) => entry.id);
  if (targets.length === 0) {
    window.alert("일괄수정할 업무현황 행이 없습니다. 먼저 필터를 확인해주세요.");
    return;
  }

  const field = elements.logBulkField.value;
  const label = selectedOptionLabel(elements.logBulkField);
  const parsed = readBulkValue(field, elements.logBulkValue.value, ["cost", "workAmount"], ["mainProcess", "subProcess", "costType"]);
  if (!parsed.ok) return;

  if (field === "costType" && !["인건비", "장비대"].includes(parsed.value)) {
    window.alert("비용 구분은 인건비 또는 장비대로 입력해주세요.");
    return;
  }

  const displayValue = bulkDisplayValue(parsed.value);
  const confirmed = window.confirm(`현재 화면에 표시된 업무현황 ${targets.length}건의 [${label}] 값을 "${displayValue}"(으)로 바꿀까요?`);
  if (!confirmed) return;

  const now = new Date().toISOString();
  const status = getSyncEndpoint() ? "sending" : "local";
  const targetIds = new Set(targets.map((entry) => entry.id));
  const changedEntries = state.entries
    .filter((entry) => targetIds.has(entry.id))
    .map((entry) => ({
      ...entry,
      [field]: parsed.value,
      updatedAt: now,
      status
    }));
  const changedMap = new Map(changedEntries.map((entry) => [entry.id, entry]));
  state.entries = state.entries.map((entry) => changedMap.get(entry.id) || entry);
  elements.logBulkValue.value = "";
  saveState();
  renderAll();

  await syncWorkRowsWithOverlay(changedEntries, "업무현황 일괄수정 내용을 동기화하는 중입니다");
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

async function applyMaterialBulkEdit() {
  if (state.editingMaterialId) {
    window.alert("수정 중인 자재현황 행을 저장하거나 취소한 뒤 일괄수정해주세요.");
    return;
  }

  const targets = currentMaterialRows.filter((order) => order.id);
  if (targets.length === 0) {
    window.alert("일괄수정할 자재현황 행이 없습니다. 먼저 필터를 확인해주세요.");
    return;
  }

  const field = elements.materialBulkField.value;
  const label = selectedOptionLabel(elements.materialBulkField);
  const parsed = readBulkValue(field, elements.materialBulkValue.value, ["orderAmount", "lowPrice", "highPrice", "creditAmount"], ["process", "product"]);
  if (!parsed.ok) return;

  const displayValue = bulkDisplayValue(parsed.value);
  const confirmed = window.confirm(`현재 화면에 표시된 자재현황 ${targets.length}건의 [${label}] 값을 "${displayValue}"(으)로 바꿀까요?`);
  if (!confirmed) return;

  const now = new Date().toISOString();
  const status = getSyncEndpoint() ? "sending" : "local";
  const targetIds = new Set(targets.map((order) => order.id));
  const changedOrders = state.materialOrders
    .filter((order) => targetIds.has(order.id))
    .map((order) => ({
      ...order,
      [field]: parsed.value,
      updatedAt: now,
      status
    }));
  const changedMap = new Map(changedOrders.map((order) => [order.id, order]));
  state.materialOrders = state.materialOrders.map((order) => changedMap.get(order.id) || order);
  elements.materialBulkValue.value = "";
  saveState();
  renderAll();

  await syncMaterialRowsWithOverlay(changedOrders, "자재현황 일괄수정 내용을 동기화하는 중입니다");
}

async function deleteMaterialOrder(id) {
  const target = state.materialOrders.find((order) => order.id === id);
  const confirmed = window.confirm("이 자재현황 항목을 앱에서 삭제할까요?");
  if (!confirmed) return;
  state.materialOrders = state.materialOrders.filter((order) => order.id !== id);
  markDeletedRecord("material", target);
  saveState();
  renderAll();
  if (target && getSyncEndpoint()) {
    await syncPayload("deleteMaterialOrders", [target]);
    const verified = await verifyDeletedRecord("material", target);
    if (verified) {
      await syncSharedBackup();
      state.lastSync = new Date().toISOString();
      saveState();
      renderSyncState();
    } else {
      window.alert("앱에서는 삭제했지만 구글시트에는 아직 남아 있습니다. app-config.js의 URL이 새 Apps Script 배포 URL인지 확인하고, 앱을 Ctrl+F5로 새로고침해주세요.");
    }
  }
}

function renderEditState() {
  const editingEntry = Boolean(state.editingEntryId);
  const editingMaterial = Boolean(state.editingMaterialId);
  const editingLogTable = editingEntry || logSheetEditMode;
  elements.cancelEntryEditButton.classList.toggle("hidden", !editingEntry);
  elements.addDraftButton.classList.toggle("hidden", editingEntry);
  elements.entrySubmitButton.textContent = editingEntry ? "수정 저장" : "업무현황 저장";
  elements.logEditBar.classList.toggle("hidden", !editingLogTable);
  elements.logEditBar.querySelector("strong").textContent = logSheetEditMode ? "업무현황 표 수정모드" : "업무현황 수정 중";
  elements.logEditBar.querySelector("span").textContent = logSheetEditMode ? "원하는 셀을 바로 고친 뒤 완료를 누르세요." : "표 안의 값을 고친 뒤 저장하세요.";
  elements.logInlineSaveButton.textContent = logSheetEditMode ? "완료" : "수정 저장";
  elements.logInlineCancelButton.textContent = logSheetEditMode ? "수정모드 취소" : "취소";
  elements.toggleLogSheetEditButton.textContent = logSheetEditMode ? "수정모드 중" : "표 수정모드";
  elements.toggleLogSheetEditButton.disabled = editingEntry || logSheetEditMode;
  elements.toggleLogSheetEditButton.classList.toggle("active", logSheetEditMode);
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
    row.className = `material-row ${materialCreditAmount(material) > 0 ? "low" : ""}`;
    row.innerHTML = `
      <header>
        <strong>${escapeHtml(material.product || "제품명 없음")}</strong>
        <span class="pill ${materialCreditAmount(material) > 0 ? "" : "muted"}">${formatMoney(material.orderAmount)}</span>
      </header>
      <p>${formatDate(material.date)} · ${escapeHtml(material.process || "")} · ${escapeHtml(material.vendor || "")}</p>
      <div class="material-meta">
        <span>비교 ${formatMoney(materialComparisonProfit(material))}</span>
        <span>외상 ${formatMoney(materialCreditAmount(material))}</span>
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

  currentMaterialRows = rows;
  renderMaterialTableSummary(rows);
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
      <td class="${materialCreditAmount(order) > 0 ? "material-credit-cell" : ""}">${formatMoney(order.creditAmount)}</td>
      <td>${statusDotHtml(order.status)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn approve" type="button" title="수정" data-edit-material="${order.id}">√</button>
          <button class="icon-btn delete" type="button" title="삭제" data-delete-material="${order.id}">X</button>
        </div>
      </td>
    `;
    elements.materialTableBody.append(tr);
  });
  appendMaterialTotalRow(rows);

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

function renderMaterialTableSummary(rows) {
  const totals = materialTableTotals(rows);
  renderTableSummaryCards(elements.materialTableSummary, [
    { label: "표시 행", value: `${rows.length}건` },
    { label: "발주 합계", value: formatMoney(totals.orderAmount), strong: true },
    { label: "현지출", value: formatMoney(totals.paidAmount) },
    { label: "외상 합계", value: formatMoney(totals.creditAmount) },
    { label: "최고가 기준", value: formatMoney(totals.highPrice) },
    { label: "비교 이익", value: formatMoney(totals.comparisonProfit) }
  ]);
}

function appendMaterialTotalRow(rows) {
  if (!rows.length) return;
  const totals = materialTableTotals(rows);
  const row = document.createElement("tr");
  row.className = "table-total-row";
  row.innerHTML = `
    <td colspan="5">필터 합계</td>
    <td>${formatMoney(totals.orderAmount)}</td>
    <td>${formatMoney(totals.lowPrice)}</td>
    <td>${formatMoney(totals.highPrice)}</td>
    <td>비교 이익 ${formatMoney(totals.comparisonProfit)}</td>
    <td>${formatMoney(totals.creditAmount)}</td>
    <td colspan="2">현지출 ${formatMoney(totals.paidAmount)}</td>
  `;
  elements.materialTableBody.append(row);
}

function materialTableTotals(rows) {
  const orderAmount = sum(rows.map((order) => amountOf(order.orderAmount)));
  const creditAmount = sum(rows.map(materialCreditAmount));
  return {
    orderAmount,
    lowPrice: sum(rows.map((order) => amountOf(order.lowPrice))),
    highPrice: sum(rows.map((order) => amountOf(order.highPrice))),
    creditAmount,
    paidAmount: Math.max(0, orderAmount - creditAmount),
    comparisonProfit: sum(rows.map(materialComparisonProfit))
  };
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
    <td><input class="inline-cell" data-field="orderAmount" type="number" min="0" step="1" value="${escapeAttr(order.orderAmount || "")}"></td>
    <td><input class="inline-cell" data-field="lowPrice" type="number" min="0" step="1" value="${escapeAttr(order.lowPrice || "")}"></td>
    <td><input class="inline-cell" data-field="highPrice" type="number" min="0" step="1" value="${escapeAttr(order.highPrice || "")}"></td>
    <td><input class="inline-cell" data-field="memo" type="text" value="${escapeAttr(order.memo || "")}"></td>
    <td><input class="inline-cell" data-field="creditAmount" type="number" min="0" step="1" value="${escapeAttr(order.creditAmount || "")}"></td>
    <td>${statusDotHtml("sending", "수정중")}</td>
    <td>
      <div class="row-actions">
        <button class="icon-btn approve" type="button" title="저장" data-save-material>√</button>
        <button class="icon-btn" type="button" title="취소" data-cancel-material>X</button>
      </div>
    </td>
  `;
}

function renderSummary() {
  const workRows = filteredWorkRows();
  const materialRows = filteredMaterialRows();
  const totals = calculateTotals(workRows, materialRows);
  const operationStats = calculateOperationStats();

  const moneyStats = [
    { label: "총공사비", value: formatMoney(totals.totalCost), tone: "total" },
    { label: "현지출액", value: formatMoney(totals.paidAmount), tone: "spent" },
    { label: "외상", value: formatMoney(totals.credit), tone: "credit" },
    ...projectExtraSummaryItems().map((item) => ({
      label: item.name,
      value: formatMoney(item.amount),
      tone: item.type === "credit" ? "credit" : "spent"
    })),
    { label: "자재비교이익", value: formatMoney(totals.comparisonProfit), tone: "profit" }
  ];
  const metaStats = [
    { label: "공사 시작일", value: formatDate(operationStats.startDate) },
    { label: "작업일", value: `${operationStats.workDays}일` },
    { label: "경과일", value: `${operationStats.elapsedDays}일` },
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
      const breakdown = selectedRow.process === "추가 항목"
        ? projectExtraSummaryItems().map((item) => ({ name: item.name, value: amountOf(item.amount) }))
        : [
            { name: "자재비", value: selectedRow.material },
            { name: "인건비", value: selectedRow.labor },
            { name: "장비대", value: selectedRow.equipment }
          ];
      renderPieChart(elements.summaryChart, breakdown);
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
    renderPieChart(elements.summaryChart, buildCategoryBreakdownRows(selectedCategory.key, workRows, materialRows));
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
        ...projectExtraSummaryItems().map((item) => ({ name: item.name, value: amountOf(item.amount) }))
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
        ...projectExtraSummaryItems().map((item) => ({ name: item.name, value: amountOf(item.amount) })),
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
      mode: "비중 그래프",
      type: "pie",
      rows: groupSum(materialRows, (row) => row.vendor || "업체 미입력", (row) => amountOf(row.orderAmount))
    },
    payment: {
      title: "결제·외상",
      mode: "결제/외상 구분",
      type: "bar",
      rows: buildPaymentRows(workRows, materialRows, totals)
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
    return item ? [{ name: item.name, value: amountOf(item.amount) }] : [];
  }

  if (category === "credit") {
    const workCreditRows = groupSum(
      workRows,
      (row) => row.mainProcess || "공정 미입력",
      workCreditAmount
    );
    const materialCreditRows = groupSum(
      materialRows,
      (row) => row.process || "공정 미입력",
      materialCreditAmount
    );
    const merged = new Map();
    [...workCreditRows, ...materialCreditRows].forEach((row) => {
      merged.set(row.name, amountOf(merged.get(row.name)) + amountOf(row.value));
    });
    const rows = Array.from(merged, ([name, value]) => ({ name, value }));
    const extras = projectExtraSummaryItems()
      .filter((item) => item.type === "credit")
      .map((item) => ({ name: item.name, value: amountOf(item.amount) }));
    return [...rows, ...extras];
  }

  return summaryProcessNames(workRows, materialRows).map((processName) => {
    const work = workRows.filter((row) => (row.mainProcess || "공정 미입력") === processName);
    const material = materialRows.filter((row) => (row.process || "공정 미입력") === processName);
    let value = 0;
    if (category === "material") value = sum(material.map((row) => amountOf(row.orderAmount)));
    if (category === "labor") value = sum(work.filter((row) => row.costType === "인건비").map((row) => amountOf(row.cost)));
    if (category === "equipment") value = sum(work.filter((row) => row.costType === "장비대").map((row) => amountOf(row.cost)));
    return { name: processName, value };
  });
}

function renderPieChart(container, rows) {
  const colors = chartColors();
  const meaningful = rows.filter((row) => amountOf(row.value) > 0);
  const total = sum(meaningful.map((row) => amountOf(row.value)));

  if (!total) {
    container.append(emptyState());
    return;
  }

  const segments = buildPieSegments(meaningful, total, colors);

  const wrap = document.createElement("div");
  wrap.className = "pie-chart-wrap";
  wrap.innerHTML = `
    <div class="pie-visual">
      <svg class="pie-chart-svg" viewBox="0 0 320 320" role="img" aria-label="비용 비중 원형 그래프">
        <defs>
          <filter id="pieDepth" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#4d2e16" flood-opacity="0.18"/>
          </filter>
        </defs>
        <g filter="url(#pieDepth)">
          ${segments.map((segment) => `
            <path class="pie-segment" d="${segment.path}" fill="${segment.color}"></path>
          `).join("")}
        </g>
        ${segments.map((segment) => segment.callout).join("")}
        ${segments.map((segment) => `
          <text class="pie-slice-label ${segment.outside ? "outside" : "inside"}" x="${segment.labelX}" y="${segment.labelY}" text-anchor="${segment.anchor}">
            <tspan x="${segment.labelX}">${escapeHtml(segment.shortName)}</tspan>
            <tspan x="${segment.labelX}" dy="14">${segment.percent}%</tspan>
          </text>
        `).join("")}
      </svg>
      <div class="pie-center">
        <span>합계</span>
        <strong>${formatMoney(total)}</strong>
      </div>
    </div>
    <div class="chart-legend">
      ${meaningful.map((row, index) => {
        const percent = Math.round((amountOf(row.value) / total) * 100);
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

function buildPieSegments(rows, total, colors) {
  const cx = 160;
  const cy = 160;
  const outer = 128;
  const inner = 68;
  let angle = -90;
  return rows.map((row, index) => {
    const value = amountOf(row.value);
    const sweep = Math.max(0.8, (value / total) * 360);
    const end = angle + sweep;
    const large = sweep > 180 ? 1 : 0;
    const outerStart = polarPoint(cx, cy, outer, angle);
    const outerEnd = polarPoint(cx, cy, outer, end);
    const innerEnd = polarPoint(cx, cy, inner, end);
    const innerStart = polarPoint(cx, cy, inner, angle);
    const mid = angle + sweep / 2;
    const percent = Math.round((value / total) * 100);
    const outside = percent < 8;
    const labelPoint = polarPoint(cx, cy, outside ? 146 : 101, mid);
    const calloutStart = polarPoint(cx, cy, 122, mid);
    const calloutEnd = polarPoint(cx, cy, 139, mid);
    const path = [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
      "Z"
    ].join(" ");
    const segment = {
      path,
      color: colors[index % colors.length],
      shortName: shortenLabel(row.name, outside ? 7 : 5),
      percent,
      outside,
      labelX: labelPoint.x,
      labelY: labelPoint.y,
      anchor: outside ? (labelPoint.x >= cx ? "start" : "end") : "middle",
      callout: outside ? `<line class="pie-callout" x1="${calloutStart.x}" y1="${calloutStart.y}" x2="${calloutEnd.x}" y2="${calloutEnd.y}"></line>` : ""
    };
    angle = end;
    return segment;
  });
}

function polarPoint(cx, cy, radius, angle) {
  const rad = (Math.PI / 180) * angle;
  return {
    x: Number((cx + radius * Math.cos(rad)).toFixed(2)),
    y: Number((cy + radius * Math.sin(rad)).toFixed(2))
  };
}

function shortenLabel(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function chartColors() {
  return ["#8b4513", "#0f766e", "#d97706", "#2563eb", "#be123c", "#4d7c0f", "#7c3aed", "#9333ea", "#0891b2", "#c2410c"];
}

function renderBarChart(container, rows) {
  const meaningful = rows.filter((row) => amountOf(row.value) > 0);
  const max = Math.max(...meaningful.map((row) => amountOf(row.value)), 1);
  const total = sum(meaningful.map((row) => amountOf(row.value)));

  if (meaningful.length === 0) {
    container.append(emptyState());
    return;
  }

  const list = document.createElement("div");
  list.className = "chart-list";
  meaningful.forEach((row) => {
    const percentOfTotal = total ? Math.round((amountOf(row.value) / total) * 100) : 0;
    const item = document.createElement("div");
    item.className = "bar-row chart-bar-row";
    item.innerHTML = `
      <span class="bar-label">${escapeHtml(row.name)}</span>
      <div>
        <div class="bar-track"><div class="bar-fill" style="width: ${(amountOf(row.value) / max) * 100}%"></div></div>
        ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ""}
      </div>
      <strong>${formatMoney(row.value)} <span>${percentOfTotal}%</span></strong>
    `;
    list.append(item);
  });
  container.append(list);
}

function buildProcessCostRows(workRows, materialRows) {
  const rows = summaryProcessNames(workRows, materialRows).map((processName) => {
    const work = workRows.filter((row) => (row.mainProcess || "공정 미입력") === processName);
    const material = materialRows.filter((row) => (row.process || "공정 미입력") === processName);
    const materialCost = sum(material.map((row) => amountOf(row.orderAmount)));
    const laborCost = sum(work.filter((row) => row.costType === "인건비").map((row) => amountOf(row.cost)));
    const equipmentCost = sum(work.filter((row) => row.costType === "장비대").map((row) => amountOf(row.cost)));
    return {
      process: processName,
      total: materialCost + laborCost + equipmentCost,
      material: materialCost,
      labor: laborCost,
      equipment: equipmentCost
    };
  });
  const extraCost = sum(projectExtraSummaryItems().map((item) => amountOf(item.amount)));
  if (extraCost > 0) {
    rows.push({ process: "추가 항목", total: extraCost, material: 0, labor: 0, equipment: 0 });
  }
  return rows;
}

function summaryProcessNames(workRows, materialRows) {
  return uniqueValues([
    ...state.config.processes.map((process) => process.name),
    ...workRows.map((row) => row.mainProcess || "공정 미입력"),
    ...materialRows.map((row) => row.process || "공정 미입력")
  ]);
}

function buildPaymentRows(workRows, materialRows, totals = calculateTotals(workRows, materialRows)) {
  return [
    { name: "총 지출금액", value: totals.paidAmount, meta: "결제완료/현장결제/카드결제 + 자재 외상 제외 금액" },
    { name: "총 외상", value: totals.credit, meta: "업무 외상/미입력 + 자재 외상금액" },
    { name: "인건비 결제금액", value: totals.laborPaid },
    { name: "인건비 외상금액", value: totals.laborCredit },
    { name: "자재비 결제금액", value: totals.materialPaid },
    { name: "자재비 외상금액", value: totals.materialCredit },
    { name: "장비대 결제금액", value: totals.equipmentPaid },
    { name: "장비대 외상금액", value: totals.equipmentCredit },
    { name: "추가항목 결제금액", value: totals.extraPaid },
    { name: "추가항목 외상금액", value: totals.extraCredit }
  ].filter((row) => amountOf(row.value) > 0);
}

function renderRankList(container, rows, suffix) {
  container.innerHTML = "";
  if (rows.length === 0) {
    container.append(emptyState());
    return;
  }
  const max = Math.max(...rows.map((row) => amountOf(row.value)), 1);
  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "rank-item";
    item.innerHTML = `
      <span>${index + 1}</span>
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <div class="rank-meter"><i style="width:${(amountOf(row.value) / max) * 100}%"></i></div>
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
  queueSharedBackup();
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
  queueSharedBackup();
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
  queueSharedBackup();
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
      queueSharedBackup();
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
    const tag = document.createElement("span");
    tag.className = "tag editable-tag";

    const name = document.createElement("span");
    name.className = "tag-name";
    name.textContent = value;

    const renameButton = document.createElement("button");
    renameButton.className = "tag-action";
    renameButton.type = "button";
    renameButton.textContent = "수정";
    renameButton.addEventListener("click", () => renameSettingItem(type, value));

    const removeButton = document.createElement("button");
    removeButton.className = "tag-action danger";
    removeButton.type = "button";
    removeButton.textContent = "X";
    removeButton.addEventListener("click", () => removeSettingItem(type, value));

    tag.append(name, renameButton, removeButton);
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
  queueSharedBackup();
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
  queueSharedBackup();
}

function removeProcess(name) {
  const confirmed = window.confirm(`${name} 주공정을 삭제할까요?`);
  if (!confirmed) return;
  state.config.processes = state.config.processes.filter((process) => process.name !== name);
  saveState();
  renderAll();
  queueSharedBackup();
}

function removeSubProcess(processName, subName) {
  state.config.processes = state.config.processes.map((process) => {
    if (process.name !== processName) return process;
    return { ...process, subs: process.subs.filter((sub) => sub !== subName) };
  });
  saveState();
  renderAll();
  queueSharedBackup();
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
  queueSharedBackup();
}

function removeSettingItem(type, value) {
  const key = type === "payment" ? "payments" : type;
  state.config[key] = state.config[key].filter((item) => item !== value);
  saveState();
  renderAll();
  queueSharedBackup();
}

async function renameSettingItem(type, oldValue) {
  const key = settingConfigKey(type);
  const input = window.prompt(`${settingTypeLabel(type)} 이름을 수정하세요.`, oldValue);
  if (input === null) return;

  const nextValue = input.trim();
  if (!nextValue) {
    window.alert("새 이름을 입력해주세요.");
    return;
  }
  if (nextValue === oldValue) return;
  if (state.config[key].includes(nextValue)) {
    window.alert("이미 같은 이름이 있습니다.");
    return;
  }

  const confirmed = window.confirm(`${oldValue} → ${nextValue}\n기존 업무현황에 기록된 같은 이름도 함께 바꿀까요?`);
  if (!confirmed) return;

  state.config[key] = state.config[key].map((item) => item === oldValue ? nextValue : item);

  const field = settingEntryField(type);
  const projectName = getActiveProjectName();
  const now = new Date().toISOString();
  const status = getSyncEndpoint() ? "sending" : "local";
  const changedEntries = field
    ? state.entries
      .filter((entry) => (entry.project || "제천2덕동골") === projectName && entry[field] === oldValue)
      .map((entry) => ({
        ...entry,
        [field]: nextValue,
        updatedAt: now,
        status
      }))
    : [];

  if (changedEntries.length) {
    const changedMap = new Map(changedEntries.map((entry) => [entry.id, entry]));
    state.entries = state.entries.map((entry) => changedMap.get(entry.id) || entry);
  }

  saveState();
  renderAll();

  if (changedEntries.length) {
    await syncWorkRowsWithOverlay(changedEntries, "기준 목록 수정 내용을 업무현황에 반영하는 중입니다");
    return;
  }

  if (getSyncEndpoint()) {
    await runWithSyncOverlay("기준 목록을 동기화하는 중입니다", syncSharedBackup);
  } else {
    queueSharedBackup();
  }
}

function settingConfigKey(type) {
  return type === "payment" ? "payments" : type;
}

function settingEntryField(type) {
  return {
    equipment: "equipment",
    labor: "labor",
    payment: "paymentStatus"
  }[type] || "";
}

function settingTypeLabel(type) {
  return {
    equipment: "장비",
    labor: "인부",
    payment: "결제여부"
  }[type] || "항목";
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
  const accessKey = getAccessKey();
  if (!endpoint || !accessKey) return false;
  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        spreadsheetId: getActiveProject().spreadsheetId || "",
        project: getActiveProjectName(),
        accessKey,
        type,
        records,
        ...extra
      })
    });
    if (!["workEntries", "materialOrders", "deleteWorkEntries", "deleteMaterialOrders", "replaceProjectData"].includes(type)) {
      return true;
    }
    await wait(700);
    const backup = await loadSheetBackupJsonp(accessKey);
    if (type === "workEntries") {
      const remote = new Map((backup.workEntries || []).map((record) => [record.id, record]));
      return records.every((record) => remote.has(record.id) && workSyncKey(remote.get(record.id)) === workSyncKey(record));
    }
    if (type === "materialOrders") {
      const remote = new Map((backup.materialOrders || []).map((record) => [record.id, record]));
      return records.every((record) => remote.has(record.id) && materialContentKey(remote.get(record.id)) === materialContentKey(record));
    }
    if (type === "deleteWorkEntries") {
      const ids = new Set((backup.workEntries || []).map((record) => record.id));
      return records.every((record) => !ids.has(record.id));
    }
    if (type === "deleteMaterialOrders") {
      const ids = new Set((backup.materialOrders || []).map((record) => record.id));
      return records.every((record) => !ids.has(record.id));
    }
    const remoteWork = new Map((backup.workEntries || []).map((record) => [record.id, record]));
    const remoteMaterials = new Map((backup.materialOrders || []).map((record) => [record.id, record]));
    return (extra.workEntries || []).every((record) => remoteWork.has(record.id) && workSyncKey(remoteWork.get(record.id)) === workSyncKey(record))
      && (extra.materialOrders || []).every((record) => remoteMaterials.has(record.id) && materialContentKey(remoteMaterials.get(record.id)) === materialContentKey(record));
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

function queueSharedBackup() {
  if (!getSyncEndpoint()) return;
  syncSharedBackup().then((ok) => {
    if (!ok) return;
    state.lastSync = new Date().toISOString();
    saveState();
    renderSyncState();
  });
}

async function syncCurrentProjectSnapshot() {
  const projectName = getActiveProjectName();
  dedupeProjectState(projectName);
  const workRows = state.entries.filter((entry) => (entry.project || "제천2덕동골") === projectName);
  const materialRows = state.materialOrders.filter((entry) => (entry.project || "제천2덕동골") === projectName);
  return syncPayload("replaceProjectData", [], {
    workEntries: workRows,
    materialOrders: materialRows,
    summaryRows: buildSummarySnapshotRows(),
    stateData: buildSharedStatePayload()
  });
}

async function pushCurrentProjectToGoogleSheet() {
  if (syncingAll) return;
  if (!getSyncEndpoint()) {
    window.alert("환경설정에서 현재 프로젝트의 Apps Script 웹앱 URL을 먼저 저장해주세요.");
    setView("settings");
    return;
  }

  const confirmed = window.confirm("현재 앱에 저장된 선택 프로젝트 데이터를 기준으로 구글시트를 정리해서 보낼까요? 다른 사람이 같은 시트에 방금 입력한 내용은 먼저 구글시트 불러오기를 한 뒤 보내는 것이 안전합니다.");
  if (!confirmed) return;

  syncingAll = true;

  const projectName = getActiveProjectName();
  dedupeProjectState(projectName);
  setManualSyncBusy(true);

  const workRows = state.entries.filter((entry) => (entry.project || "제천2덕동골") === projectName);
  const materialRows = state.materialOrders.filter((entry) => (entry.project || "제천2덕동골") === projectName);
  const pushed = await syncCurrentProjectSnapshot();
  const verified = pushed ? await verifyDeletedRecordsCleared() : false;

  state.entries = state.entries.map((entry) => (entry.project || "제천2덕동골") === projectName ? { ...entry, status: pushed ? "sent" : "failed" } : entry);
  state.materialOrders = state.materialOrders.map((entry) => (entry.project || "제천2덕동골") === projectName ? { ...entry, status: pushed ? "sent" : "failed" } : entry);
  if (pushed) state.lastSync = new Date().toISOString();
  saveState();
  renderAll();

  setManualSyncBusy(false);
  syncingAll = false;
  window.alert(pushed && verified
    ? `현재 앱 데이터 ${workRows.length + materialRows.length}건을 구글시트로 보냈습니다.`
    : "요청은 보냈지만 구글시트 확인이 끝나지 않았습니다. 삭제 항목이 계속 보이면 Apps Script 최신 코드 배포를 확인해주세요.");
}

async function syncAllPending() {
  return pushCurrentProjectToGoogleSheet();
}

function setManualSyncBusy(isBusy) {
  [
    elements.pushSyncButton,
    elements.exportButton,
    elements.entrySyncButton
  ].filter(Boolean).forEach((button) => {
    button.disabled = isBusy;
    button.textContent = isBusy ? "보내는 중" : (button.id === "pushSyncButton" ? "구글시트로 보내기" : "구글시트에 저장");
  });
}

function buildSharedStatePayload() {
  return {
    project: getActiveProjectName(),
    savedAt: new Date().toISOString(),
    projects: state.projects,
    config: state.config,
    extraSummaryItems: projectExtraSummaryItems(),
    deletedRecords: state.deletedRecords || { work: [], material: [] },
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
  const operationStats = calculateOperationStats();

  return [
    { group: "총괄", name: "총공사비", value: totals.totalCost, type: "금액" },
    { group: "총괄", name: "현지출액", value: totals.paidAmount, type: "금액" },
    { group: "총괄", name: "외상", value: totals.credit, type: "금액" },
    ...projectExtraSummaryItems().map((item) => ({
      group: "추가항목",
      name: item.name,
      value: amountOf(item.amount),
      type: item.type === "credit" ? "외상" : "현지출액"
    })),
    { group: "일정", name: "공사 시작일", value: operationStats.startDate || "", type: "날짜" },
    { group: "일정", name: "작업일", value: `${operationStats.workDays}일`, type: "일수" },
    { group: "일정", name: "경과일", value: `${operationStats.elapsedDays}일`, type: "일수" },
    { group: "비용분석", name: "인건비", value: totals.laborCost, type: "금액" },
    { group: "비용분석", name: "자재비", value: totals.materialCost, type: "금액" },
    { group: "비용분석", name: "장비대", value: totals.equipmentCost, type: "금액" },
    { group: "비용분석", name: "자재비교이익", value: totals.comparisonProfit, type: "금액" }
  ];
}

async function restoreFromGoogleSheet(options = {}) {
  const silent = Boolean(options.silent);
  const accessKey = options.accessKey || getAccessKey();
  if (!getSyncEndpoint()) {
    if (!silent) window.alert("환경설정에서 현재 프로젝트의 Apps Script 웹앱 URL을 먼저 저장해주세요.");
    return;
  }

  if (!accessKey) {
    if (!silent) window.alert("프로젝트 비밀번호로 다시 접속해주세요.");
    return false;
  }

  const confirmed = silent || window.confirm("구글시트에 저장된 자료를 현재 앱으로 불러올까요? 현재 앱의 선택 프로젝트 자료가 구글시트 기준으로 바뀝니다.");
  if (!confirmed) return false;

  elements.restoreSyncButton.disabled = true;
  elements.restoreSyncButton.textContent = "불러오는 중";

  try {
    const backup = await loadSheetBackupJsonp(accessKey);
    const projectName = getActiveProjectName();
    const stateData = backup.stateData || {};
    const scriptIsCurrent = backup.scriptVersion === REQUIRED_SCRIPT_VERSION;
    if (!scriptIsCurrent && silent) {
      throw new Error("이 프로젝트의 Apps Script가 최신 보안 버전이 아닙니다. 최신 코드를 배포한 뒤 다시 접속해주세요.");
    }
    const mergedDeletedRecords = mergeDeletedRecords(state.deletedRecords, stateData.deletedRecords);
    state.deletedRecords = mergedDeletedRecords;

    state.entries = [
      ...state.entries.filter((entry) => (entry.project || "제천2덕동골") !== projectName),
      ...normalizeEntries(backup.workEntries || [])
        .map((entry) => ({ ...entry, project: projectName, status: "synced" }))
        .filter((entry) => !isDeletedRecord("work", entry, projectName))
    ];
    state.materialOrders = [
      ...state.materialOrders.filter((entry) => (entry.project || "제천2덕동골") !== projectName),
      ...normalizeMaterialOrders(backup.materialOrders || [])
        .map((order) => ({ ...order, project: projectName, status: "synced" }))
        .filter((order) => !isDeletedRecord("material", order, projectName))
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
    if (!silent) {
      window.alert(scriptIsCurrent
        ? "구글시트 자료를 불러왔습니다."
        : "구글시트 자료를 불러왔습니다. Apps Script 최신 코드를 다시 배포해주세요.");
    }
    return true;
  } catch (error) {
    if (!silent) window.alert(error.message || "구글시트 자료를 불러오지 못했습니다. Apps Script 배포 권한과 URL을 확인해주세요.");
    if (silent) throw error;
    return false;
  } finally {
    elements.restoreSyncButton.disabled = false;
    elements.restoreSyncButton.textContent = "구글시트 불러오기";
  }
}

function loadSheetBackupJsonp(accessKey = getAccessKey()) {
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
      else cleanup(reject, new Error(payload?.message || (payload?.code === "UNAUTHORIZED" ? "프로젝트 비밀번호가 올바르지 않습니다." : "동기화에 실패했습니다.")));
    };

    script.onerror = () => cleanup(reject, new Error("load failed"));
    script.src = `${endpoint}${separator}action=load&project=${encodeURIComponent(getActiveProjectName())}&accessKey=${encodeURIComponent(accessKey)}&callback=${encodeURIComponent(callbackName)}`;
    document.body.append(script);
  });
}

function estimateCost(entry) {
  const amount = amountOf(entry.workAmount) || 1;
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

  const headers = ["날짜", "주공정", "부공정", "세부공정", "장비", "인부", "투입공수", "비용 구분", "비용", "결제여부", "비고", "도급", "도급총액"];
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
    entry.memo,
    entry.contractFlag ? "Y" : "",
    entry.contractTotal || ""
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
  state.entries = dedupeRecordsById(state.entries, (entry) => (entry.project || "제천2덕동골") === projectName);
  state.materialOrders = dedupeRecordsById(state.materialOrders, (order) => (order.project || "제천2덕동골") === projectName);
  if (state.entries.length !== beforeWork || state.materialOrders.length !== beforeMaterials) {
    saveState();
  }
}

function dedupeRecordsById(records, inScope) {
  const scoped = records.filter(inScope);
  const scopedIds = new Set();
  const keepRecords = new Set();
  for (let index = 0; index < scoped.length; index += 1) {
    const record = scoped[index];
    if (!record.id) {
      record.id = cryptoId();
    }
    if (scopedIds.has(record.id)) continue;
    scopedIds.add(record.id);
    keepRecords.add(record);
  }
  return records.filter((record) => !inScope(record) || keepRecords.has(record));
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

function workSyncKey(entry) {
  return [
    workContentKey(entry),
    entry.contractFlag ? "Y" : "",
    entry.contractTotal,
    entry.contractGroupId,
    entry.contractOriginalCost,
    entry.contractOriginalCostType
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

function markDeletedRecord(type, record) {
  if (!record) return;
  state.deletedRecords = normalizeDeletedRecords(state.deletedRecords);
  const project = record.project || getActiveProjectName();
  const key = type === "work" ? workContentKey(record) : materialContentKey(record);
  const id = record.id || "";
  const bucket = state.deletedRecords[type] || [];
  state.deletedRecords[type] = [
    ...bucket.filter((item) => !(item.project === project && (id ? item.id === id : item.key === key))),
    { project, id, key, deletedAt: new Date().toISOString() }
  ].slice(-300);
}

function isDeletedRecord(type, record, projectName = getActiveProjectName()) {
  const deleted = normalizeDeletedRecords(state.deletedRecords)[type] || [];
  const id = record.id || "";
  if (!id) return false;
  const cutoff = Date.now() - 30 * 86400000;
  return deleted.some((item) => {
    if (item.project !== projectName) return false;
    if (item.deletedAt && new Date(item.deletedAt).getTime() < cutoff) return false;
    return item.id === id;
  });
}

function normalizeDeletedRecords(value = {}) {
  return {
    work: Array.isArray(value.work) ? value.work : [],
    material: Array.isArray(value.material) ? value.material : []
  };
}

function mergeDeletedRecords(localValue = {}, remoteValue = {}) {
  const local = normalizeDeletedRecords(localValue);
  const remote = normalizeDeletedRecords(remoteValue);
  return {
    work: mergeDeletedBucket(local.work, remote.work),
    material: mergeDeletedBucket(local.material, remote.material)
  };
}

function mergeDeletedBucket(a = [], b = []) {
  const map = new Map();
  [...a, ...b].forEach((item) => {
    if (!item || !item.project || !item.key) return;
    map.set(`${item.project}|${item.id || ""}|${item.key}`, item);
  });
  return Array.from(map.values()).slice(-300);
}

async function verifyDeletedRecord(type, record) {
  await wait(1200);
  try {
    const backup = await loadSheetBackupJsonp();
    const rows = type === "work" ? normalizeEntries(backup.workEntries || []) : normalizeMaterialOrders(backup.materialOrders || []);
    const id = record.id || "";
    return !id || !rows.some((row) => row.id === id);
  } catch {
    return false;
  }
}

async function verifyDeletedRecordsCleared() {
  const deleted = normalizeDeletedRecords(state.deletedRecords);
  const projectName = getActiveProjectName();
  const relevant = [...deleted.work, ...deleted.material].filter((item) => item.project === projectName);
  if (!relevant.length) return true;
  await wait(1200);
  try {
    const backup = await loadSheetBackupJsonp();
    const workIds = new Set(normalizeEntries(backup.workEntries || []).map((entry) => entry.id).filter(Boolean));
    const materialIds = new Set(normalizeMaterialOrders(backup.materialOrders || []).map((order) => order.id).filter(Boolean));
    return deleted.work.filter((item) => item.project === projectName && item.id).every((item) => !workIds.has(item.id))
      && deleted.material.filter((item) => item.project === projectName && item.id).every((item) => !materialIds.has(item.id));
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function calculateTotals(workRows, materialRows) {
  const laborRows = workRows.filter((entry) => entry.costType === "인건비");
  const equipmentRows = workRows.filter((entry) => entry.costType === "장비대");
  const laborCost = sum(laborRows.map((entry) => amountOf(entry.cost)));
  const equipmentCost = sum(equipmentRows.map((entry) => amountOf(entry.cost)));
  const laborPaid = sum(laborRows.map(workPaidAmount));
  const laborCredit = sum(laborRows.map(workCreditAmount));
  const equipmentPaid = sum(equipmentRows.map(workPaidAmount));
  const equipmentCredit = sum(equipmentRows.map(workCreditAmount));
  const materialCost = sum(materialRows.map((entry) => amountOf(entry.orderAmount)));
  const materialCredit = sum(materialRows.map(materialCreditAmount));
  const materialPaid = Math.max(0, materialCost - materialCredit);
  const extraCredit = sum(projectExtraSummaryItems().filter((entry) => entry.type === "credit").map((entry) => amountOf(entry.amount)));
  const extraPaid = sum(projectExtraSummaryItems().filter((entry) => entry.type !== "credit").map((entry) => amountOf(entry.amount)));
  const credit = laborCredit + equipmentCredit + materialCredit + extraCredit;
  const comparisonProfit = sum(materialRows.map(materialComparisonProfit));
  const extraCost = sum(projectExtraSummaryItems().map((entry) => amountOf(entry.amount)));
  const paidAmount = laborPaid + equipmentPaid + materialPaid + extraPaid;
  return {
    laborCost,
    laborPaid,
    laborCredit,
    equipmentCost,
    equipmentPaid,
    equipmentCredit,
    materialCost,
    materialPaid,
    materialCredit,
    extraCost,
    extraPaid,
    extraCredit,
    credit,
    paidAmount,
    comparisonProfit,
    totalCost: laborCost + equipmentCost + materialCost + extraCost
  };
}

function isPaidPaymentStatus(status) {
  const text = String(status || "").trim();
  if (!text) return false;
  if (text === DEFAULT_PAYMENT_STATUS) return false;
  if (text.includes("외상") || text.includes("미지급") || text.includes("미결제")) return false;
  return true;
}

function workPaidAmount(entry) {
  return isPaidPaymentStatus(entry.paymentStatus) ? amountOf(entry.cost) : 0;
}

function workCreditAmount(entry) {
  return isPaidPaymentStatus(entry.paymentStatus) ? 0 : amountOf(entry.cost);
}

function materialCreditAmount(entry) {
  const orderAmount = amountOf(entry.orderAmount);
  const creditAmount = amountOf(entry.creditAmount);
  if (!creditAmount) return 0;
  return orderAmount > 0 ? Math.min(orderAmount, creditAmount) : creditAmount;
}

function materialComparisonProfit(entry) {
  const orderAmount = amountOf(entry.orderAmount);
  const highPrice = amountOf(entry.highPrice);
  return Math.max(0, highPrice - orderAmount);
}

function calculateOperationStats() {
  const startDate = getProjectStartDate();
  const endDate = isoToday;
  const workDays = startDate
    ? countUnique(projectEntries()
      .filter((row) => row.date && row.date >= startDate && row.date <= endDate)
      .map((row) => row.date))
    : 0;
  return {
    startDate,
    workDays,
    elapsedDays: elapsedDaysInclusive(startDate, endDate)
  };
}

function groupSum(rows, nameGetter, valueGetter) {
  const map = new Map();
  rows.forEach((row) => {
    const name = nameGetter(row);
    map.set(name, (map.get(name) || 0) + amountOf(valueGetter(row)));
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

function getProjectStartDate() {
  if (elements.summaryStart.value) return elements.summaryStart.value;
  const dates = [
    state.dashboard.constructionStartDate,
    ...projectEntries().map((row) => row.date),
    ...projectMaterialOrders().map((row) => row.date)
  ].filter(Boolean).sort();
  return dates[0] || "";
}

function elapsedDaysInclusive(start, end) {
  if (!start || !end || start > end) return 0;
  return daysBetween(start, end) + 1;
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
      syncEndpoint: configured.syncEndpoint || saved.syncEndpoint || "",
      spreadsheetId: configured.spreadsheetId || saved.spreadsheetId || ""
    };
  });
}

function normalizeConfig(config = {}) {
  return {
    processes: config.processes?.length ? config.processes : [],
    equipment: config.equipment?.length ? config.equipment : [],
    labor: config.labor?.length ? config.labor : [],
    payments: config.payments?.length ? config.payments.filter((item) => item !== "도급") : [],
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
    memo: entry.memo || "",
    contractFlag: Boolean(entry.contractFlag),
    paymentStatus: entry.paymentStatus === "도급" && Boolean(entry.contractFlag) ? "" : entry.paymentStatus || "",
    contractTotal: entry.contractTotal || "",
    contractGroupId: entry.contractGroupId || "",
    contractOriginalCost: entry.contractOriginalCost ?? "",
    contractOriginalCostType: entry.contractOriginalCostType || "",
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
      entries: parsed.entries?.length ? normalizeEntries(parsed.entries).map((entry) => ({ ...entry, project: entry.project || "제천2덕동골" })) : clone(seedState.entries),
      materialOrders: parsed.materialOrders?.length ? normalizeMaterialOrders(parsed.materialOrders).map((order) => ({ ...order, project: order.project || "제천2덕동골" })) : clone(seedState.materialOrders),
      projects: mergeProjects(parsed.projects || [], clone(seedState.projects)),
      extraSummaryItems: (parsed.extraSummaryItems || []).map((item) => ({ ...item, project: item.project || "제천2덕동골", type: item.type || "spent" })),
      deletedRecords: normalizeDeletedRecords(parsed.deletedRecords),
      editingEntryId: "",
      editingMaterialId: ""
    };
    loaded.config = normalizeConfig(loaded.config);
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
  const number = amountOf(value);
  if (!number) return "0원";
  return `${number.toLocaleString("ko-KR")}원`;
}

function formatWorkAmount(value) {
  if (String(value) === "1") return "일공수";
  if (String(value) === "0.5") return "반공수";
  return value || "";
}

function formatWorkAmountNumber(value) {
  const number = amountOf(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function numberOrBlank(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isNaN(number) ? "" : number;
}

function amountOf(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + amountOf(value), 0);
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
