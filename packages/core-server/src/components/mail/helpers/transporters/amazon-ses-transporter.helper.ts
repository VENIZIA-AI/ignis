import { ModuleUtility, type AnyType } from '@venizia/ignis-helpers';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import {
  MailErrorCodes,
  type IMailMessage,
  type IMailSendResult,
  type IMailTransport,
  type TAmazonSesClient,
  type TAmazonSesConfig,
  type TAmazonSesModule,
} from '../../common';
import { buildRawMimeMessage } from '../../utilities';

export class AmazonSesTransporterHelper extends BaseHelper implements IMailTransport {
  private client: AnyType;
  private sendEmailCommandConstructor: AnyType;
  private getAccountCommandConstructor: AnyType;
  private module?: TAmazonSesModule<TAmazonSesConfig>;

  constructor(opts: { config: TAmazonSesConfig; module?: TAmazonSesModule }) {
    super({ scope: AmazonSesTransporterHelper.name });

    this.module = opts.module;
    this.configure(opts.config);
  }

  // ------------------------------------------------------------------------------------
  async send(message: IMailMessage): Promise<IMailSendResult> {
    const logger = this.logger.for(this.send.name);

    try {
      logger.debug('Sending email with Amazon SES to: %s', message.to);

      const rawMessage = await buildRawMimeMessage(message);
      const command = new this.sendEmailCommandConstructor({
        FromEmailAddress: message.from,
        Destination: {
          ToAddresses: Array.isArray(message.to) ? message.to : [message.to],
          CcAddresses: message.cc
            ? Array.isArray(message.cc)
              ? message.cc
              : [message.cc]
            : undefined,
          BccAddresses: message.bcc
            ? Array.isArray(message.bcc)
              ? message.bcc
              : [message.bcc]
            : undefined,
        },
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
        Content: {
          Raw: { Data: rawMessage },
        },
      });

      const result = await this.client.send(command);

      return {
        success: true,
        messageId: result.MessageId,
        response: result,
      };
    } catch (error) {
      logger.error(
        'Amazon SES send failed | error: %s',
        error instanceof Error ? error.message : error,
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ------------------------------------------------------------------------------------
  async verify(): Promise<boolean> {
    const logger = this.logger.for(this.verify.name);

    try {
      logger.info('Verifying Amazon SES account status');

      const command = new this.getAccountCommandConstructor({});
      const result = await this.client.send(command);
      const enabled = result.SendingEnabled === true;

      logger.info('Amazon SES account status: %s', enabled ? 'enabled' : 'disabled');

      return enabled;
    } catch (error) {
      logger.error(
        'Amazon SES verification failed | error: %s',
        error instanceof Error ? error.message : error,
      );

      return false;
    }
  }

  // ------------------------------------------------------------------------------------
  async close(): Promise<void> {
    this.logger.for(this.close.name).info('Closing Amazon SES client');
    this.client.destroy?.();
  }

  // ------------------------------------------------------------------------------------
  configure(config: TAmazonSesConfig): void {
    this.validateConfig(config);

    const { client, SendEmailCommand, GetAccountCommand } = this.buildClient(config);

    this.client = client;
    this.sendEmailCommandConstructor = SendEmailCommand;
    this.getAccountCommandConstructor = GetAccountCommand;
  }

  // ------------------------------------------------------------------------------------
  protected buildClient(config: TAmazonSesConfig): TAmazonSesClient {
    const sesModule =
      this.module ?? ModuleUtility.loadSync<TAmazonSesModule>({ module: '@aws-sdk/client-sesv2' });

    const client = new sesModule.SESv2Client({
      region: config.region,
      credentials: config.credentials,
      endpoint: config.endpoint,
    });

    return {
      client,
      SendEmailCommand: sesModule.SendEmailCommand,
      GetAccountCommand: sesModule.GetAccountCommand,
    };
  }

  // ------------------------------------------------------------------------------------
  private validateConfig(config: TAmazonSesConfig): void {
    if (config.region) {
      return;
    }

    throw getError({
      statusCode: 500,
      messageCode: MailErrorCodes.INVALID_CONFIGURATION,
      message: 'Invalid Amazon SES Configuration | Missing region',
    });
  }
}
