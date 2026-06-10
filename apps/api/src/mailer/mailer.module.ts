import { Global, Inject, Injectable, Logger, Module } from "@nestjs/common";
import nodemailer from "nodemailer";
import { loadEnv } from "../infra/config/env";

/**
 * Provider-agnostic outbound email.
 *
 * A single `MailerClient.send(message)` contract is implemented by four
 * adapters selected via `EMAIL_PROVIDER`:
 *   - `log`     — default; writes to the logger, sends nothing (tests/CI/no creds)
 *   - `smtp`    — nodemailer against any SMTP server (Mailhog in dev)
 *   - `resend`  — Resend HTTP API
 *   - `mailgun` — Mailgun HTTP API
 *
 * Mirrors StorageModule's interface + token + factory + service shape. Sends
 * are best-effort: `MailerService.send` never throws (mirrors
 * AuditService.record), so a mail outage never breaks the triggering request.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailerClient {
  /** Provider id, for logging/health. */
  readonly provider: "log" | "smtp" | "resend" | "mailgun";
  send(message: MailMessage): Promise<void>;
}

export const MAILER_CLIENT = Symbol("MAILER_CLIENT");

// ─── Adapters ──────────────────────────────────────────────────────────────

class LogMailer implements MailerClient {
  readonly provider = "log" as const;
  private readonly logger = new Logger("LogMailer");
  send(message: MailMessage): Promise<void> {
    this.logger.log(
      `[email:log] to=${message.to} subject=${JSON.stringify(message.subject)} (provider=log, not sent)`,
    );
    return Promise.resolve();
  }
}

class SmtpMailer implements MailerClient {
  readonly provider = "smtp" as const;
  // nodemailer's Transporter type isn't worth importing for one field.
  private readonly transport: nodemailer.Transporter;
  private readonly from: string;
  constructor(opts: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  }) {
    this.from = opts.from;
    this.transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.secure,
      auth:
        opts.user && opts.password
          ? { user: opts.user, pass: opts.password }
          : undefined,
    });
  }
  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}

class ResendMailer implements MailerClient {
  readonly provider = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(message: MailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`resend send failed: ${res.status} ${await res.text()}`);
    }
  }
}

class MailgunMailer implements MailerClient {
  readonly provider = "mailgun" as const;
  constructor(
    private readonly apiKey: string,
    private readonly domain: string,
    private readonly baseUrl: string,
    private readonly from: string,
  ) {}
  async send(message: MailMessage): Promise<void> {
    const form = new URLSearchParams({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    const res = await fetch(`${this.baseUrl}/v3/${this.domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      throw new Error(`mailgun send failed: ${res.status} ${await res.text()}`);
    }
  }
}

/**
 * Build the configured adapter from env. Misconfiguration (e.g. provider=smtp
 * with no SMTP_HOST, or resend with no key) falls back to LogMailer with a
 * warning rather than crashing boot — email is non-critical infrastructure.
 */
export function buildMailerFromEnv(): MailerClient {
  const env = loadEnv();
  const logger = new Logger("MailerFactory");
  switch (env.EMAIL_PROVIDER) {
    case "smtp": {
      if (!env.SMTP_HOST) {
        logger.warn(
          "EMAIL_PROVIDER=smtp but SMTP_HOST unset — using log mailer",
        );
        return new LogMailer();
      }
      return new SmtpMailer({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.EMAIL_FROM,
      });
    }
    case "resend": {
      if (!env.RESEND_API_KEY) {
        logger.warn(
          "EMAIL_PROVIDER=resend but RESEND_API_KEY unset — using log mailer",
        );
        return new LogMailer();
      }
      return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
    }
    case "mailgun": {
      if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) {
        logger.warn(
          "EMAIL_PROVIDER=mailgun but MAILGUN_API_KEY/DOMAIN unset — using log mailer",
        );
        return new LogMailer();
      }
      return new MailgunMailer(
        env.MAILGUN_API_KEY,
        env.MAILGUN_DOMAIN,
        env.MAILGUN_BASE_URL,
        env.EMAIL_FROM,
      );
    }
    case "log":
    default:
      return new LogMailer();
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  constructor(@Inject(MAILER_CLIENT) private readonly client: MailerClient) {}

  /**
   * Best-effort send. Never throws — a mail failure must not break the
   * triggering domain operation (mirrors AuditService.record). Returns whether
   * the send succeeded for callers/tests that care.
   */
  async send(message: MailMessage): Promise<boolean> {
    try {
      await this.client.send(message);
      return true;
    } catch (e) {
      this.logger.warn(
        `email send failed (provider=${this.client.provider}) to ${message.to}: ${(e as Error).message}`,
      );
      return false;
    }
  }
}

@Global()
@Module({
  providers: [
    { provide: MAILER_CLIENT, useFactory: buildMailerFromEnv },
    MailerService,
  ],
  exports: [MAILER_CLIENT, MailerService],
})
export class MailerModule {}
