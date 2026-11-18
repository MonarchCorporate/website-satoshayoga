// Minimal compatibility layer for denomailer's SMTPClient on top of nodemailer.
import nodemailer from "nodemailer";

type Conn = {
  connection: { hostname: string; port: number; tls?: boolean; auth?: { username: string; password: string } };
  debug?: unknown;
};

export class SMTPClient {
  private transporter: nodemailer.Transporter;
  constructor(opts: Conn) {
    const c = opts.connection;
    this.transporter = nodemailer.createTransport({
      host: c.hostname,
      port: c.port,
      secure: !!c.tls,
      requireTLS: !c.tls && c.port === 587,
      auth: c.auth ? { user: c.auth.username, pass: c.auth.password } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  async send(m: { from: string; to: string | string[]; subject: string; content?: string; html?: string; headers?: Record<string, string>; replyTo?: string; cc?: any; bcc?: any }) {
    await this.transporter.sendMail({
      from: m.from,
      to: m.to,
      cc: m.cc,
      bcc: m.bcc,
      replyTo: m.replyTo,
      subject: m.subject,
      text: m.content && m.content !== "auto" ? m.content : undefined,
      html: m.html,
      headers: m.headers,
    });
  }
  async close() {
    this.transporter.close();
  }
}
