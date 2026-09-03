import type { AnyType } from '@venizia/ignis-helpers/common';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { ModuleUtility } from '@venizia/ignis-helpers';
import type {
  IMailMessage,
  IMailSendResult,
  IMailTransport,
  TNodemailerConfig,
  TNodemailerModule,
} from '../../common';

export class NodemailerTransportHelper extends BaseHelper implements IMailTransport {
  private transporter: AnyType;
  private module?: TNodemailerModule;

  constructor(opts: { config: TNodemailerConfig; module?: TNodemailerModule }) {
    super({ scope: NodemailerTransportHelper.name });

    this.module = opts.module;
    this.configure(opts.config);
  }

  configure(config: TNodemailerConfig) {
    this.transporter = this.buildTransporter(config);
  }

  /** Client factory seam - overridden in tests to run the helper without a real SMTP client. */
  protected buildTransporter(config: TNodemailerConfig): AnyType {
    const nodemailer = this.module ?? ModuleUtility.loadSync<AnyType>({ module: 'nodemailer' });
    return nodemailer.createTransport(config);
  }

  async send(message: IMailMessage): Promise<IMailSendResult> {
    try {
      const mailOptions = {
        from: message.from,
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        cc: message.cc,
        bcc: message.bcc,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
        headers: message.headers,
      };

      this.logger.for(this.send.name).debug('Sending email with nodemailer to: %s', mailOptions.to);
      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      this.logger.for(this.send.name).error('Nodemailer send failed: %s', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      this.logger.for(this.verify.name).info('Verifying SMTP connection');
      await this.transporter.verify();
      this.logger.for(this.verify.name).info('SMTP connection verified successfully');
      return true;
    } catch (error) {
      this.logger.for(this.verify.name).error('SMTP verification failed: %s', error);
      return false;
    }
  }

  async close(): Promise<void> {
    this.logger.for(this.close.name).info('Closing nodemailer transport');
    this.transporter.close();
  }
}
