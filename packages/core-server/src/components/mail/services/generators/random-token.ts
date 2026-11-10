import {
  BaseHelper,
  getError,
  TokenUidHelper,
  UidTokenEncodings,
} from '@venizia/ignis-helpers/core';
import type { IVerificationTokenGenerator } from '../../common';

/**
 * Generates base64url tokens from random bytes, through `TokenUidHelper`. `generateToken` throws
 * unless `bytes` is an integer of at least 16 (128 bits): a shorter token can be guessed offline.
 */
export class RandomTokenGenerator extends BaseHelper implements IVerificationTokenGenerator {
  constructor() {
    super({ scope: RandomTokenGenerator.name });
  }

  generateToken(bytes: number): string {
    // `TokenUidHelper` reads a missing size as its 32-byte default; here a missing size is a misconfiguration, as it always was.
    if (typeof bytes !== 'number') {
      throw getError({
        message: `[RandomTokenGenerator][generateToken] Invalid bytes | Expected an integer of at least 16 | Got: ${bytes}`,
      });
    }

    return new TokenUidHelper({ bytes, encoding: UidTokenEncodings.BASE64URL }).nextId();
  }
}
