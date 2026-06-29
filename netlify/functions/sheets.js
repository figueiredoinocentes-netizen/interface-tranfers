const { google } = require('googleapis');

const SHEET_ID = '1fwGueaZ3otmqO1IODXDv7qe3NayQson1ICgnQHBJc0E';
const DRIVERS_SHEET = 'Motoristas';
const VEHICLES_SHEET = 'Viaturas';

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };
}

async function ensureSheet(sheets, name, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === name);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: name } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  try {
    const sheets = await getSheets();
    const params = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    const type = params.type; // 'drivers' or 'vehicles'
    const sheetName = type === 'drivers' ? DRIVERS_SHEET : VEHICLES_SHEET;

    // GET — list all active
    if (event.httpMethod === 'GET') {
      if (type === 'drivers') await ensureSheet(sheets, DRIVERS_SHEET, ['id', 'name', 'phone', 'active']);
      else await ensureSheet(sheets, VEHICLES_SHEET, ['id', 'name', 'active']);

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A2:Z`,
      });
      const rows = res.data.values || [];
      const headers = type === 'drivers' ? ['id', 'name', 'phone', 'active'] : ['id', 'name', 'active'];
      const items = rows
        .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])))
        .filter(r => r.active !== 'false' && r.id);
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(items) };
    }

    // POST — add new
    if (event.httpMethod === 'POST') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: `${sheetName}!A2:A`,
      });
      const rows = res.data.values || [];
      const newId = rows.length > 0 ? Math.max(...rows.map(r => parseInt(r[0]) || 0)) + 1 : 1;
      const newRow = type === 'drivers'
        ? [newId, body.name, body.phone || '', 'true']
        : [newId, body.name, 'true'];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] },
      });
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, id: newId }) };
    }

    // DELETE — mark inactive
    if (event.httpMethod === 'DELETE') {
      const id = String(body.id);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: `${sheetName}!A2:Z`,
      });
      const rows = res.data.values || [];
      const rowIndex = rows.findIndex(r => String(r[0]) === id);
      if (rowIndex === -1) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Not found' }) };

      const activeCol = type === 'drivers' ? 'D' : 'C';
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!${activeCol}${rowIndex + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [['false']] },
      });
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) };
  }
};
