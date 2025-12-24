import { AnyType, BaseHelper, validateModule } from '@/helpers';
import { IMailMessage, IMailSendResult, IMailTransport, TNodemailerConfig } from '../../common';

export class NodemailerTransportHelper extends BaseHelper implements IMailTransport {
  private transporter: AnyType;

  constructor(config: TNodemailerConfig) {
    super({ scope: NodemailerTransportHelper.name });

    this.configure(config);
  }

  configure(config: TNodemailerConfig) {
    validateModule({
      scope: NodemailerTransportHelper.name,
      modules: ['nodemailer'],
    });

    const nodemailer = require('nodemailer');
    this.transporter = nodemailer.createTransport(config);
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

      this.logger.debug('[send] Sending email with nodemailer to: %s', mailOptions.to);
      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      this.logger.error('[send] Nodemailer send failed: %s', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      this.logger.info('[verify] Verifying SMTP connection');
      await this.transporter.verify();
      this.logger.info('[verify] SMTP connection verified successfully');
      return true;
    } catch (error) {
      this.logger.error('[verify] SMTP verification failed: %s', error);
      return false;
    }
  }

  async close(): Promise<void> {
    this.logger.info('[close] Closing nodemailer transport');
    this.transporter.close();
  }
}
