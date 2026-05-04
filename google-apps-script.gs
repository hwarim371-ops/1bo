const SPREADSHEET_ID = "1Sz3iPbehkbM_Ows1tQ8WXC8XSb8WWSVC6PbzG0xmk1A";
const WORK_HEADERS = ["", "날짜", "주공정", "부공정", "세부공정", "장비", "인부", "투입공수", "비용 구분", "비용", "결제여부", "비고"];
const MATERIAL_HEADERS = ["", "날짜", "공정", "제품", "업체명", "지역", "발주 금액", "최저가", "최고가", "비고", "외상금액"];
const SUMMARY_HEADERS = ["프로젝트", "그룹", "항목", "값", "구분", "저장일"];
const APP_STATE_HEADERS = ["프로젝트", "키", "값", "수정일"];

function setupSheets() {
  const ss = getSpreadsheet_({});
  getOrCreateSheet_(ss, "업무현황", WORK_HEADERS);
  getOrCreateSheet_(ss, "자재현황", MATERIAL_HEADERS);
  getOrCreateSheet_(ss, "최종현황", SUMMARY_HEADERS);
  getOrCreateSheet_(ss, "앱저장소", APP_STATE_HEADERS);
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const ss = getSpreadsheet_(params);
  const project = params.project || "제천2덕동골";
  const payload = {
    ok: true,
    project,
    workEntries: readWorkEntries_(ss, project),
    materialOrders: readMaterialOrders_(ss, project),
    stateData: readAppState_(ss, project),
    summarySnapshot: readSummarySnapshot_(ss, project)
  };
  return jsonp_(payload, params.callback);
}

function doPost(e) {
  const payload = parsePayload_(e);
  const ss = getSpreadsheet_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const records = Array.isArray(payload.records) ? payload.records : [];

    if (payload.type === "workEntries") {
      const sheet = getOrCreateSheet_(ss, "업무현황", WORK_HEADERS);
      records.forEach((record) => appendWorkEntry_(sheet, record));
    }

    if (payload.type === "materialOrders") {
      const sheet = getOrCreateSheet_(ss, "자재현황", MATERIAL_HEADERS);
      records.forEach((record) => appendMaterialOrder_(sheet, record));
    }

    if (payload.type === "summarySnapshot") {
      saveSummarySnapshot_(ss, payload.project || "제천2덕동골", records);
    }

    if (payload.type === "appState") {
      saveAppState_(ss, payload.project || "제천2덕동골", payload.stateData || {});
    }

    return json_({ ok: true, type: payload.type, count: records.length });
  } catch (error) {
    return json_({ ok: false, message: error.message });
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_(payload) {
  if (payload.spreadsheetId) {
    return SpreadsheetApp.openById(payload.spreadsheetId);
  }
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  return {};
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = firstRow.every((value) => value === "");
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function appendWorkEntry_(sheet, record) {
  sheet.appendRow([
    "",
    toSheetDate_(record.date),
    record.mainProcess || "",
    record.subProcess || "",
    record.detailProcess || "",
    record.equipment || "",
    record.labor || "",
    numberOrBlank_(record.workAmount),
    record.costType || "",
    numberOrBlank_(record.cost),
    record.paymentStatus || "",
    record.memo || ""
  ]);
}

function appendMaterialOrder_(sheet, record) {
  sheet.appendRow([
    "",
    toSheetDate_(record.date),
    record.process || "",
    record.product || "",
    record.vendor || "",
    record.area || "",
    numberOrBlank_(record.orderAmount),
    numberOrBlank_(record.lowPrice),
    numberOrBlank_(record.highPrice),
    record.memo || "",
    numberOrBlank_(record.creditAmount)
  ]);
}

function saveSummarySnapshot_(ss, project, records) {
  const sheet = getOrCreateSheet_(ss, "최종현황", SUMMARY_HEADERS);
  const savedAt = new Date();
  const rows = records.map((record) => [
    project,
    record.group || "",
    record.name || "",
    record.value === undefined || record.value === null ? "" : record.value,
    record.type || "",
    savedAt
  ]);
  replaceProjectRows_(sheet, project, rows);
}

function saveAppState_(ss, project, stateData) {
  const sheet = getOrCreateSheet_(ss, "앱저장소", APP_STATE_HEADERS);
  const row = [
    project,
    "appState",
    JSON.stringify({
      ...stateData,
      savedAt: stateData.savedAt || new Date().toISOString()
    }),
    new Date()
  ];
  replaceProjectKeyRows_(sheet, project, "appState", [row]);
}

function readWorkEntries_(ss, project) {
  const sheet = ss.getSheetByName("업무현황");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, WORK_HEADERS.length).getValues();
  return values
    .map((row, index) => ({
      id: "sheet-work-" + (index + 2),
      project,
      sourceRow: index + 2,
      date: toIsoDate_(row[1]),
      mainProcess: row[2] || "",
      subProcess: row[3] || "",
      detailProcess: row[4] || "",
      equipment: row[5] || "",
      labor: row[6] || "",
      workAmount: row[7] || "",
      costType: row[8] || "",
      cost: row[9] || "",
      paymentStatus: row[10] || "",
      memo: row[11] || "",
      status: "synced"
    }))
    .filter((record) => record.date || record.mainProcess || record.subProcess || record.equipment || record.labor);
}

function readMaterialOrders_(ss, project) {
  const sheet = ss.getSheetByName("자재현황");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, MATERIAL_HEADERS.length).getValues();
  return values
    .map((row, index) => ({
      id: "sheet-material-" + (index + 2),
      project,
      sourceRow: index + 2,
      date: toIsoDate_(row[1]),
      process: row[2] || "",
      product: row[3] || "",
      vendor: row[4] || "",
      area: row[5] || "",
      orderAmount: row[6] || "",
      lowPrice: row[7] || "",
      highPrice: row[8] || "",
      memo: row[9] || "",
      creditAmount: row[10] || "",
      status: "synced"
    }))
    .filter((record) => record.date || record.process || record.product || record.vendor);
}

