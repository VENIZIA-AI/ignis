import { BaseHelper } from '@venizia/ignis-helpers/core';
import crypto from 'node:crypto';
import type { IVerificationCodeGenerator } from '../../common';

export class NumericCodeGenerator extends BaseHelper implements IVerificationCodeGenerator {
  constructor() {
    super({ scope: NumericCodeGenerator.name });
  }

  generateCode(length: number): string {
    const max = Math.pow(10, length);
    const code = crypto.randomInt(0, max);
    return code.toString().padStart(length, '0');
  }
}
