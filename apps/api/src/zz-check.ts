import { config } from 'dotenv';
import { createTransport } from 'nodemailer';
config();
async function main() {
  const user = process.env.SMTP_USER || process.env.ZEPTOMAIL_FROM_ADDRESS || '';
  console.log('mailbox domain:', user.split('@')[1], '| password set:', Boolean(process.env.ZOHO_APP_PASS), 'length', (process.env.ZOHO_APP_PASS ?? '').length);
  for (const host of ['smtppro.zoho.com', 'smtp.zoho.com', 'smtppro.zoho.in', 'smtp.zoho.in', 'smtppro.zoho.eu', 'smtp.zoho.eu']) {
    const transport = createTransport({ host, port: 465, secure: true, auth: { user, pass: process.env.ZOHO_APP_PASS }, connectionTimeout: 8000, greetingTimeout: 8000 });
    try { await transport.verify(); console.log('✓', host, 'login works'); } catch (error: unknown) { console.log('✗', host, '→', (error instanceof Error ? error.message : String(error)).slice(0, 90)); }
  }
}
main();
