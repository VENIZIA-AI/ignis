import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Security Cases - injection, XSS and prototype-pollution attempts against the filter
// ----------------------------------------------------------------
export class SecurityCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 14: SQL injection in filter (security test)
  // ----------------------------------------------------------------
  async case14SqlInjectionInFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 14] SQL injection attempts should be safely handled');

    const sqlInjectionPayloads = [
      "'; DROP TABLE Product; --",
      "' OR '1'='1",
      "' UNION SELECT * FROM User --",
      '1; DELETE FROM Product; --',
    ];

    try {
      let passedAll = true;

      for (const payload of sqlInjectionPayloads) {
        try {
          // Attempt to inject via name field
          const results = await repo.find({
            filter: { where: { name: payload } },
          });

          // Should return empty (no matching record), not cause SQL error
          if (results.length === 0) {
            this.context.logger.info('[CASE 14] Safe handling of: %s', payload.substring(0, 30));
          }
        } catch (error) {
          // If error occurs, it should NOT be a SQL syntax error
          const errMsg = (error as Error).message;
          if (errMsg.includes('syntax') || errMsg.includes('SQL')) {
            this.context.logger.error('[CASE 14] FAILED | SQL error with payload: %s', payload);
            passedAll = false;
          }
        }
      }

      if (passedAll) {
        this.context.logger.info('[CASE 14] PASSED | All SQL injection attempts safely handled');
      }
    } catch (error) {
      this.context.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: XSS payload in filter (security test)
  // ----------------------------------------------------------------
  async case15XssPayloadInFilter(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 15] XSS payloads should be stored and retrieved safely');

    const testCode = `DF_XSS_${getUID()}`;
    const xssPayload = '<script>alert("xss")</script>';

    try {
      // Create product with XSS payload in name
      await repo.create({
        data: { code: testCode, name: xssPayload, price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Retrieve and verify the payload is stored as-is (not executed)
      const found = await repo.findOne({
        filter: { where: { code: testCode } },
      });

      if (found?.name === xssPayload) {
        this.context.logger.info(
          '[CASE 15] PASSED | XSS payload stored safely | name: %s',
          found.name,
        );
      } else {
        this.context.logger.error(
          '[CASE 15] FAILED | XSS payload not preserved | Got: %s',
          found?.name,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Prototype pollution attempt (security test)
  // ----------------------------------------------------------------
  async case16PrototypePollutionAttempt(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 16] Prototype pollution attempts should be safely handled');

    try {
      // Attempt prototype pollution via filter
      const maliciousFilter = {
        where: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- prototype-pollution probe needs the literal key
          __proto__: { polluted: true },
          constructor: { prototype: { polluted: true } },
        },
      } as any;

      await repo.find({ filter: maliciousFilter });

      // Verify prototype is not polluted
      if (({} as any).polluted === undefined) {
        this.context.logger.info('[CASE 16] PASSED | Prototype pollution attempt blocked');
      } else {
        this.context.logger.error('[CASE 16] FAILED | Prototype was polluted');
      }
    } catch {
      // Error is acceptable - means the attack was blocked
      this.context.logger.info('[CASE 16] PASSED | Prototype pollution attempt caused safe error');
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Very long string values (edge case)
  // ----------------------------------------------------------------
  async case17VeryLongStringValues(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 17] Very long string values should be handled');

    const testCode = `DF_LONG_${getUID()}`;
    const longString = 'A'.repeat(10000);

    try {
      await repo.create({
        data: {
          code: testCode,
          name: longString.substring(0, 255),
          description: longString,
          price: 100,
        },
        options: { shouldSkipDefaultFilter: true },
      });

      const found = await repo.findOne({
        filter: { where: { code: testCode } },
      });

      if (found?.description === longString) {
        this.context.logger.info(
          '[CASE 17] PASSED | Long string stored and retrieved | length: %d',
          found.description?.length,
        );
      } else {
        this.context.logger.error(
          '[CASE 17] FAILED | Long string not preserved | Got length: %d',
          found?.description?.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 17] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Special characters (edge case)
  // ----------------------------------------------------------------
  async case18SpecialCharacters(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 18] Special characters should be handled correctly');

    const testCode = `DF_SPECIAL_${getUID()}`;
    const specialChars = 'Test\n\t\r\'"\\`${}[]<>&|;';

    try {
      await repo.create({
        data: { code: testCode, name: specialChars, price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const found = await repo.findOne({
        filter: { where: { code: testCode } },
      });

      if (found?.name === specialChars) {
        this.context.logger.info('[CASE 18] PASSED | Special characters preserved');
      } else {
        this.context.logger.error(
          '[CASE 18] FAILED | Special characters not preserved | Got: %s',
          found?.name,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 29: SQL Injection in Order Clause
  // ----------------------------------------------------------------
  async case29SqlInjectionInOrderClause(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 29] SQL injection attempts in order clause');

    const testCode = `DF_ORDER_SEC_${getUID()}`;

    try {
      // Create test data
      await repo.createAll({
        data: [
          { code: `${testCode}_A`, name: 'Product A', price: 100 },
          { code: `${testCode}_B`, name: 'Product B', price: 200 },
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      // Attempt SQL injection in order clause
      const maliciousOrders = [
        'name; DROP TABLE Product--',
        'name ASC; DELETE FROM Product WHERE 1=1--',
        "name'); DROP TABLE Product;--",
        'name ASC UNION SELECT * FROM users--',
        '1; INSERT INTO Product (code) VALUES (injected)--',
      ];

      for (const maliciousOrder of maliciousOrders) {
        try {
          await repo.find({
            filter: {
              where: { code: { like: `${testCode}%` } },
              order: [maliciousOrder],
            },
            options: { shouldSkipDefaultFilter: true },
          });
          // If no error, that's concerning but let's verify data integrity
        } catch (err) {
          // Error is expected for invalid SQL - this is safe behavior
          this.context.logger.info(
            '[CASE 29] INFO | Order injection rejected: %s',
            (err as Error).message.slice(0, 50),
          );
        }
      }

      // Verify table still exists and data intact
      const count = await repo.count({
        where: { code: { like: `${testCode}%` } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (count.count === 2) {
        this.context.logger.info(
          '[CASE 29] PASSED | Order clause injection safely handled, data intact',
        );
      } else {
        this.context.logger.error(
          '[CASE 29] FAILED | Data may be compromised | count: %d',
          count.count,
        );
      }

      // Cleanup
      await repo.deleteAll({
        where: { code: { like: `${testCode}%` } },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      this.context.logger.error('[CASE 29] ERROR | %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 30: SQL Injection in Fields Array
  // ----------------------------------------------------------------
  async case30SqlInjectionInFieldsArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 30] SQL injection attempts in fields selection');

    const testCode = `DF_FIELDS_SEC_${getUID()}`;

    try {
      // Create test data
      await repo.create({
        data: { code: testCode, name: 'Secure Product', price: 150 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Attempt SQL injection in fields array
      const maliciousFields = [
        'id; DROP TABLE Product--',
        "name', (SELECT password FROM users)--",
        'id UNION SELECT * FROM users--',
        '*, (SELECT * FROM information_schema.tables)--',
      ];

      for (const maliciousField of maliciousFields) {
        try {
          const results = await repo.find({
            filter: {
              where: { code: testCode },
              fields: [maliciousField] as any,
            },
            options: { shouldSkipDefaultFilter: true },
          });
          // If query succeeds, verify only safe columns returned
          if (results.length > 0) {
            const keys = Object.keys(results[0]);
            this.context.logger.info('[CASE 30] INFO | Fields returned: %j', keys);
          }
        } catch {
          // Error is expected - safe behavior
          this.context.logger.info('[CASE 30] INFO | Fields injection rejected');
        }
      }

      // Verify data integrity
      const product = await repo.findOne({
        filter: { where: { code: testCode } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (product) {
        this.context.logger.info(
          '[CASE 30] PASSED | Fields injection safely handled, product intact',
        );
      } else {
        this.context.logger.error('[CASE 30] FAILED | Product may be compromised');
      }

      // Cleanup
      await repo.deleteAll({
        where: { code: testCode },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      this.context.logger.error('[CASE 30] ERROR | %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 31: SQL Injection in Include/Relation
  // ----------------------------------------------------------------
  async case31SqlInjectionInIncludeRelation(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 31] SQL injection attempts in include/relation');

    const testCode = `DF_INCLUDE_SEC_${getUID()}`;

    try {
      // Create test data
      await repo.create({
        data: { code: testCode, name: 'Include Test Product', price: 200 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Attempt SQL injection in relation name
      const maliciousRelations = [
        "saleChannelProducts'; DROP TABLE Product--",
        'saleChannelProducts UNION SELECT * FROM users',
        'nonexistent); DELETE FROM Product WHERE (1=1',
        '__proto__',
        'constructor.prototype',
      ];

      for (const maliciousRelation of maliciousRelations) {
        try {
          await repo.find({
            filter: {
              where: { code: testCode },
              include: [{ relation: maliciousRelation }],
            },
            options: { shouldSkipDefaultFilter: true },
          });
          // Query might succeed with unknown relation being ignored
        } catch (err) {
          // Error expected for invalid relation - safe behavior
          this.context.logger.info(
            '[CASE 31] INFO | Include injection rejected: %s',
            (err as Error).message.slice(0, 50),
          );
        }
      }

      // Test injection in scope where clause within include
      try {
        await repo.find({
          filter: {
            where: { code: testCode },
            include: [
              {
                relation: 'saleChannelProducts',
                scope: {
                  where: { 'id; DROP TABLE--': 1 } as any,
                },
              },
            ],
          },
          options: { shouldSkipDefaultFilter: true },
        });
      } catch {
        this.context.logger.info('[CASE 31] INFO | Scope where injection rejected');
      }

      // Verify data integrity
      const count = await repo.count({
        where: { code: testCode },
        options: { shouldSkipDefaultFilter: true },
      });

      if (count.count === 1) {
        this.context.logger.info('[CASE 31] PASSED | Include/relation injection safely handled');
      } else {
        this.context.logger.error(
          '[CASE 31] FAILED | Data integrity issue | count: %d',
          count.count,
        );
      }

      // Cleanup
      await repo.deleteAll({
        where: { code: testCode },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      this.context.logger.error('[CASE 31] ERROR | %s', (error as Error).message);
    }
  }
}
