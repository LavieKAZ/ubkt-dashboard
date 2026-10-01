const TRACKER_CONFIG_SHEET = '99_Cau_hinh_ky';
const TRACKER_SUMMARY_SHEET = '01_Tong_quan';
const TRACKER_DATA_ROW = 5;
const TRACKER_PERIOD_START_COLUMN = 4;
const TRACKER_PERIOD_WIDTH = 3;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Quản lý kỳ báo cáo')
    .addItem('Kiểm tra và mở/khóa kỳ', 'maintainReportingPeriods')
    .addItem('Cài lịch kiểm tra tự động hằng ngày', 'installDailyAutomation')
    .addSeparator()
    .addItem('Bảo vệ cột nội dung cố định', 'protectFixedContent')
    .addToUi();
}

function doGet() {
  return jsonOutput_({ ok: true, service: 'UBKT Resolution Tracker', version: 1 });
}

function doPost(e) {
  try {
    const request = JSON.parse(e && e.postData && e.postData.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (!expected || request.token !== expected) throw new Error('Mã đồng bộ không hợp lệ.');
    if (request.action !== 'export') throw new Error('Yêu cầu không được hỗ trợ.');
    return jsonOutput_(buildDashboardPayload_());
  } catch (error) {
    return jsonOutput_({ error: error.message || 'Không xuất được dữ liệu.' });
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function resolutionSheets_() {
  return SpreadsheetApp.getActive().getSheets().filter(sheet => /^\d{2}_NQ\d+/i.test(sheet.getName()));
}

function periodGroups_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), TRACKER_PERIOD_START_COLUMN - 1);
  const labels = sheet.getRange(3, TRACKER_PERIOD_START_COLUMN, 1, Math.max(0, lastColumn - TRACKER_PERIOD_START_COLUMN + 1)).getDisplayValues()[0] || [];
  const groups = [];
  for (let offset = 0; offset < labels.length; offset += TRACKER_PERIOD_WIDTH) {
    const label = String(labels[offset] || '').trim();
    if (label) groups.push({ key: slug_(label), label: label, startColumn: TRACKER_PERIOD_START_COLUMN + offset });
  }
  return groups;
}

function buildDashboardPayload_() {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheets = resolutionSheets_();
  const canonicalPeriods = sheets.length ? periodGroups_(sheets[0]) : [];
  const resolutions = sheets.map((sheet, index) => {
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    const values = lastRow >= TRACKER_DATA_ROW
      ? sheet.getRange(TRACKER_DATA_ROW, 1, lastRow - TRACKER_DATA_ROW + 1, lastColumn).getDisplayValues()
      : [];
    const number = String(sheet.getRange('A1').getDisplayValue() || sheet.getName()).trim();
    const title = String(sheet.getRange('A2').getDisplayValue() || number).trim();
    const periods = periodGroups_(sheet);
    const items = values.filter(row => String(row[0] || '').trim()).map(row => ({
      id: String(row[0]).trim(),
      content: String(row[1] || '').trim(),
      unit: String(row[2] || '').trim(),
      periods: periods.map(period => ({
        key: period.key,
        label: period.label,
        status: String(row[period.startColumn - 1] || 'Chưa cập nhật').trim(),
        result: String(row[period.startColumn] || '').trim(),
        evidence: String(row[period.startColumn + 1] || '').trim(),
      })),
    }));
    return { id: sheet.getName(), order: index + 1, number: number, title: title, shortTitle: compactTitle_(title), items: items };
  });
  return {
    version: 1,
    spreadsheetId: spreadsheet.getId(),
    sourceUpdatedAt: new Date().toISOString(),
    periods: canonicalPeriods.map(period => ({ key: period.key, label: period.label, locked: isPeriodLocked_(period.label) })),
    resolutions: resolutions,
  };
}

function compactTitle_(title) {
  const main = String(title || '').split(' (Nội dung báo cáo')[0].trim();
  const marker = main.toLowerCase().indexOf(' về ');
  return marker >= 0 ? main.slice(marker + 4).trim() : main;
}

function slug_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase();
}

function configRows_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(TRACKER_CONFIG_SHEET);
  if (!sheet || sheet.getLastRow() < TRACKER_DATA_ROW) return [];
  return sheet.getRange(TRACKER_DATA_ROW, 1, sheet.getLastRow() - TRACKER_DATA_ROW + 1, 6).getValues().map((row, index) => ({
    row: TRACKER_DATA_ROW + index,
    id: String(row[0] || '').trim(),
    label: String(row[1] || '').trim(),
    opensAt: row[2] instanceof Date ? row[2] : null,
    locksAt: row[3] instanceof Date ? row[3] : null,
    status: String(row[4] || '').trim(),
  })).filter(item => item.id && item.label);
}

