const { google } = require('googleapis');
const webpush = require('web-push');

const SHEET_ID = '1fwGueaZ3otmqO1IODXDv7qe3NayQson1ICgnQHBJc0E';

// Converts a 0-based column index to its spreadsheet letter (0->A, 25->Z, 26->AA, ...)
function colLetter(index) {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(`mailto:${process.env.MANAGER_EMAIL}`, publicKey, privateKey);
  return true;
}

async function sendPushNotifications(sheets, data) {
  if (!configureWebPush()) return;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Subscricoes!A2:D' }).catch(() => null);
  const rows = res && res.data.values ? res.data.values : [];
  if (!rows.length) return;

  const title = `Novo ${data.service_type === 'tour' ? 'tour' : 'transfer'} — ${data.hotel || ''}`;
  const body = `${data.name || 'Cliente'} — ${data.date || ''} ${data.time || ''}`;
  const payload = JSON.stringify({ title, body, url: '/gestor.html' });

  await Promise.all(rows.map(async ([id, endpoint, p256dh, auth]) => {
    if (!endpoint) return;
    try {
      await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload);
    } catch (e) {
      console.error('Push failed for subscription', id, e.message);
    }
  }));
}

async function sendTransferEmail(data, id) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = [process.env.MANAGER_EMAIL, 'pedro.inoc.rosa@gmail.com'].filter(Boolean);
  if (!apiKey || !to.length) return;

  const lines = [
    `<b>Novo ${data.service_type === 'tour' ? 'tour' : 'transfer'} recebido</b>`,
    ``,
    `<b>Hotel:</b> ${data.hotel || '—'}`,
    `<b>Tipo de serviço:</b> ${data.service_type === 'tour' ? 'Tour' : 'Transfer'}`,
    `<b>Cliente:</b> ${data.name || '—'}`,
    `<b>Telemóvel:</b> ${data.phone || '—'}`,
    `<b>Data:</b> ${data.date || '—'} ${data.time || ''}`,
    data.service_type === 'tour'
      ? `<b>Percurso:</b> ${data.origin || '—'} → ${data.destination || '—'} → ${data.dropoff || '—'}`
      : `<b>Direção:</b> ${data.dir === 'custom' ? (data.origin || '—') + ' → ' + (data.destination || '—') : data.dir === 'a2h' ? 'Aeroporto → Hotel' : 'Hotel → Aeroporto'}`,
    `<b>Adults:</b> ${data.adults || '0'} | <b>Crianças:</b> ${data.children || '0'}`,
    `<b>Bagagem:</b> ${data.luggage || '0'}`,
    data.service_type === 'tour'
      ? `<b>Início:</b> ${data.time || '—'} | <b>Fim:</b> ${data.tour_arrival || '—'}`
      : `<b>Voo:</b> ${data.flight || '—'} | <b>Chegada:</b> ${data.arrival || '—'}`,
    `<b>Pagamento:</b> ${data.payment || '—'}`,
    data.child_seat && data.child_ages ? `<b>Idade(s) da(s) criança(s):</b> ${data.child_ages}` : '',
    data.notes ? `<b>Notas:</b> ${data.notes}` : '',
    ``,
    `<a href="https://vianta-transfers.netlify.app/gestor.html">Abrir gestor →</a>`,
  ].filter(l => l !== null).join('<br>');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Vianta Transfers <onboarding@resend.dev>',
      to,
      subject: `Novo transfer — ${data.hotel || ''} ${data.date || ''}`,
      html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${lines}</div>`,
    }),
  });
}

const SHEETS = {
  transfers: { name: 'Transfers', headers: ['id','hotel','dir','name','adults','children','luggage','child_seat','payment','date','time','flight','arrival','notes','status','driver','vehicle','car_type','partner_id','created_at','child_ages','phone','price','origin','destination','service_type','tour_arrival','dropoff'] },
  drivers:   { name: 'Motoristas', headers: ['id','name','phone','active'] },
  vehicles:  { name: 'Viaturas',   headers: ['id','name','active'] },
  partners:  { name: 'Parceiros',  headers: ['id','slug','name'] },
  // one row per partner; 'id' holds the partner's id (1:1 relationship)
  pricing:   { name: 'Precos', headers: ['id','price_h2a_sedan','price_h2a_van','price_a2h_sedan','price_a2h_van','commission_percent'] },
  subscriptions: { name: 'Subscricoes', headers: ['id','endpoint','p256dh','auth'] },
};

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function ok(data) { return { statusCode: 200, headers: cors(), body: JSON.stringify(data) }; }
function err(msg, code = 500) { return { statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) }; }

async function ensureSheet(sheets, type) {
  const cfg = SHEETS[type];
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === cfg.name);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: cfg.name } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${cfg.name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [cfg.headers] },
    });
  }
}

async function getRows(sheets, type) {
  const cfg = SHEETS[type];
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${cfg.name}!A2:Z`,
  });
  const rows = res.data.values || [];
  return rows.map(row => Object.fromEntries(cfg.headers.map((h, i) => [h, row[i] ?? ''])));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  const params = event.queryStringParameters || {};
  const type = params.type; // transfers | drivers | vehicles
  if (!SHEETS[type]) return err('Invalid type', 400);

  let body = {};
  try { if (event.body) body = JSON.parse(event.body); } catch (_) {}

  try {
    const sheets = await getSheetsClient();
    await ensureSheet(sheets, type);
    const cfg = SHEETS[type];

    // GET
    if (event.httpMethod === 'GET') {
      const rows = await getRows(sheets, type);
      const active = type === 'transfers'
        ? rows.filter(r => r.id)
        : rows.filter(r => r.active !== 'false' && r.id);
      // sort transfers by date desc
      if (type === 'transfers') active.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return ok(active);
    }

    // POST — create
    if (event.httpMethod === 'POST') {
      const existingRows = await getRows(sheets, type);

      // BATCH IMPORT — array of transfers in body.transfers
      if (type === 'transfers' && Array.isArray(body.transfers)) {
        const rows = body.transfers.map(t => {
          const newId = t.id || String(Date.now() + '_' + Math.random().toString(36).slice(2, 8));
          const row = cfg.headers.map(h => {
            if (h === 'id') return newId;
            if (h === 'created_at') return new Date().toISOString();
            if (h === 'status') return t.status || 'pendente';
            return t[h] ?? '';
          });
          return row;
        });
        // Write all rows at once
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${cfg.name}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: rows },
        });
        return ok({ ok: true, imported: rows.length });
      }

      if (type === 'subscriptions' && existingRows.some(r => r.endpoint === body.endpoint)) {
        return ok({ ok: true, alreadySubscribed: true });
      }

      let newId;
      if (type === 'transfers') {
        newId = body.id || String(Date.now());
      } else if (type === 'pricing') {
        newId = body.id; // reuses the partner's own id (1:1 relationship)
      } else {
        const ids = existingRows.map(r => parseInt(r.id) || 0);
        newId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
      }

      let newRow;
      if (type === 'transfers') {
        newRow = cfg.headers.map(h => body[h] ?? '');
        newRow[cfg.headers.indexOf('id')] = newId;
        newRow[cfg.headers.indexOf('created_at')] = new Date().toISOString();
        if (!body.status) newRow[cfg.headers.indexOf('status')] = 'pendente';
      } else if (type === 'drivers') {
        newRow = [newId, body.name || '', body.phone || '', 'true'];
      } else if (type === 'vehicles') {
        newRow = [newId, body.name || '', 'true'];
      } else if (type === 'partners') {
        newRow = [newId, body.slug || '', body.name || ''];
      } else if (type === 'pricing') {
        newRow = [newId, body.price_h2a_sedan || '', body.price_h2a_van || '', body.price_a2h_sedan || '', body.price_a2h_van || '', body.commission_percent || ''];
      } else if (type === 'subscriptions') {
        newRow = [newId, body.endpoint || '', body.p256dh || '', body.auth || ''];
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${cfg.name}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] },
      });

      if (type === 'transfers') {
        await sendTransferEmail(body, newId).catch(e => console.error('Email error:', e));
        await sendPushNotifications(sheets, body).catch(e => console.error('Push error:', e));
      }

      return ok({ ok: true, id: newId });
    }

    // PUT — update transfer (status, driver, vehicle, or full edit)
    if (event.httpMethod === 'PUT') {
      const id = String(body.id);
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${cfg.name}!A2:Z` });
      const rows = res.data.values || [];
      const rowIndex = rows.findIndex(r => String(r[0]) === id);
      if (rowIndex === -1) return err('Not found', 404);

      const sheetRow = rowIndex + 2;
      const updatableFields = type === 'transfers'
        ? ['hotel','dir','name','adults','children','luggage','child_seat','payment','date','time','flight','arrival','notes','status','driver','vehicle','car_type','child_ages','phone','price','origin','destination','service_type','tour_arrival','dropoff']
        : type === 'pricing'
        ? ['price_h2a_sedan','price_h2a_van','price_a2h_sedan','price_a2h_van','commission_percent']
        : type === 'partners'
        ? ['name']
        : ['name','phone','active'];

      const updates = [];
      for (const field of updatableFields) {
        if (body[field] !== undefined) {
          const colIndex = cfg.headers.indexOf(field);
          if (colIndex === -1) continue;
          const col = colLetter(colIndex);
          updates.push({ range: `${cfg.name}!${col}${sheetRow}`, values: [[body[field]]] });
        }
      }
      if (updates.length) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'RAW', data: updates },
        });
      }
      return ok({ ok: true });
    }

    // DELETE — hard delete row (drivers/vehicles) or status=cancelado (transfers)
    if (event.httpMethod === 'DELETE') {
      const id = String(body.id);
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${cfg.name}!A2:Z` });
      const rows = res.data.values || [];
      const rowIndex = rows.findIndex(r => String(r[0]) === id);
      if (rowIndex === -1) return err('Not found', 404);

      const sheetRow = rowIndex + 2;
      if (type === 'transfers') {
        // soft delete — keep row but mark as cancelado
        const col = colLetter(cfg.headers.indexOf('status'));
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID, range: `${cfg.name}!${col}${sheetRow}`,
          valueInputOption: 'RAW', requestBody: { values: [['cancelado']] },
        });
      } else {
        // hard delete — get sheet tab ID and delete the row entirely
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
        const tab = meta.data.sheets.find(s => s.properties.title === cfg.name);
        if (!tab) return err('Sheet tab not found', 404);
        const sheetId = tab.properties.sheetId;
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: { sheetId, dimension: 'ROWS', startIndex: sheetRow - 1, endIndex: sheetRow }
              }
            }]
          }
        });
      }
      return ok({ ok: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    console.error(e);
    return err(e.message);
  }
};
