import nodemailer from 'nodemailer';

let transport;
const getTransport = () => {
  if (transport) return transport;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS are required to send email.');
  }
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  return transport;
};

export const sendMaintenanceReminder = async ({ to, projectId, completedAt }) => {
  const monthsValue = Number(process.env.MAINTENANCE_REMINDER_MONTHS || 3);
  const months = Number.isInteger(monthsValue) && monthsValue > 0 && monthsValue <= 24 ? monthsValue : 3;
  const base = process.env.FRONTEND_URL || process.env.PRODUCTION_FRONTEND_URL || `http://localhost:${process.env.FRONTEND_PORT || 3000}`;
  const actionUrl = new URL(`/customer/dashboard?maintenanceProjectId=${encodeURIComponent(projectId)}`, base).toString();
  const when = new Date(completedAt).toLocaleDateString('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' });
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `Your solar installation is ${months} months old — time for maintenance`,
    text: `Your solar installation was completed on ${when}. ${months} months have passed, so we recommend cleaning your panels and checking the system. Request maintenance: ${actionUrl}`,
    html: `<p>Your solar installation was completed on <strong>${when}</strong>. ${months} months have passed, so it may be time to clean your panels and check the system.</p><p><a href="${actionUrl}" style="display:inline-block;padding:12px 20px;background:#1f584d;color:#fff;text-decoration:none;border-radius:24px">Request Maintenance</a></p>`,
  });
};
