import type { AnyType } from '@venizia/ignis-helpers';
import { BaseHelper, getError } from '@venizia/ignis-helpers';
import type { Stream } from 'node:stream';
import type {
  IMailAttachment,
  IMailMessage,
  IMailSendResult,
  IMailTransport,
  TMailgunConfig,
} from '../../common';
import { MailErrorCodes } from '../../common';

export class MailgunTransportHelper extends BaseHelper implements IMailTransport {
  private client: AnyType; // IMessagesClient from mailgun.js
  private domain: string;

  constructor(config: TMailgunConfig) {
    super({ scope: MailgunTransportHelper.name });

    this.configure(config);
  }

  configure(config: TMailgunConfig) {
    this.validateConfig(config);

    this.domain = config.domain;
    this.client = this.buildClient(config);
  }

  /**
   * Credentials and domain are checked HERE, not on the first send (a transport that fails only
   * mid-send is unusable). The error never echoes any credential value back.
   */
  private validateConfig(config: TMailgunConfig): void {
    const missingKeys = (['username', 'key', 'domain'] as const).filter(key => {
      return !config?.[key];
    });

    if (missingKeys.length === 0) {
      return;
    }

    this.logger
      .for(this.configure.name)
      .error('Invalid Mailgun configuration | Missing keys: %s', missingKeys.join(', '));

    throw getError({
      statusCode: 500,
      messageCode: MailErrorCodes.INVALID_CONFIGURATION,
      message: `Invalid Mailgun configuration | Missing required keys: ${missingKeys.join(', ')}`,
    });
  }

  /** Client factory seam - overridden in tests to run the helper without the mailgun.js peer. */
  protected buildClient(config: TMailgunConfig): AnyType {
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(FormData);
    const client = mailgun.client(config);

    return client.messages;
  }

  async send(message: IMailMessage): Promise<IMailSendResult> {
    try {
      const mailgunMessage: AnyType = {
        from: message.from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        cc: message.cc,
        bcc: message.bcc,
      };

      if (message.replyTo) {
        mailgunMessage['h:Reply-To'] = message.replyTo;
      }

      if (message.headers) {
        Object.entries(message.headers).forEach(([key, value]) => {
          mailgunMessage[`h:${key}`] = value;
        });
      }

      if (message.attachments && message.attachments.length > 0) {
        mailgunMessage.attachment = message.attachments.map((att: IMailAttachment) => {
          const attachment: {
            filename?: string;
            data: string | Buffer | Stream.Readable;
          } = {
            filename: att.filename,
            data: att.path ?? att.content ?? Buffer.from(''),
          };
          return attachment;
        });
      }

      this.logger.for(this.send.name).debug('Sending email with Mailgun to: %s', mailgunMessage.to);
      const result: AnyType = await this.client.create(this.domain, mailgunMessage);

      return {
        success: true,
        messageId: result.id,
        response: result,
      };
    } catch (error) {
      this.logger.for(this.send.name).error('Mailgun send failed: %s', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      this.logger.for(this.verify.name).info('Verifying Mailgun API connection');
      // Mailgun doesn't have a dedicated verify endpoint
      // We'll make a lightweight API call to check if credentials work
      await this.client.create(this.domain, {
        from: 'verify@' + this.domain,
        to: ['verify@' + this.domain],
        subject: 'Verification Test',
        text: 'This is a verification test',
        'o:testmode': 'yes', // Use test mode to avoid actually sending
      });

      this.logger.for(this.verify.name).info('Mailgun API connection verified successfully');
      return true;
    } catch (error) {
      this.logger.for(this.verify.name).error('Mailgun API verification failed: %s', error);
      return false;
    }
  }
}
