async function sendAuthEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Authentication email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Authentication email provider returned ${response.status}.`);
  return response.json();
}

function createAuthEmailSender(send = sendAuthEmail) {
  return {
    sendOtp: (email, code) => send({
      to: email,
      subject: 'Mã xác minh tài khoản Bếp Phố Hội An',
      html: `<p>Mã xác minh của bạn là <strong>${code}</strong>.</p><p>Mã có hiệu lực trong 10 phút.</p>`
    }),
    sendPasswordReset: (email, token) => {
      const base = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
      if (!base) throw new Error('PUBLIC_BASE_URL is not configured.');
      const link = `${base}/reset?token=${encodeURIComponent(token)}`;
      return send({
        to: email,
        subject: 'Đặt lại mật khẩu Bếp Phố Hội An',
        html: `<p><a href="${link}">Đặt lại mật khẩu</a></p><p>Liên kết chỉ dùng một lần và hết hạn sau 30 phút.</p>`
      });
    }
  };
}

module.exports = { sendAuthEmail, createAuthEmailSender };
