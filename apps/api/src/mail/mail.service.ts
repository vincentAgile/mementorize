import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

/**
 * Sends e-mails through an SMTP server (phase 11), configured by SMTP_HOST,
 * SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM. Without SMTP_HOST,
 * sending is disabled: the rest of the app works the same.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST')?.trim();
    const port = Number(config.get('SMTP_PORT') || 465);
    const user = config.get<string>('SMTP_USER')?.trim();
    this.from = config.get<string>('MAIL_FROM')?.trim() || user || '';

    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port,
          // 465: TLS from the first byte. Other ports (587, or 1025 for a
          // local test server): plain connection, upgraded with STARTTLS if
          // the server offers it.
          secure: port === 465,
          auth: user ? { user, pass: config.get<string>('SMTP_PASSWORD') ?? '' } : undefined,
          // Without these, an SMTP server that never answers would block
          // the sending forever (the same lesson as the review freeze).
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        })
      : null;

    if (!this.transporter) {
      this.logger.log('SMTP_HOST is not set: e-mails are disabled');
    }
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  async send(mail: Mail): Promise<void> {
    if (!this.transporter) {
      throw new Error('E-mails are disabled (SMTP_HOST is not set)');
    }
    await this.transporter.sendMail({ from: this.from, ...mail });
  }
}
