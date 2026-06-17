const SHEET_NAME = 'Transfers';

function getSheet() {
  const ss = SpreadsheetApp.openById('1fwGueaZ3otmqO1IODXDv7qe3NayQson1ICgnQHBJc0E');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'id','hotel','dir','name','adults','children','luggage',
      'childSeat','payment','date','time','flight','arrival','notes',
      'status','driver','createdAt'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function formatVal(val, key) {
  if (!(val instanceof Date)) return val;
  const tz = Session.getScriptTimeZone();
  if (['date'].includes(key)) return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
  if (['time','arrival'].includes(key)) return Utilities.formatDate(val, tz, 'HH:mm');
  return val.toISOString();
}

function doGet(e) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const transfers = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = formatVal(row[i], h));
    return obj;
  }).reverse();

  return ContentService
    .createTextOutput(JSON.stringify(transfers))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheet = getSheet();
  const data = JSON.parse(e.postData.contents);
  const action = data._action || e.parameter.action;

  if (action === 'update') {
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    const idCol = headers.indexOf('id');
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol]) === String(data.id)) {
        if (data.driver !== undefined) {
          sheet.getRange(i + 1, headers.indexOf('driver') + 1).setValue(data.driver);
        }
        if (data.status !== undefined) {
          sheet.getRange(i + 1, headers.indexOf('status') + 1).setValue(data.status);
        }
        break;
      }
    }
  } else {
    sheet.appendRow([
      data.id, data.hotel, data.dir, data.name,
      data.adults, data.children, data.luggage,
      data.childSeat, data.payment, data.date, data.time,
      data.flight, data.arrival, data.notes,
      data.status, data.driver,
      new Date().toISOString()
    ]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
