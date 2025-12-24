import { BaseService } from '@/base/services';
import {
  IMailMessage,
  IMailSendResult,
  IMailService,
  IMailTemplateEngine,
  IMailTransport,
  MailDefaults,
  MailErrorCodes,
  MailKeys,
  TMailOptions,
} from '../common';
import { inject } from '@/base/metadata';
import { AnyType, executePromiseWithLimit, getError } from '@/helpers';

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
    this.logger.info(
      '[constructor] Mail service initialized with provider: %s',
      this.options.provider,
    );
  }

  async send(message: IMailMessage): Promise<IMailSendResult> {
    try {
      this.validateMessage(message);

      const emailMessage: IMailMessage = {
        ...message,
        from: message.from ?? this.getDefaultFrom(),
      };

      this.logger.debug('[send] Sending email to: %s', emailMessage.to);
      const result = await this.transport.send(emailMessage);

      if (result.success) {
        this.logger.debug('[send] Email sent successfully. MessageId: %s', result.messageId);
      } else {
        this.logger.debug('[send] Email send failed: %s', result.error);
      }

      return result;
    } catch (error) {
      this.logger.error('[send] Error sending email: %s', error);
      throw getError({
        statusCode: 500,
        messageCode: MailErrorCodes.SEND_FAILED,
        message: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  async sendBatch(
    messages: IMailMessage[],
    options?: { concurrency?: number },
  ): Promise<IMailSendResult[]> {
    try {
      const concurrency = options?.concurrency ?? MailDefaults.BATCH_CONCURRENCY;
      this.logger.info(
        '[sendBatch] Sending batch of %d emails with concurrency: %d',
        messages.length,
        concurrency,
      );

      const tasks = messages.map(message => async () => {
        try {
          return await this.send(message);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const results = await executePromiseWithLimit<IMailSendResult>({
        tasks,
        limit: concurrency,
      });

      const successCount = results.filter(r => r.success).length;
      this.logger.info(
        '[sendBatch] Batch send completed. Success: %d, Failed: %d',
        successCount,
        results.length - successCount,
      );

      return results;
    } catch (error) {
      this.logger.error('[sendBatch] Error sending batch emails: %s', error);
      throw getError({
        statusCode: 500,
        messageCode: MailErrorCodes.BATCH_SEND_FAILED,
        message: `Failed to send batch emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
          statusCode: 500,
          messageCode: MailErrorCodes.INVALID_CONFIGURATION,
          message: 'Template engine not configured',
        });
      }

      this.logger.debug('[sendTemplate] Rendering template: %s', templateName);
      const html = this.templateEngine.render({
        templateName,
        data,
        requireValidate: options?.requireValidate,
      });

      const templateData = this.templateEngine.getTemplate(templateName);

      const message: IMailMessage = {
        to: recipients,
        subject:
          options?.subject ??
          (templateData?.subject !== undefined
            ? this.templateEngine.render({
                templateData: templateData.subject,
                data,
                requireValidate: options?.requireValidate,
              })
            : 'No Subject'),
        html,
        ...options,
      };

      return await this.send(message);
    } catch (error) {
      this.logger.error('[sendTemplate] Error sending template email: %s', error);
      throw error;
    }
  }

  async verify(): Promise<boolean> {
    try {
      this.logger.debug('[verify] Verifying mail transport connection');
      const isValid = await this.transport.verify();
      this.logger.debug('[verify] Verification result: %s', isValid);
      return isValid;
    } catch (error) {
      this.logger.error('[verify] Verification failed: %s', error);
      throw getError({
        statusCode: 500,
        messageCode: MailErrorCodes.VERIFICATION_FAILED,
        message: `Mail transport verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  protected validateMessage(message: IMailMessage): void {
    if (!message.to || (Array.isArray(message.to) && message.to.length === 0)) {
      throw getError({
        statusCode: 400,
        messageCode: MailErrorCodes.INVALID_RECIPIENT,
        message: 'Recipient email address is required',
      });
    }

    if (!message.subject) {
      throw getError({
        statusCode: 400,
        messageCode: MailErrorCodes.INVALID_CONFIGURATION,
        message: 'Email subject is required',
      });
    }

    if (!message.text && !message.html) {
      throw getError({
        statusCode: 400,
        messageCode: MailErrorCodes.INVALID_CONFIGURATION,
        message: 'Email must have either text or html content',
      });
    }
  }

  protected getDefaultFrom(): string {
    if (this.options.fromName) {
      return `"${this.options.fromName}" <${this.options.from}>`;
    }

    return this.options.from ?? 'noreply@example.com';
  }
}
