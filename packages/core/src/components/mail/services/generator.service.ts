import { inject } from '@/base/metadata';
import crypto from 'node:crypto';
import {
  IVerificationCodeGenerator,
  IVerificationData,
  IVerificationDataGenerator,
  IVerificationGenerationOptions,
  IVerificationTokenGenerator,
  MailKeys,
} from '../common';
import { getExpiryTime, getExpiryTimeInHours } from '../utilities';

export class NumericCodeGenerator implements IVerificationCodeGenerator {
  generateCode(length: number): string {
    const max = Math.pow(10, length);
    const code = crypto.randomInt(0, max);
    return code.toString().padStart(length, '0');
  }
}

export class RandomTokenGenerator implements IVerificationTokenGenerator {
  generateToken(bytes: number): string {
    return crypto.randomBytes(bytes).toString('base64url');
  }
}

export class DefaultVerificationDataGenerator implements IVerificationDataGenerator {
  constructor(
    @inject({ key: MailKeys.MAIL_VERIFICATION_CODE_GENERATOR })
    private codeGenerator: IVerificationCodeGenerator,

    @inject({ key: MailKeys.MAIL_VERIFICATION_TOKEN_GENERATOR })
    private tokenGenerator: IVerificationTokenGenerator,
  ) {}

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
