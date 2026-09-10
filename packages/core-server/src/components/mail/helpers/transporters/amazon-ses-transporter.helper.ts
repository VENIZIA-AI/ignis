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
import { buildRawMimeMessage, formatAddressHeader, splitAddressList } from '../../utilities';

export class AmazonSesTransportHelper extends BaseHelper implements IMailTransport {
  private client: AnyType;
  private sendEmailCommandConstructor: AnyType;
  private getAccountCommandConstructor: AnyType;
  private module?: TAmazonSesModule<TAmazonSesConfig>;

  constructor(opts: { config: TAmazonSesConfig; module?: TAmazonSesModule }) {
    super({ scope: AmazonSesTransportHelper.name });

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
        // `FromEmailAddress` carries the same RFC 5321/5322 mailbox syntax as the raw `From:`
        // header and is subject to the same 7-bit-ASCII requirement - encoding it separately
        // here (instead of passing `message.from` through untouched) is what keeps a non-ASCII
        // display name from reaching the SES API as raw UTF-8 bytes.
        FromEmailAddress: message.from ? formatAddressHeader(message.from) : message.from,
        Destination: {
          ToAddresses: splitAddressList(message.to),
          CcAddresses: message.cc ? splitAddressList(message.cc) : undefined,
          BccAddresses: message.bcc ? splitAddressList(message.bcc) : undefined,
        },
        // No `ReplyToAddresses` here: `buildRawMimeMessage` already writes a single, RFC
        // 2047-encoded `Reply-To` header into the raw content. Setting both sends the same
        // address through two channels SES treats independently - a client can end up showing a
        // reply-to derived from whichever one SES prioritizes, and the other becomes a silent,
        // unencoded duplicate that skipped the address encoding path entirely.
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
