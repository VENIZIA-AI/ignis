import { inject } from '@/base/metadata';
import { BaseHelper } from '@venizia/ignis-helpers/core';
// Interfaces are `import type`: with emitDecoratorMetadata on, a value import of a type-only name survives transpilation and the ESM named-import check fails at load.
import type {
  IVerificationCodeGenerator,
  IVerificationData,
  IVerificationDataGenerator,
  IVerificationGenerationOptions,
  IVerificationTokenGenerator,
} from '../../common';
import { MailKeys } from '../../common';
import { getExpiryTime, getExpiryTimeInHours } from '../../utilities';

export class DefaultVerificationDataGenerator
  extends BaseHelper
  implements IVerificationDataGenerator
{
  constructor(
    @inject({ key: MailKeys.MAIL_VERIFICATION_CODE_GENERATOR })
    private codeGenerator: IVerificationCodeGenerator,

    @inject({ key: MailKeys.MAIL_VERIFICATION_TOKEN_GENERATOR })
    private tokenGenerator: IVerificationTokenGenerator,
  ) {
    super({ scope: DefaultVerificationDataGenerator.name });
  }

  generateVerificationData(options: IVerificationGenerationOptions): IVerificationData {
    const code = this.codeGenerator.generateCode(options.codeLength);
    const token = this.tokenGenerator.generateToken(options.tokenBytes);
    const now = new Date().toISOString();

    return {
      verificationCode: code,
      codeGeneratedAt: now,
      codeExpiresAt: getExpiryTime(options.codeExpiryMinutes).toISOString(),
      codeAttempts: 0,

      verificationToken: token,
      tokenGeneratedAt: now,
      tokenExpiresAt: getExpiryTimeInHours(options.tokenExpiryHours).toISOString(),

      lastCodeSentAt: now,
    };
  }
}
