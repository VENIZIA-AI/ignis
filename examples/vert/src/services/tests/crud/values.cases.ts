import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Value Cases - boundary and double precision values
// ----------------------------------------------------------------
export class ValueCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 13: Boundary values (extreme numbers, long strings)
  // ----------------------------------------------------------------
  async case13BoundaryValues(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case13BoundaryValues] Test boundary values');

    const group = `REPO_BOUNDARY_${getUID()}`;

    try {
      // Test very large number
      const maxInt = 2147483647; // Max 32-bit signed integer
      const minInt = -2147483648;
      const longString = 'A'.repeat(5000); // 5000 character string

      await repo.createAll({
        data: [
          { code: `${group}_MAX`, group, dataType: DataTypes.NUMBER, nValue: maxInt },
          { code: `${group}_MIN`, group, dataType: DataTypes.NUMBER, nValue: minInt },
          { code: `${group}_LONG`, group, dataType: DataTypes.TEXT, description: longString },
          { code: `${group}_ZERO`, group, dataType: DataTypes.NUMBER, nValue: 0 },
          { code: `${group}_NEGATIVE`, group, dataType: DataTypes.NUMBER, nValue: -999 },
        ],
      });

      // Verify max integer
      const maxRecord = await repo.findOne({ filter: { where: { code: `${group}_MAX` } } });
      if (maxRecord?.nValue === maxInt) {
        this.context.logger.info(
          '[case13BoundaryValues] PASSED | Max integer: %d',
          maxRecord.nValue,
        );
      } else {
        this.context.logger.error(
          '[case13BoundaryValues] FAILED | Max integer | expected: %d | got: %d',
          maxInt,
          maxRecord?.nValue,
        );
      }

      // Verify min integer
      const minRecord = await repo.findOne({ filter: { where: { code: `${group}_MIN` } } });
      if (minRecord?.nValue === minInt) {
        this.context.logger.info(
          '[case13BoundaryValues] PASSED | Min integer: %d',
          minRecord.nValue,
        );
      } else {
        this.context.logger.error(
          '[case13BoundaryValues] FAILED | Min integer | expected: %d | got: %d',
          minInt,
          minRecord?.nValue,
        );
      }

      // Verify long string
      const longRecord = await repo.findOne({ filter: { where: { code: `${group}_LONG` } } });
      if (longRecord?.description?.length === 5000) {
        this.context.logger.info(
          '[case13BoundaryValues] PASSED | Long string length: %d',
          longRecord.description.length,
        );
      } else {
        this.context.logger.error(
          '[case13BoundaryValues] FAILED | Long string | expected 5000 | got: %d',
          longRecord?.description?.length,
        );
      }

      // Verify zero
      const zeroRecord = await repo.findOne({ filter: { where: { code: `${group}_ZERO` } } });
      if (zeroRecord?.nValue === 0) {
        this.context.logger.info('[case13BoundaryValues] PASSED | Zero value handled correctly');
      } else {
        this.context.logger.error(
          '[case13BoundaryValues] FAILED | Zero value | got: %d',
          zeroRecord?.nValue,
        );
      }

      // Verify negative integer
      const negRecord = await repo.findOne({ filter: { where: { code: `${group}_NEGATIVE` } } });
      if (negRecord?.nValue === -999) {
        this.context.logger.info(
          '[case13BoundaryValues] PASSED | Negative integer: %d',
          negRecord.nValue,
        );
      } else {
        this.context.logger.error(
          '[case13BoundaryValues] FAILED | Negative integer | got: %d',
          negRecord?.nValue,
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[case13BoundaryValues] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: DOUBLE PRECISION values (floating point precision)
  // ----------------------------------------------------------------
  async case19DoublePrecisionValues(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[case19DoublePrecisionValues] Test DOUBLE PRECISION floating point values',
    );

    const group = `REPO_DOUBLE_${getUID()}`;

    try {
      // Test various DOUBLE PRECISION scenarios
      const pi = 3.141592653589793;
      const smallDecimal = 0.000000001;
      const largeDecimal = 999999999.999999;
      const negativeDecimal = -123.456789;
      const scientificNotation = 1.23e-10;

      await repo.createAll({
        data: [
          { code: `${group}_PI`, group, dataType: DataTypes.NUMBER, nValue: pi },
          { code: `${group}_SMALL`, group, dataType: DataTypes.NUMBER, nValue: smallDecimal },
          { code: `${group}_LARGE`, group, dataType: DataTypes.NUMBER, nValue: largeDecimal },
          { code: `${group}_NEGATIVE`, group, dataType: DataTypes.NUMBER, nValue: negativeDecimal },
          {
            code: `${group}_SCIENTIFIC`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: scientificNotation,
          },
          { code: `${group}_ZERO_POINT`, group, dataType: DataTypes.NUMBER, nValue: 0.0 },
        ],
      });

      // Helper for relative tolerance comparison (handles very small numbers correctly)
      const isCloseEnough = (actual: number, expected: number): boolean => {
        if (expected === 0) {
          return Math.abs(actual) < 1e-15;
        }
        return Math.abs((actual - expected) / expected) < 1e-10; // 0.00000001% relative error
      };

      // Verify PI with floating point precision
      const piRecord = await repo.findOne({ filter: { where: { code: `${group}_PI` } } });
      if (piRecord?.nValue != null && isCloseEnough(piRecord.nValue, pi)) {
        this.context.logger.info(
          '[case19DoublePrecisionValues] PASSED | PI value: %d (precision maintained)',
          piRecord.nValue,
        );
      } else {
        this.context.logger.error(
          '[case19DoublePrecisionValues] FAILED | PI | expected: %d | got: %d',
          pi,
          piRecord?.nValue,
        );
      }

      // Verify very small decimal
      const smallRecord = await repo.findOne({ filter: { where: { code: `${group}_SMALL` } } });
      if (smallRecord?.nValue != null && isCloseEnough(smallRecord.nValue, smallDecimal)) {
        this.context.logger.info(
          '[case19DoublePrecisionValues] PASSED | Small decimal: %d',
          smallRecord.nValue,
        );
      } else {
        this.context.logger.error(
          '[case19DoublePrecisionValues] FAILED | Small decimal | expected: %d | got: %d',
          smallDecimal,
          smallRecord?.nValue,
        );
      }

      // Verify large decimal
      const largeRecord = await repo.findOne({ filter: { where: { code: `${group}_LARGE` } } });
      if (largeRecord?.nValue != null && isCloseEnough(largeRecord.nValue, largeDecimal)) {
        this.context.logger.info(
          '[case19DoublePrecisionValues] PASSED | Large decimal: %d',
          largeRecord.nValue,
        );
      } else {
        this.context.logger.error(
          '[case19DoublePrecisionValues] FAILED | Large decimal | expected: %d | got: %d',
          largeDecimal,
          largeRecord?.nValue,
        );
      }

      // Verify negative decimal
      const negRecord = await repo.findOne({ filter: { where: { code: `${group}_NEGATIVE` } } });
      if (negRecord?.nValue != null && isCloseEnough(negRecord.nValue, negativeDecimal)) {
        this.context.logger.info(
          '[case19DoublePrecisionValues] PASSED | Negative decimal: %d',
          negRecord.nValue,
        );
      } else {
        this.context.logger.error(
          '[case19DoublePrecisionValues] FAILED | Negative decimal | expected: %d | got: %d',
          negativeDecimal,
          negRecord?.nValue,
        );
      }

      // Verify scientific notation
      const sciRecord = await repo.findOne({ filter: { where: { code: `${group}_SCIENTIFIC` } } });
      if (sciRecord?.nValue != null && isCloseEnough(sciRecord.nValue, scientificNotation)) {
        this.context.logger.info(
          '[case19DoublePrecisionValues] PASSED | Scientific notation: %d',
          sciRecord.nValue,
        );
      } else {
        this.context.logger.error(
          '[case19DoublePrecisionValues] FAILED | Scientific notation | expected: %d | got: %d',
          scientificNotation,
          sciRecord?.nValue,
        );
      }

      // Test filter with DOUBLE PRECISION comparison
      const gtFilterResult = await repo.find({
        filter: { where: { group, nValue: { gt: 1.0 } } },
      });
      // Should find: PI (3.14...), LARGE (999999999.99...), expected 2 records
      if (gtFilterResult.length === 2) {
        this.context.logger.info(
          '[case19DoublePrecisionValues] PASSED | Filter nValue > 1.0 found %d records',
          gtFilterResult.length,
        );
      } else {
        this.context.logger.error(
          '[case19DoublePrecisionValues] FAILED | Filter nValue > 1.0 | expected: 2 | got: %d',
          gtFilterResult.length,
        );
      }

      // Test update with DOUBLE PRECISION
      const recordToUpdate = await repo.findOne({ filter: { where: { code: `${group}_PI` } } });
      const newValue = 2.718281828459045; // Euler's number
      await repo.updateById({
        id: recordToUpdate!.id,
        data: { nValue: newValue },
      });

      const updatedRecord = await repo.findById({ id: recordToUpdate!.id });
      if (
        updatedRecord &&
        updatedRecord.nValue !== null &&
        Math.abs(updatedRecord.nValue - newValue) < 1e-10
      ) {
        this.context.logger.info(
          "[case19DoublePrecisionValues] PASSED | Updated to Euler's number: %d",
          updatedRecord.nValue,
        );
      } else {
        this.context.logger.error(
          "[case19DoublePrecisionValues] FAILED | Update to Euler's number | got: %d",
          updatedRecord?.nValue,
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[case19DoublePrecisionValues] FAILED | Error: %s', error);
    }
  }
}
