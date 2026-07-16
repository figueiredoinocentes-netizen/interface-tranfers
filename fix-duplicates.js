const { google } = require('googleapis');
const fs = require('fs');
const SHEET_ID = '1fwGueaZ3otmqO1IODXDv7qe3NayQson1ICgnQHBJc0E';
const creds = JSON.parse(fs.readFileSync('C:\\Users\\franc\\Downloads\\mythic-hulling-462609-t6-ae8de06612e7.json', 'utf8'));

async function main() {
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Precos!A1:Z' });
  const rows = res.data.values || [];
  console.log('All rows:', JSON.stringify(rows));

  // find duplicate rows by id (col A), keep first occurrence, delete the rest
  const seen = new Set();
  const rowsToDelete = []; // 0-indexed sheet row numbers
  for (let i = 1; i < rows.length; i++) {
    const id = rows[i][0];
    if (seen.has(id)) {
      rowsToDelete.push(i); // 0-indexed within full rows array (row i+1 in sheet, 1-indexed)
    } else {
      seen.add(id);
    }
  }
  console.log('Rows to delete (0-indexed within full sheet):', rowsToDelete);

  if (rowsToDelete.length === 0) { console.log('No duplicates found.'); return; }

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tab = meta.data.sheets.find(s => s.properties.title === 'Precos');
  const sheetId = tab.properties.sheetId;

  // delete from bottom to top to keep indices valid
  const requests = rowsToDelete.sort((a,b) => b-a).map(idx => ({
    deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } }
  }));

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  console.log('Deleted', requests.length, 'duplicate rows.');
}
main().catch(console.error);
