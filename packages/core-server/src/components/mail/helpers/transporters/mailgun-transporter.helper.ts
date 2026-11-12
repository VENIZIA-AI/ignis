import { HTTP } from '@venizia/ignis-helpers/common';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { ErrorUtility, ModuleUtility } from '@venizia/ignis-helpers';
import type {
  IMailAttachment,
  IMailMessage,
  IMailSendResult,
  IMailTransport,
  TMailgunConfig,
  TMailgunModule,
} from '../../common';
import { MailErrors } from '../../common';
import { MailAttachmentUtility } from '../../utilities/attachment.utility';

/** Mailgun transport (`mailgun.js`). The constructor throws when `username`, `key` or `domain` is missing. */
export class MailgunTransportHelper extends BaseHelper implements IMailTransport {
  private client: AnyType; // IMessagesClient from mailgun.js
  private domain: string;
  private module?: TMailgunModule;

  constructor(opts: { config: TMailgunConfig; module?: TMailgunModule }) {
    super({ scope: MailgunTransportHelper.name });

    this.module = opts.module;
    this.configure(opts.config);
  }

  configure(config: TMailgunConfig) {
    this.validateConfig(config);

    this.domain = config.domain;
    this.client = this.buildClient(config);
  }

  /** Credentials and domain are checked here, not on the first send; the error never echoes a credential value back. */
  private validateConfig(config: TMailgunConfig): void {
    const missingKeys = (['username', 'key', 'domain'] as const).filter((key) => {
      return !config?.[key];
    });

    if (missingKeys.length === 0) {
      return;
    }

    this.logger
      .for(this.configure.name)
      .error('Invalid Mailgun configuration | Missing keys: %s', missingKeys.join(', '));

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      error: MailErrors.INVALID_CONFIGURATION,
      message: `Invalid Mailgun configuration | Missing required keys: ${missingKeys.join(', ')}`,
    });
  }

  /** Client factory seam - overridden in tests to run the helper without the mailgun.js peer. */
  protected buildClient(config: TMailgunConfig): AnyType {
    const Mailgun = this.module ?? ModuleUtility.loadSync<AnyType>({ module: 'mailgun.js' });
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
        // No root: MailService resolved paths already; one that reaches here is refused, not read.
        const attachments = await MailAttachmentUtility.resolve({
          attachments: message.attachments,
        });

        // Mailgun reads `inline` parts by file name: `cid:<name>` in the HTML, so the cid is the name.
        const toPart = (attachment: IMailAttachment, filename?: string) => ({
          filename: filename ?? attachment.filename,
          data: attachment.content,
          contentType: attachment.contentType,
        });

        mailgunMessage.attachment = attachments
          .filter((attachment) => !attachment.cid)
          .map((attachment) => toPart(attachment));
        mailgunMessage.inline = attachments
          .filter((attachment) => attachment.cid)
          .map((attachment) => toPart(attachment, attachment.cid));
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
      MailAttachmentUtility.release({ attachments: message.attachments });

      return {
        success: false,
        error: ErrorUtility.toError({ error }).message,
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      this.logger.for(this.verify.name).info('Verifying Mailgun API connection');
      // Mailgun has no verify endpoint - a test-mode send is the lightweight credential check.
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
