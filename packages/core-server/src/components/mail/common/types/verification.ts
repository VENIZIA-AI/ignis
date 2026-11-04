/** Sizes and lifetimes for generated verification data: code digits, token bytes, code lifetime in minutes, token lifetime in hours. */
export interface IVerificationGenerationOptions {
  codeLength: number;
  tokenBytes: number;
  codeExpiryMinutes: number;
  tokenExpiryHours: number;
}

/** A verification code and token with their generation and expiry times (ISO 8601 strings) and the failed-attempt count. */
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

/** Generates a numeric verification code. */
export interface IVerificationCodeGenerator {
  generateCode(length: number): string;
}

/** Generates a random verification token. */
export interface IVerificationTokenGenerator {
  generateToken(bytes: number): string;
}

/** Generates a full `IVerificationData` (code, token, timestamps) from the given sizes and lifetimes. */
export interface IVerificationDataGenerator {
  generateVerificationData(options: IVerificationGenerationOptions): IVerificationData;
}
