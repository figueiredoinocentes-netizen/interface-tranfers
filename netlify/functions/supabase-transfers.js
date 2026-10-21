const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tuwcllpwvxzmrgrqviqu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

const TABLES = {
  transfers:   { headers: ['id','hotel','dir','name','adults','children','luggage','child_seat','payment','date','time','flight','arrival','notes','status','driver','vehicle','car_type','partner_id','created_at','child_ages','phone','price','origin','destination','service_type','driver_payout','tour_arrival','dropoff'] },
  drivers:     { headers: ['id','name','phone','active'] },
  vehicles:    { headers: ['id','name','active'] },
  partners:    { headers: ['id','slug','name','premium'] },
  pricing:     { headers: ['id','price_h2a_sedan','price_h2a_van','price_a2h_sedan','price_a2h_van','commission_percent'] },
  subscriptions: { headers: ['id','endpoint','p256dh','auth'] },
};

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

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, ...options.headers },
    ...options,
  });
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(`mailto:${process.env.MANAGER_EMAIL}`, publicKey, privateKey);
  return true;
}

async function sendPushNotifications(type, body) {
  if (!configureWebPush()) return;
  try {
    const rows = await supabaseFetch(`/rest/v1/subscriptions?select=id,endpoint,p256dh,auth`);
    if (!rows.length) return;
    const title = `Novo ${body.service_type === 'tour' ? 'tour' : 'transfer'} — ${body.hotel || ''}`;
    const payload = JSON.stringify({ title, body: `${body.name || 'Cliente'} — ${body.date || ''} ${body.time || ''}`, url: '/gestor.html' });
    await Promise.all(rows.map(async (sub) => {
      if (!sub.endpoint) return;
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (e) {
        console.error('Push failed for', sub.id, e.message);
      }
    }));
  } catch (e) {
    console.error('Push error:', e.message);
  }
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  const params = event.queryStringParameters || {};
  const type = params.type;
  if (!TABLES[type]) return err('Invalid type', 400);

  let body = {};
  try { if (event.body) body = JSON.parse(event.body); } catch (_) {}

  try {
    // GET — list records
    if (event.httpMethod === 'GET') {
      if (type === 'transfers') {
        const rows = await supabaseFetch(`/rest/v1/transfers?select=*&order=created_at.desc`);
        return ok(rows.filter(r => r.id));
      }
      const rows = await supabaseFetch(`/rest/v1/${type}?select=*&order=id.asc`);
      return ok(rows.filter(r => r.id));
    }

    // POST — create
    if (event.httpMethod === 'POST') {
      // Batch import
      if (type === 'transfers' && Array.isArray(body.transfers)) {
        const rows = body.transfers.map(t => ({
          ...t,
          id: t.id || String(Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
          created_at: t.created_at || new Date().toISOString(),
          status: t.status || 'pendente',
        }));
        await supabaseFetch(`/rest/v1/transfers`, {
          method: 'POST',
          headers: { 'Prefer': 'resolution=ignore-duplicates' },
          body: JSON.stringify(rows),
        });
        return ok({ ok: true, imported: rows.length });
      }

      // Check duplicate subscription
      if (type === 'subscriptions') {
        const existing = await supabaseFetch(`/rest/v1/subscriptions?endpoint=eq.${encodeURIComponent(body.endpoint)}&select=id`);
        if (existing.length) return ok({ ok: true, alreadySubscribed: true });
      }

      let newId;
      if (type === 'transfers') {
        newId = body.id || String(Date.now());
      } else if (type === 'pricing') {
        newId = body.id;
      } else {
        const existing = await supabaseFetch(`/rest/v1/${type}?select=id&order=id.desc&limit=1`);
        const maxId = existing.length ? parseInt(existing[0].id) || 0 : 0;
        newId = maxId + 1;
      }

      const record = { id: String(newId), ...body };
      if (type === 'transfers') {
        if (!record.created_at) record.created_at = new Date().toISOString();
        if (!record.status) record.status = 'pendente';
      } else if (type === 'drivers') {
        record.active = record.active !== undefined ? record.active : true;
      } else if (type === 'vehicles') {
        record.active = record.active !== undefined ? record.active : true;
      } else if (type === 'partners') {
        record.premium = record.premium !== undefined ? record.premium : true;
      }

      const result = await supabaseFetch(`/rest/v1/${type}`, {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(record),
      });

      if (type === 'transfers') {
        await sendTransferEmail(body, newId).catch(e => console.error('Email error:', e));
        await sendPushNotifications(type, body).catch(e => console.error('Push error:', e));
      }

      return ok({ ok: true, id: newId });
    }

    // PUT — update
    if (event.httpMethod === 'PUT') {
      const id = String(body.id);
      const updatableFields = type === 'transfers'
        ? ['hotel','dir','name','adults','children','luggage','child_seat','payment','date','time','flight','arrival','notes','status','driver','vehicle','car_type','child_ages','phone','price','origin','destination','service_type','tour_arrival','dropoff','driver_payout']
        : type === 'pricing'
        ? ['price_h2a_sedan','price_h2a_van','price_a2h_sedan','price_a2h_van','commission_percent']
        : type === 'partners'
        ? ['name', 'premium']
        : ['name','phone','active'];

      const updates = {};
      for (const field of updatableFields) {
        if (body[field] !== undefined) updates[field] = body[field];
      }
      if (!Object.keys(updates).length) return ok({ ok: true });

      await supabaseFetch(`/rest/v1/${type}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      return ok({ ok: true });
    }

    // DELETE
    if (event.httpMethod === 'DELETE') {
      // Batch hard delete
      if (type === 'transfers' && Array.isArray(body.ids)) {
        for (const id of body.ids) {
          await supabaseFetch(`/rest/v1/transfers?id=eq.${encodeURIComponent(String(id))}`, { method: 'DELETE' });
        }
        return ok({ ok: true, deleted: body.ids.length });
      }

      const id = String(body.id);
      if (type === 'transfers' && !body.hard) {
        // Soft delete
        await supabaseFetch(`/rest/v1/transfers?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelado' }),
        });
      } else {
        await supabaseFetch(`/rest/v1/${type}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      return ok({ ok: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    console.error(e);
    return err(e.message);
  }
};