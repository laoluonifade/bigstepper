import { EngagementService } from '../notifications/engagement.service';
import { Candidate } from '../notifications/engagement-policy';
import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

class MailRejection extends Error { constructor(readonly status:number) {super(`ZeptoMail rejected delivery: ${status}`);} }

export interface MailMessage {
  to: { address: string; name?: string };
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string;
  engagement?: Candidate;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService, private readonly engagement: EngagementService) {}

  onModuleInit() {
    if (!this.enabled && this.config.get('NODE_ENV') === 'production') {
      this.logger.error('ZEPTOMAIL_API_KEY / ZEPTOMAIL_FROM_ADDRESS are not set, so verification and reset emails will not be sent');
    }
  }

  private smtp: Transporter | null = null;
  private bulkBlockedUntil = 0;

  get canSendBulk() { return this.configured && Date.now() >= this.bulkBlockedUntil; }

  private get enabled() {
    return Boolean(this.config.get<string>('ZEPTOMAIL_API_KEY') && this.config.get<string>('ZEPTOMAIL_FROM_ADDRESS'));
  }

  private get smtpEnabled() {
    return Boolean(this.config.get<string>('ZOHO_APP_PASS') && this.smtpUser);
  }

  private get smtpUser() {
    return this.config.get<string>('SMTP_USER') || this.config.get<string>('ZEPTOMAIL_FROM_ADDRESS') || '';
  }

  get configured() { return this.enabled || this.smtpEnabled; }

  async send(message: MailMessage): Promise<boolean> {
    if (!this.enabled && !this.smtpEnabled) {
      throw new ServiceUnavailableException('Email delivery is temporarily unavailable. Please try again later.');
    }
    const decision = message.engagement ? await this.engagement.reserve(message.engagement, 'email') : null;
    if (decision && !decision.allowed) return false;
    let fallbackAttempted=false;
    try {
      if (!this.enabled) await this.sendSmtp(message);
      else await this.sendZepto(message);
      await this.engagement?.finish(decision?.id, 'sent');
      return true;
    } catch (error) {
      if (this.enabled && this.smtpEnabled && (!message.engagement || error instanceof MailRejection)) {
        try {
          fallbackAttempted=true;
          await this.sendSmtp(message);
          await this.engagement?.finish(decision?.id, 'sent');
          return true;
        } catch (fallbackError) {
          this.logger.error(`Both email providers rejected delivery: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      } else {
        this.logger.error(`Email provider rejected delivery: ${error instanceof Error ? error.message : String(error)}`);
      }
      await this.engagement?.finish(decision?.id, error instanceof MailRejection && !fallbackAttempted?'failed':'uncertain', error instanceof MailRejection && !fallbackAttempted && error.status===429?'retryable':'provider_error');
      this.bulkBlockedUntil = Date.now() + 60 * 60_000;
      throw new ServiceUnavailableException('Email delivery is temporarily unavailable. Please try again later.');
    }
  }

  private async sendSmtp(message: MailMessage) {
    const port = Number(this.config.get<string>('SMTP_PORT') || 465);
    this.smtp ??= createTransport({
      host: this.config.get<string>('SMTP_HOST') || 'smtp.zoho.com',
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: this.smtpUser, pass: this.config.getOrThrow<string>('ZOHO_APP_PASS') },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await this.smtp.sendMail({
      from: { address: this.smtpUser, name: message.fromName ?? (this.config.get<string>('ZEPTOMAIL_FROM_NAME') || 'Jump') },
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      to: message.to.name ? { address: message.to.address, name: message.to.name } : message.to.address,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  private async sendZepto(message: MailMessage) {
    const apiKey = this.config.getOrThrow<string>('ZEPTOMAIL_API_KEY').replace(/^Zoho-enczapikey\s+/i, '');
    const response = await fetch(this.config.getOrThrow<string>('ZEPTOMAIL_API_URL'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Zoho-enczapikey ${apiKey}`,
      },
      body: JSON.stringify({
        from: { address: this.config.get('ZEPTOMAIL_FROM_ADDRESS'), name: message.fromName ?? this.config.get('ZEPTOMAIL_FROM_NAME') },
        ...(message.replyTo ? { reply_to: [{ address: message.replyTo }] } : {}),
        to: [{ email_address: { address: message.to.address, ...(message.to.name ? { name: message.to.name } : {}) } }],
        subject: message.subject,
        htmlbody: message.html,
        textbody: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      if(response.status>=400 && response.status<500 && response.status!==408) throw new MailRejection(response.status);
      throw new Error(`ZeptoMail responded ${response.status}`);
    }
  }

  sendInBackground(message: MailMessage) {
    void this.send(message).catch((error: unknown) =>
      this.logger.error(`Failed to send email to ${message.to.address}`, error instanceof Error ? error.message : String(error)),
    );
  }
}
