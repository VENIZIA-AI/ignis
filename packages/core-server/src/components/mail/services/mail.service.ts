import { HTTP } from '@venizia/ignis-helpers/common';
import { BaseService } from '@venizia/ignis-kernel';
import type {
  IMailMessage,
  IMailSendResult,
  IMailService,
  IMailTemplateEngine,
  IMailTransport,
  TMailOptions,
} from '../common';
import { MailDefaults, MailErrorCodes, MailErrors, MailKeys, MailTemplateFormats } from '../common';
import { inject } from '@/base/metadata';
import { getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { type AnyType } from '@venizia/ignis-helpers/common';
import { ErrorUtility, PromiseUtility } from '@venizia/ignis-helpers';
import { MailAttachmentUtility } from '../utilities/attachment.utility';
import { MailBodyUtility } from '../utilities/body.utility';
import { MailHeaderUtility } from '../utilities/header.utility';
import { MailMimeUtility } from '../utilities/mime.utility';

/** Sends mail through the bound transport. `send` validates the message, applies the attachment policy and defaults `from`; failures are thrown as application errors with a mail message code, except `sendBatch`, which reports each failure in its result. */
export class MailService extends BaseService implements IMailService {
  constructor(
    @inject({ key: MailKeys.MAIL_OPTIONS })
    protected options: TMailOptions,
    @inject({ key: MailKeys.MAIL_TRANSPORT_INSTANCE })
    protected transport: IMailTransport,
    @inject({ key: MailKeys.MAIL_TEMPLATE_ENGINE, isOptional: true })
    protected templateEngine?: IMailTemplateEngine,
  ) {
    super({ scope: MailService.name });
    this.logger
      .for(this.constructor.name)
      .info('Mail service initialized with provider: %s', this.options.provider);
  }

  async send(message: IMailMessage): Promise<IMailSendResult> {
    try {
      this.validateMessage(message);

      const emailMessage: IMailMessage = {
        ...message,
        from: message.from ?? this.getDefaultFrom(),
      };

      // The one place the attachment policy applies: every transport receives bytes, never a path.
      if (message.attachments) {
        const result2 = await MailAttachmentUtility.resolve({
          attachments: message.attachments,
          attachmentRoot: this.options.attachmentRoot,
          maxBytes: this.options.maxAttachmentBytes ?? MailDefaults.MAX_ATTACHMENT_BYTES,
        });
        emailMessage.attachments = result2;
      }

      this.logger.for(this.send.name).debug('Sending email to: %s', emailMessage.to);
      const result = await this.transport.send(emailMessage);

      if (result.success) {
        this.logger
          .for(this.send.name)
          .debug('Email sent successfully. MessageId: %s', result.messageId);
      } else {
        this.logger.for(this.send.name).debug('Email send failed: %s', result.error);
      }

      return result;
    } catch (error) {
      this.logger.for(this.send.name).error('Error sending email: %s', error);
      MailAttachmentUtility.release({ attachments: message.attachments });

      // An error the framework already shaped carries its own status and message code; re-wrapping as 500 would report a caller mistake as a server fault.
      if (isApplicationError(error)) {
        throw error;
      }

      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        messageCode: MailErrorCodes.SEND_FAILED,
        // The raw text can carry a file path or a provider detail; it rides in `cause`, which only development responses show.
        message: 'Failed to send email',
        cause: error,
      });
    }
  }

  async sendBatch(
    messages: IMailMessage[],
    options?: { concurrency?: number },
  ): Promise<IMailSendResult[]> {
    try {
      const concurrency = options?.concurrency ?? MailDefaults.BATCH_CONCURRENCY;
      this.logger
        .for(this.sendBatch.name)
        .info('Sending batch of %d emails with concurrency: %d', messages.length, concurrency);

      const tasks = messages.map((message) => async () => {
        try {
          const result = await this.send(message);

          return result;
        } catch (error) {
          return {
            success: false,
            error: ErrorUtility.toError({ error }).message,
          };
        }
      });

      const results = await PromiseUtility.executeWithLimit<IMailSendResult>({
        tasks,
        limit: concurrency,
      });

      const successCount = results.filter((r) => r.success).length;
      this.logger
        .for(this.sendBatch.name)
        .info(
          'Batch send completed. Success: %d, Failed: %d',
          successCount,
          results.length - successCount,
        );

      return results;
    } catch (error) {
      this.logger.for(this.sendBatch.name).error('Error sending batch emails: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        messageCode: MailErrorCodes.BATCH_SEND_FAILED,
        message: 'Failed to send batch emails',
        cause: error,
      });
    }
  }

  async sendTemplate(opts: {
    templateName: string;
    data: Record<string, AnyType>;
    recipients: string | string[];
    options?: Partial<IMailMessage>;
  }): Promise<IMailSendResult> {
    const { templateName, data, recipients, options } = opts;

    try {
      if (!this.templateEngine) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          messageCode: MailErrorCodes.INVALID_CONFIGURATION,
          message: 'Template engine not configured',
        });
      }

      // `rest` goes first below: the recipients, the subject and the body this call rendered are not the options' to replace, and `requireValidate` is a render switch, not a message field.
      const { requireValidate, subject, ...rest } = options ?? {};

      this.logger.for(this.sendTemplate.name).debug('Rendering template: %s', templateName);
      const html = this.templateEngine.render({ templateName, data, requireValidate });

      const templateData = this.templateEngine.getTemplate(templateName);
      const renderedSubject =
        templateData?.subject === undefined
          ? MailDefaults.SUBJECT
          : this.templateEngine.render({
              templateData: templateData.subject,
              data,
              requireValidate,
              format: MailTemplateFormats.TEXT,
            });

      const message: IMailMessage = {
        ...rest,
        to: recipients,
        subject: subject ?? renderedSubject,
        html,
      };

      const result = await this.send(message);

      return result;
    } catch (error) {
      this.logger.for(this.sendTemplate.name).error('Error sending template email: %s', error);
      throw error;
    }
  }

  async verify(): Promise<boolean> {
    try {
      this.logger.for(this.verify.name).debug('Verifying mail transport connection');
      const isValid = await this.transport.verify();
      this.logger.for(this.verify.name).debug('Verification result: %s', isValid);

      return isValid;
    } catch (error) {
      this.logger.for(this.verify.name).error('Verification failed: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        messageCode: MailErrorCodes.VERIFICATION_FAILED,
        message: 'Mail transport verification failed',
        cause: error,
      });
    }
  }

  protected validateMessage(message: IMailMessage): void {
    if (!message.to || (Array.isArray(message.to) && message.to.length === 0)) {
      throw getError({
        error: MailErrors.INVALID_RECIPIENT,
        message: 'Recipient email address is required',
      });
    }

    if (!message.subject) {
      throw getError({
        error: MailErrors.INVALID_CONFIGURATION,
        message: 'Email subject is required',
      });
    }

    if (!message.text && !message.html) {
      throw getError({
        error: MailErrors.INVALID_CONFIGURATION,
        message: 'Email must have either text or html content',
      });
    }

    MailBodyUtility.assertIsText({ message });
    MailHeaderUtility.assert({ message });
  }

  protected getDefaultFrom(): string {
    const { from, fromName } = this.options;

    // A display name is only renderable around an address: `"Name" <undefined>` is not a sender.
    if (!from) {
      return MailDefaults.FALLBACK_FROM;
    }

    if (!fromName) {
      return from;
    }

    return `"${MailMimeUtility.escapeQuotedString({ value: fromName })}" <${from}>`;
  }
}
