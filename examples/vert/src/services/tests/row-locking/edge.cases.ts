import { LockStrengths } from '@venizia/ignis';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Edge Cases - validation errors (no transaction, incompatible Query API options) and the LockStrengths contract
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 9: Lock without transaction should throw
  // ----------------------------------------------------------------
  async case9LockWithoutTransactionThrows(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 9] Lock without transaction - Should throw validation error');

    try {
      await repo.findOne({
        filter: { where: { code: 'NONEXISTENT' } },
        options: {
          lock: { strength: 'update' },
        },
      });
      this.context.logger.error(
        '[CASE 9] FAILED - Should have thrown for lock without transaction',
      );
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('requires a transaction')) {
        this.context.logger.info('[CASE 9] PASSED - Correctly threw: %s', message);
      } else {
        this.context.logger.error('[CASE 9] FAILED - Unexpected error: %s', message);
      }
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Lock with include should throw
  // ----------------------------------------------------------------
  async case10LockWithIncludeThrows(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 10] Lock with include - Should throw Query API incompatibility');

    const transaction = await repo.beginTransaction();

    try {
      await repo.findOne({
        filter: {
          where: { code: 'NONEXISTENT' },
          include: [{ relation: 'saleChannelProducts' }],
        },
        options: {
          transaction,
          lock: { strength: 'update' },
          shouldSkipDefaultFilter: true,
        },
      });
      this.context.logger.error('[CASE 10] FAILED - Should have thrown for lock with include');
      await transaction.rollback();
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('incompatible with Query API')) {
        this.context.logger.info('[CASE 10] PASSED - Correctly threw: %s', message);
      } else {
        this.context.logger.error('[CASE 10] FAILED - Unexpected error: %s', message);
      }
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Lock with fields should throw
  // ----------------------------------------------------------------
  async case11LockWithFieldsThrows(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 11] Lock with fields - Should throw Query API incompatibility');

    const transaction = await repo.beginTransaction();

    try {
      await repo.findOne({
        filter: {
          where: { code: 'NONEXISTENT' },
          fields: ['id', 'code'],
        },
        options: {
          transaction,
          lock: { strength: 'update' },
        },
      });
      this.context.logger.error('[CASE 11] FAILED - Should have thrown for lock with fields');
      await transaction.rollback();
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('incompatible with Query API')) {
        this.context.logger.info('[CASE 11] PASSED - Correctly threw: %s', message);
      } else {
        this.context.logger.error('[CASE 11] FAILED - Unexpected error: %s', message);
      }
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: LockStrengths constants validation
  // ----------------------------------------------------------------
  async case15LockStrengthsConstants(): Promise<void> {
    this.context.logCase('[CASE 15] LockStrengths constants and isValid()');

    const checks = [
      { value: LockStrengths.UPDATE, expected: 'update' },
      { value: LockStrengths.NO_KEY_UPDATE, expected: 'no key update' },
      { value: LockStrengths.SHARE, expected: 'share' },
      { value: LockStrengths.KEY_SHARE, expected: 'key share' },
    ];

    let allPassed = true;

    for (const { value, expected } of checks) {
      if (value !== expected) {
        this.context.logger.error('[CASE 15] FAILED - %s !== %s', value, expected);
        allPassed = false;
      }
      if (!LockStrengths.isValid(value)) {
        this.context.logger.error('[CASE 15] FAILED - isValid(%s) returned false', value);
        allPassed = false;
      }
    }

    if (!LockStrengths.isValid('invalid_strength')) {
      // Good — invalid should return false
    } else {
      this.context.logger.error(
        '[CASE 15] FAILED - isValid("invalid_strength") should return false',
      );
      allPassed = false;
    }

    if (allPassed) {
      this.context.logger.info(
        '[CASE 15] PASSED - All LockStrengths constants and isValid() correct',
      );
    }
  }
}
