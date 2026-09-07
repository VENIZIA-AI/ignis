import { BaseHelper } from '@venizia/ignis-helpers/core';
import crypto from 'node:crypto';
import type { IVerificationTokenGenerator } from '../../common';

export class RandomTokenGenerator extends BaseHelper implements IVerificationTokenGenerator {
  constructor() {
    super({ scope: RandomTokenGenerator.name });
  }

  generateToken(bytes: number): string {
    return crypto.randomBytes(bytes).toString('base64url');
  }
}
