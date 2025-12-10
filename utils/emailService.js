import nodemailer from 'nodemailer';

let cachedTransporterPromise = null;

const buildTransporter = async () => {
  if (cachedTransporterPromise) {
    return cachedTransporterPromise;
  }

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_SECURE
  } = process.env;

  if (SMTP_HOST) {
    const port = Number.parseInt(SMTP_PORT, 10) || 587;
    const secure = SMTP_SECURE === 'true' || (port === 465 && SMTP_SECURE !== 'false');

    cachedTransporterPromise = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure,
      auth: SMTP_USER && SMTP_PASSWORD
        ? {
          user: SMTP_USER,
          pass: SMTP_PASSWORD
        }
        : undefined
    });
  } else {
    cachedTransporterPromise = nodemailer.createTransport({
      jsonTransport: true
    });
    // eslint-disable-next-line no-console
    console.warn('[emailService] SMTP non configurato. Le email verranno stampate nel log.');
  }

  return cachedTransporterPromise;
};

export const sendPasswordResetEmail = async ({
  to,
  displayName,
  resetLink,
  expiresAt
}) => {
  if (!to || !resetLink) {
    throw new Error('Email destinatario o link reset mancanti');
  }

  const transporter = await buildTransporter();
  const from = process.env.MELO_MAIL_FROM || 'Melo Chat <no-reply@melochat.local>';
  const safeName = displayName || 'utente Melo Chat';

  const mailOptions = {
    from,
    to,
    subject: 'Reimposta la tua password su Melo Chat',
    text: `Ciao ${safeName},\n\nAbbiamo ricevuto una richiesta per reimpostare la tua password su Melo Chat.\n\nPer continuare, visita il seguente link (valido fino al ${new Date(expiresAt).toLocaleString('it-IT')}):\n${resetLink}\n\nSe non hai richiesto tu questa operazione, ignora pure questo messaggio.\n\nA presto,\nIl team di Melo Chat`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; color: #1f2937;">
        <h2 style="color:#4f46e5;">Ciao ${safeName},</h2>
        <p>Abbiamo ricevuto una richiesta per reimpostare la tua password su <strong>Melo Chat</strong>.</p>
        <p>Per continuare clicca il pulsante seguente (validità fino al <strong>${new Date(expiresAt).toLocaleString('it-IT')}</strong>):</p>
        <p style="margin: 32px 0;">
          <a href="${resetLink}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Reimposta password</a>
        </p>
        <p style="font-size:14px; color:#6b7280;">Se il pulsante non funziona, copia e incolla questo link nel browser:</p>
        <p style="font-size:14px; color:#4338ca; word-break:break-all;">${resetLink}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;"/>
        <p style="font-size:12px; color:#9ca3af;">Se non hai richiesto tu questa operazione puoi ignorare il messaggio.</p>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);

  if (transporter.options?.jsonTransport && info?.message) {
    // eslint-disable-next-line no-console
    console.log('[emailService] Anteprima email reset password:', info.message.toString());
  }

  return info;
};

export const getMailTransporter = async () => buildTransporter();
