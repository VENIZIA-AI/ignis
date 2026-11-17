import { BaseHelper, NumericUidHelper } from '@venizia/ignis-helpers/core';
import type { IVerificationCodeGenerator } from '../../common';

/** Generates zero-padded numeric codes through `NumericUidHelper`, uniformly distributed. `generateCode` throws unless `10 ** length` is an integer up to 2 ** 48. */
export class NumericCodeGenerator extends BaseHelper implements IVerificationCodeGenerator {
  constructor() {
    super({ scope: NumericCodeGenerator.name });
  }

  generateCode(length: number): string {
    return new NumericUidHelper({ length }).nextId();
  }
}
