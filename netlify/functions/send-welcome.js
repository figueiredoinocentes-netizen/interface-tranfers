exports.handler = async () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { statusCode: 500, body: 'Missing RESEND_API_KEY' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Vianta Transfers <onboarding@resend.dev>',
      to: ['pedro.inoc.rosa@gmail.com'],
      subject: 'Bem-vindo à Vianta Transfers 👋',
      html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#1A1A16;">
        <p>Olá Pedro,</p>
        <p>Bem-vindo à equipa Vianta Transfers! A partir de agora vais receber notificações por email sempre que chegar um novo pedido de transfer ou tour.</p>
        <p><a href="https://vianta-transfers.netlify.app/gestor.html">Abrir o gestor →</a></p>
        <p>Cumprimentos,<br>Equipa Vianta</p>
      </div>`,
    }),
  });

  const body = await res.text();
  return { statusCode: res.status, body };
};
