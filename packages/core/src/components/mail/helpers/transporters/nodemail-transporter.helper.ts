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
