const { google } = require('googleapis');
const webpush = require('web-push');

const SHEET_ID = '1fwGueaZ3otmqO1IODXDv7qe3NayQson1ICgnQHBJc0E';

exports.handler = async () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const managerEmail = process.env.MANAGER_EMAIL;

  const diagnostics = {
    hasPublicKey: !!publicKey,
    hasPrivateKey: !!privateKey,
    hasManagerEmail: !!managerEmail,
  };

  if (!publicKey || !privateKey) {
    return { statusCode: 200, body: JSON.stringify({ diagnostics, error: 'Missing VAPID keys' }) };
  }

  webpush.setVapidDetails(`mailto:${managerEmail}`, publicKey, privateKey);

  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Subscricoes!A2:D' });
  const rows = res.data.values || [];

  const results = [];
  for (const [id, endpoint, p256dh, auth2] of rows) {
    try {
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth: auth2 } },
        JSON.stringify({ title: 'Teste Vianta 🔔', body: 'Se vês isto, as notificações estão a funcionar!', url: '/gestor.html' })
      );
      results.push({ id, endpoint: endpoint.slice(0, 50) + '...', status: 'sent OK' });
    } catch (e) {
      results.push({ id, endpoint: endpoint.slice(0, 50) + '...', status: 'FAILED', error: e.message, statusCode: e.statusCode });
    }
  }

  return { statusCode: 200, body: JSON.stringify({ diagnostics, results }, null, 2) };
};
