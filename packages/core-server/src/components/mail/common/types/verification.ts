export interface IVerificationGenerationOptions {
  codeLength: number;
  tokenBytes: number;
  codeExpiryMinutes: number;
  tokenExpiryHours: number;
}

export interface IVerificationData {
  verificationCode: string;
  codeGeneratedAt: string;
  codeExpiresAt: string;
  codeAttempts: number;

  verificationToken: string;
  tokenGeneratedAt: string;
  tokenExpiresAt: string;

  lastCodeSentAt: string;
}

export interface IVerificationCodeGenerator {
  generateCode(length: number): string;
}

export interface IVerificationTokenGenerator {
  generateToken(bytes: number): string;
}

export interface IVerificationDataGenerator {
  generateVerificationData(options: IVerificationGenerationOptions): IVerificationData;
}
