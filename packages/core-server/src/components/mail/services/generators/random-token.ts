import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { IVerificationTokenGenerator } from '../../common';

/** `crypto.getRandomValues` fills at most this many bytes per call. */
const MAX_FILL_BYTES = 65_536;

export class RandomTokenGenerator extends BaseHelper implements IVerificationTokenGenerator {
  constructor() {
    super({ scope: RandomTokenGenerator.name });
  }

  generateToken(bytes: number): string {
    const buffer = new Uint8Array(bytes);
    for (let offset = 0; offset < buffer.length; offset += MAX_FILL_BYTES) {
      crypto.getRandomValues(buffer.subarray(offset, offset + MAX_FILL_BYTES));
    }
    return Buffer.from(buffer).toString('base64url');
  }
}