function readAppState_(ss, project) {
  const sheet = ss.getSheetByName("앱저장소");
  if (!sheet || sheet.getLastRow() < 2) return {};
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, APP_STATE_HEADERS.length).getValues();
  const rows = values.filter((row) => row[0] === project && row[1] === "appState");
  if (!rows.length) return {};
  try {
    return JSON.parse(rows[rows.length - 1][2] || "{}");
  } catch (error) {
    return {};
  }
}

function readSummarySnapshot_(ss, project) {
  const sheet = ss.getSheetByName("최종현황");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SUMMARY_HEADERS.length).getValues();
  return values
    .filter((row) => row[0] === project)
    .map((row) => ({
      project: row[0],
      group: row[1],
      name: row[2],
      value: row[3],
      type: row[4],
      savedAt: toIsoDate_(row[5]) || row[5] || ""
    }));
}

function replaceProjectRows_(sheet, project, rows) {
  deleteMatchingRows_(sheet, (row) => row[0] === project);
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function replaceProjectKeyRows_(sheet, project, key, rows) {
  deleteMatchingRows_(sheet, (row) => row[0] === project && row[1] === key);
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function deleteMatchingRows_(sheet, matcher) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (matcher(values[index])) {
      sheet.deleteRow(index + 2);
    }
  }
}

function toSheetDate_(value) {
  if (!value) return "";
  const parts = String(value).split("-");
  if (parts.length !== 3) return value;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function toIsoDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value).trim();
  const matched = text.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!matched) return text;
  return matched[1] + "-" + String(matched[2]).padStart(2, "0") + "-" + String(matched[3]).padStart(2, "0");
}

function numberOrBlank_(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isNaN(number) ? "" : number;
}

function jsonp_(value, callback) {
  const body = callback
    ? String(callback).replace(/[^\w.$]/g, "") + "(" + JSON.stringify(value) + ");"
    : JSON.stringify(value);
  return ContentService
    .createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
