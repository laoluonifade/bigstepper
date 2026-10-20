import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: { address: string; name?: string };
  subject: string;
  html: string;
  text: string;
}

/**
 * Transactional email through ZeptoMail (https://www.zoho.com/zeptomail/help/api/email-sending.html).
 * Without an API key, development logs the message instead so links can still be followed locally.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!this.enabled && this.config.get('NODE_ENV') === 'production') {
      this.logger.error('ZEPTOMAIL_API_KEY / ZEPTOMAIL_FROM_ADDRESS are not set, so verification and reset emails will not be sent');
    }
  }

  private get enabled() {
    return Boolean(this.config.get<string>('ZEPTOMAIL_API_KEY') && this.config.get<string>('ZEPTOMAIL_FROM_ADDRESS'));
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(`Email not sent (ZeptoMail not configured) → ${message.to.address}: ${message.subject}\n${message.text}`);
      return;
    }
    const apiKey = this.config.getOrThrow<string>('ZEPTOMAIL_API_KEY').replace(/^Zoho-enczapikey\s+/i, '');
    const response = await fetch(this.config.getOrThrow<string>('ZEPTOMAIL_API_URL'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Zoho-enczapikey ${apiKey}`,
      },
      body: JSON.stringify({
        from: { address: this.config.get('ZEPTOMAIL_FROM_ADDRESS'), name: this.config.get('ZEPTOMAIL_FROM_NAME') },
        to: [{ email_address: { address: message.to.address, ...(message.to.name ? { name: message.to.name } : {}) } }],
        subject: message.subject,
        htmlbody: message.html,
        textbody: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`ZeptoMail responded ${response.status}: ${detail.slice(0, 500)}`);
    }
  }

  /** Fire-and-forget for request paths: a slow or failing provider must not hold up sign-up. */
  sendInBackground(message: MailMessage) {
    void this.send(message).catch((error: unknown) =>
      this.logger.error(`Failed to send "${message.subject}" to ${message.to.address}`, error instanceof Error ? error.stack : String(error)),
    );
  }
}
