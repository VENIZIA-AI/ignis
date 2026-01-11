import { BaseProvider } from '@/base/providers';
import {
  ICustomMailOptions,
  IMailgunMailOptions,
  IMailTransport,
  INodemailerMailOptions,
  MailErrorCodes,
  MailProviders,
  TMailOptions,
} from '../common';
import { MailgunTransportHelper, NodemailerTransportHelper } from '../helpers';
import { Container, getError } from '@/helpers';
import { isMailTransport } from '../utilities';

export type TGetMailTransportFn = (options: TMailOptions) => IMailTransport;

export class MailTransportProvider extends BaseProvider<TGetMailTransportFn> {
  constructor() {
    super({ scope: MailTransportProvider.name });
  }

  value(_container: Container): TGetMailTransportFn {
    return (options: TMailOptions) => {
      this.logger
        .for(this.value.name)
        .info('Creating mail transport for provider: %s', options.provider);

      switch (options.provider) {
        case MailProviders.NODEMAILER: {
          return this.createNodemailerTransport(options);
        }

        case MailProviders.MAILGUN: {
          return this.createMailgunTransport(options);
        }

        case MailProviders.CUSTOM: {
          return this.createCustomTransport(options);
        }

        default: {
          throw getError({
            statusCode: 500,
            messageCode: MailErrorCodes.INVALID_CONFIGURATION,
            message: `Unsupported mail provider: ${options.provider}`,
          });
        }
      }
    };
  }

  private createNodemailerTransport(options: TMailOptions): NodemailerTransportHelper {
    if (this.isNodemailerOptions(options)) {
      this.logger
        .for(this.createNodemailerTransport.name)
        .info('Initializing Nodemailer transport');
      return new NodemailerTransportHelper(options.config);
    }

    throw getError({
      statusCode: 500,
      messageCode: MailErrorCodes.INVALID_CONFIGURATION,
      message: 'Invalid Nodemailer configuration',
    });
  }

  private createMailgunTransport(options: TMailOptions): MailgunTransportHelper {
    if (this.isMailgunOptions(options)) {
      this.logger.for(this.createMailgunTransport.name).info('Initializing Mailgun transport');
      return new MailgunTransportHelper(options.config);
    }

    throw getError({
      statusCode: 500,
      messageCode: MailErrorCodes.INVALID_CONFIGURATION,
      message: 'Invalid Mailgun configuration',
    });
  }

  private createCustomTransport(options: TMailOptions): IMailTransport {
    if (!this.isCustomOptions(options)) {
      throw getError({
        statusCode: 500,
        messageCode: MailErrorCodes.INVALID_CONFIGURATION,
        message: 'Invalid custom mail provider configuration',
      });
    }

    if (!isMailTransport(options.config)) {
      const missingMethods: string[] = [];

      if (typeof (options.config as any).send !== 'function') {
        missingMethods.push('send');
      }
      if (typeof (options.config as any).verify !== 'function') {
        missingMethods.push('verify');
      }

      throw getError({
        statusCode: 500,
        messageCode: MailErrorCodes.INVALID_CONFIGURATION,
        message: `Custom mail provider must implement IMailTransport interface. Missing methods: ${missingMethods.join(', ')}`,
      });
    }

    this.logger.for(this.createCustomTransport.name).info('Using custom mail transport');
    return options.config;
  }

  private isNodemailerOptions(options: TMailOptions): options is INodemailerMailOptions {
    return options.provider === MailProviders.NODEMAILER && 'config' in options;
  }

  private isMailgunOptions(options: TMailOptions): options is IMailgunMailOptions {
    return options.provider === MailProviders.MAILGUN && 'config' in options;
  }

  private isCustomOptions(options: TMailOptions): options is ICustomMailOptions {
    return options.provider === MailProviders.CUSTOM && 'config' in options;
  }
}