function maintainReportingPeriods() {
  const now = new Date();
  const configSheet = SpreadsheetApp.getActive().getSheetByName(TRACKER_CONFIG_SHEET);
  configRows_().forEach(period => {
    if (period.opensAt && now >= period.opensAt) ensurePeriodExists_(period.label);
    if (period.locksAt && now > endOfDay_(period.locksAt)) {
      lockPeriod_(period.label);
      configSheet.getRange(period.row, 5).setValue('Đã khóa');
    } else if (period.opensAt && now >= period.opensAt) {
      configSheet.getRange(period.row, 5).setValue('Đang mở');
    } else {
      configSheet.getRange(period.row, 5).setValue('Sắp mở');
    }
  });
  SpreadsheetApp.flush();
}

function ensurePeriodExists_(label) {
  resolutionSheets_().forEach(sheet => {
    if (periodGroups_(sheet).some(period => period.label === label)) return;
    const startColumn = sheet.getLastColumn() + 1;
    sheet.insertColumnsAfter(sheet.getLastColumn(), TRACKER_PERIOD_WIDTH);
    sheet.getRange(3, TRACKER_PERIOD_START_COLUMN, 2, TRACKER_PERIOD_WIDTH)
      .copyTo(sheet.getRange(3, startColumn, 2, TRACKER_PERIOD_WIDTH), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    sheet.getRange(3, startColumn).setValue(label);
    sheet.getRange(4, startColumn, 1, 3).setValues([['Trạng thái', 'Kết quả, số liệu và văn bản', 'Minh chứng']]);
    const rowCount = Math.max(0, sheet.getLastRow() - TRACKER_DATA_ROW + 1);
    if (rowCount) {
      sheet.getRange(TRACKER_DATA_ROW, TRACKER_PERIOD_START_COLUMN, rowCount, TRACKER_PERIOD_WIDTH)
        .copyTo(sheet.getRange(TRACKER_DATA_ROW, startColumn, rowCount, TRACKER_PERIOD_WIDTH), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      sheet.getRange(TRACKER_DATA_ROW, TRACKER_PERIOD_START_COLUMN, rowCount, 1)
        .copyTo(sheet.getRange(TRACKER_DATA_ROW, startColumn, rowCount, 1), SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      sheet.getRange(TRACKER_DATA_ROW, startColumn, rowCount, TRACKER_PERIOD_WIDTH).clearContent();
      sheet.getRange(TRACKER_DATA_ROW, startColumn, rowCount, 1).setValue('Chưa cập nhật');
    }
  });
  updateSummaryForLatestPeriod_();
}

function updateSummaryForLatestPeriod_() {
  const summary = SpreadsheetApp.getActive().getSheetByName(TRACKER_SUMMARY_SHEET);
  if (!summary) return;
  resolutionSheets_().forEach((sheet, index) => {
    const row = TRACKER_DATA_ROW + index;
    const periods = periodGroups_(sheet);
    if (!periods.length) return;
    const period = periods[periods.length - 1];
    const statusColumn = columnLetter_(period.startColumn);
    const lastRow = sheet.getLastRow();
    const quoted = `'${sheet.getName().replace(/'/g, "''")}'`;
    summary.getRange(row, 4).setFormula(`=COUNTIF(${quoted}!${statusColumn}${TRACKER_DATA_ROW}:${statusColumn}${lastRow},"<>Chưa cập nhật")`);
    summary.getRange(row, 5).setFormula(`=COUNTIF(${quoted}!${statusColumn}${TRACKER_DATA_ROW}:${statusColumn}${lastRow},"Hoàn thành")`);
    summary.getRange(row, 6).setFormula(`=IF(C${row}=0,"",D${row}/C${row})`);
  });
}

function lockPeriod_(label) {
  resolutionSheets_().forEach(sheet => {
    const period = periodGroups_(sheet).find(item => item.label === label);
    if (!period) return;
    const description = `UBKT_LOCK_${slug_(label)}`;
    if (sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(item => item.getDescription() === description)) return;
    const range = sheet.getRange(3, period.startColumn, Math.max(2, sheet.getLastRow() - 2), TRACKER_PERIOD_WIDTH);
    applyOwnerOnlyProtection_(range.protect().setDescription(description));
  });
}

function protectFixedContent() {
  resolutionSheets_().forEach(sheet => {
    const description = 'UBKT_FIXED_CONTENT';
    if (sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(item => item.getDescription() === description)) return;
    applyOwnerOnlyProtection_(sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 4), 3).protect().setDescription(description));
  });
}

function applyOwnerOnlyProtection_(protection) {
  const owner = Session.getEffectiveUser();
  protection.addEditor(owner);
  const removable = protection.getEditors().filter(user => user.getEmail() !== owner.getEmail());
  if (removable.length) protection.removeEditors(removable);
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}

function isPeriodLocked_(label) {
  return resolutionSheets_().some(sheet => sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(item => item.getDescription() === `UBKT_LOCK_${slug_(label)}`));
}

function installDailyAutomation() {
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'maintainReportingPeriods').forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('maintainReportingPeriods').timeBased().everyDays(1).atHour(0).create();
  SpreadsheetApp.getUi().alert('Đã cài lịch kiểm tra mở kỳ và khóa kỳ tự động hằng ngày.');
}

function endOfDay_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function columnLetter_(column) {
  let result = '';
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}
