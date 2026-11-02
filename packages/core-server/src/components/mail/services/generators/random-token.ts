import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { IVerificationTokenGenerator } from '../../common';

export class RandomTokenGenerator extends BaseHelper implements IVerificationTokenGenerator {
  constructor() {
    super({ scope: RandomTokenGenerator.name });
  }

  generateToken(bytes: number): string {
    // `new Uint8Array(NaN)` is empty: without this check a misconfigured size would give an empty token.
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw getError({
        message: `[RandomTokenGenerator][generateToken] Invalid bytes | Expected a non-negative integer | Got: ${bytes}`,
      });
    }

    return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
  }
}
