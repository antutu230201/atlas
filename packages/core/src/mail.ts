/**
 * 邮件适配器（架构铁律：外部服务一律走适配器接口）。
 * 本地开发用 ConsoleMailAdapter（打印到日志）；生产接 SMTP/云服务商实现，接口不变。
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailAdapter {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** 本地开发：邮件打印到进程日志（ADR-0005 §8） */
export class ConsoleMailAdapter implements MailAdapter {
  readonly name = 'mail-console';

  async send(message: MailMessage): Promise<void> {
    console.log(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}
