import { BindingKeys, BindingNamespaces, DataTypes, getUID, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

// ----------------------------------------------------------------
// JSON Update Test Service - Tests nested JSON/JSONB field updates
// Uses ConfigurationRepository which has the jValue JSONB column
// ----------------------------------------------------------------
export class JsonUpdateTestService extends BaseTestService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    configurationRepository: ConfigurationRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    })
    productRepository: ProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelRepository.name,
      }),
    })
    saleChannelRepository: SaleChannelRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelProductRepository.name,
      }),
    })
    saleChannelProductRepository: SaleChannelProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    userRepository: UserRepository,
  ) {
    super(
      JsonUpdateTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[JsonUpdateTestService] Starting JSON path update test cases');

    // Baseline tests (normal column updates)
    await this.case1_UpdateByIdNormalColumns();

    // Simple JSON path updates
    await this.case2_UpdateByIdSimpleJsonPath();
    await this.case3_UpdateByIdNestedJsonPath();
    await this.case4_UpdateByIdArrayIndexPath();

    // Multiple paths
    await this.case5_UpdateByIdMultiplePathsSameColumn();
    await this.case6_UpdateByIdMultiplePaths();
    await this.case7_UpdateByIdMixedRegularAndJsonPaths();

    // Value types
    await this.case8_JsonPathDifferentValueTypes();

    // Sibling preservation
    await this.case9_SiblingFieldsNotAffected();

    // Missing intermediate keys
    await this.case10_CreatesMissingIntermediateKeys();

    // updateAll with JSON paths
    await this.case11_UpdateAllWithJsonPaths();

    // Error handling
    await this.case12_ErrorNonExistentColumn();
    await this.case13_ErrorNonJsonColumn();
    await this.case14_ErrorInvalidPathComponent();

    // Security tests
    await this.case15_SecuritySqlInjectionInPath();
    await this.case16_SecuritySqlInjectionInValue();

    this.logSection('[JsonUpdateTestService] All JSON path update test cases completed');
  }

  // ----------------------------------------------------------------
  // CASE 1: Baseline - updateById with normal columns only
  // ----------------------------------------------------------------
  private async case1_UpdateByIdNormalColumns(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 1] Baseline: Update normal columns');

    const code = `JSON_UPDATE_BASELINE_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.NUMBER,
          nValue: 100,
          description: 'Original description',
        },
      });

      const id = created.data.id;

      // Update normal columns only
      const updateResult = await repo.updateById({
        id,
        data: { nValue: 200, description: 'Updated description' },
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        if (verified?.nValue === 200 && verified?.description === 'Updated description') {
          this.logger.info('[CASE 1] PASSED | Normal columns updated correctly');
        } else {
          this.logger.error('[CASE 1] FAILED | Values not updated: nValue=%s, description=%s', verified?.nValue, verified?.description);
        }
      } else {
        this.logger.error('[CASE 1] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Simple JSON path update
  // ----------------------------------------------------------------
  private async case2_UpdateByIdSimpleJsonPath(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 2] Simple JSON path: jValue.theme');

    const code = `JSON_UPDATE_SIMPLE_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      // Create config with initial jValue
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: { theme: 'light', language: 'en' },
        },
      });

      const id = created.data.id;

      // Update using JSON path
      const updateResult = await repo.updateById({
        id,
        data: { 'jValue.theme': 'dark' } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        if (jValue?.theme === 'dark' && jValue?.language === 'en') {
          this.logger.info('[CASE 2] PASSED | theme updated to "dark", language preserved as "en"');
        } else {
          this.logger.error('[CASE 2] FAILED | jValue: %j', jValue);
        }
      } else {
        this.logger.error('[CASE 2] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Nested JSON path update
  // ----------------------------------------------------------------
  private async case3_UpdateByIdNestedJsonPath(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 3] Nested JSON path: jValue.settings.display.fontSize');

    const code = `JSON_UPDATE_NESTED_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {
            settings: {
              display: { fontSize: 12, theme: 'light' },
              notifications: { email: true },
            },
          },
        },
      });

      const id = created.data.id;

      // Update deeply nested path
      const updateResult = await repo.updateById({
        id,
        data: { 'jValue.settings.display.fontSize': 16 } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;
        const fontSize = jValue?.settings?.display?.fontSize;
        const theme = jValue?.settings?.display?.theme;
        const emailNotif = jValue?.settings?.notifications?.email;

        if (fontSize === 16 && theme === 'light' && emailNotif === true) {
          this.logger.info('[CASE 3] PASSED | fontSize=16, theme="light", email=true (all preserved)');
        } else {
          this.logger.error('[CASE 3] FAILED | jValue: %j', jValue);
        }
      } else {
        this.logger.error('[CASE 3] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Array index path update
  // ----------------------------------------------------------------
  private async case4_UpdateByIdArrayIndexPath(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 4] Array index path: jValue.addresses[0].primary');

    const code = `JSON_UPDATE_ARRAY_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {
            addresses: [
              { street: '123 Main St', primary: false },
              { street: '456 Oak Ave', primary: false },
            ],
          },
        },
      });

      const id = created.data.id;

      // Update array element using index
      const updateResult = await repo.updateById({
        id,
        data: { 'jValue.addresses[0].primary': true } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;
        const addr0Primary = jValue?.addresses?.[0]?.primary;
        const addr1Primary = jValue?.addresses?.[1]?.primary;
        const addr0Street = jValue?.addresses?.[0]?.street;

        if (addr0Primary === true && addr1Primary === false && addr0Street === '123 Main St') {
          this.logger.info('[CASE 4] PASSED | addresses[0].primary=true, addresses[1].primary=false');
        } else {
          this.logger.error('[CASE 4] FAILED | jValue: %j', jValue);
        }
      } else {
        this.logger.error('[CASE 4] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: Multiple paths on same column
  // ----------------------------------------------------------------
  private async case5_UpdateByIdMultiplePathsSameColumn(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 5] Multiple paths: jValue.theme, jValue.fontSize');

    const code = `JSON_UPDATE_MULTI_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: { theme: 'light', fontSize: 12, language: 'en' },
        },
      });

      const id = created.data.id;

      // Update multiple paths on same column
      const updateResult = await repo.updateById({
        id,
        data: {
          'jValue.theme': 'dark',
          'jValue.fontSize': 16,
        } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        if (jValue?.theme === 'dark' && jValue?.fontSize === 16 && jValue?.language === 'en') {
          this.logger.info('[CASE 5] PASSED | theme=dark, fontSize=16, language=en (preserved)');
        } else {
          this.logger.error('[CASE 5] FAILED | jValue: %j', jValue);
        }
      } else {
        this.logger.error('[CASE 5] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: Multiple paths update (same column, different nested levels)
  // ----------------------------------------------------------------
  private async case6_UpdateByIdMultiplePaths(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 6] Multiple paths on different nested levels');

    const code = `JSON_UPDATE_MULTICOL_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: { theme: 'light', settings: { debug: false } },
        },
      });

      const id = created.data.id;

      // Update multiple paths
      const updateResult = await repo.updateById({
        id,
        data: {
          'jValue.theme': 'dark',
          'jValue.settings.debug': true,
          'jValue.newField': 'added',
        } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        if (jValue?.theme === 'dark' && jValue?.settings?.debug === true && jValue?.newField === 'added') {
          this.logger.info('[CASE 6] PASSED | All paths updated correctly');
        } else {
          this.logger.error('[CASE 6] FAILED | jValue: %j', jValue);
        }
      } else {
        this.logger.error('[CASE 6] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Mixed regular and JSON path fields
  // ----------------------------------------------------------------
  private async case7_UpdateByIdMixedRegularAndJsonPaths(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 7] Mixed: description + jValue.theme');

    const code = `JSON_UPDATE_MIXED_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          description: 'Original description',
          jValue: { theme: 'light', language: 'en' },
        },
      });

      const id = created.data.id;

      // Mix regular column update with JSON path
      const updateResult = await repo.updateById({
        id,
        data: {
          description: 'Updated description',
          'jValue.theme': 'dark',
        } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        if (verified?.description === 'Updated description' && jValue?.theme === 'dark' && jValue?.language === 'en') {
          this.logger.info('[CASE 7] PASSED | description=Updated, theme=dark, language=en');
        } else {
          this.logger.error('[CASE 7] FAILED | description: %s, jValue: %j', verified?.description, jValue);
        }
      } else {
        this.logger.error('[CASE 7] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Different value types
  // ----------------------------------------------------------------
  private async case8_JsonPathDifferentValueTypes(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 8] Different value types: string, number, boolean, null, object, array');

    const code = `JSON_UPDATE_TYPES_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      // Update with various types
      const updateResult = await repo.updateById({
        id,
        data: {
          'jValue.stringVal': 'hello',
          'jValue.numberVal': 42,
          'jValue.boolVal': true,
          'jValue.nullVal': null,
          'jValue.objectVal': { nested: 'value' },
          'jValue.arrayVal': [1, 2, 3],
        } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        const checks = [
          jValue?.stringVal === 'hello',
          jValue?.numberVal === 42,
          jValue?.boolVal === true,
          jValue?.nullVal === null,
          jValue?.objectVal?.nested === 'value',
          Array.isArray(jValue?.arrayVal) && jValue?.arrayVal.length === 3,
        ];

        if (checks.every(Boolean)) {
          this.logger.info('[CASE 8] PASSED | All value types stored correctly');
        } else {
          this.logger.error('[CASE 8] FAILED | jValue: %j', jValue);
        }
      } else {
        this.logger.error('[CASE 8] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Sibling fields not affected
  // ----------------------------------------------------------------
  private async case9_SiblingFieldsNotAffected(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 9] Verify sibling fields preserved');

    const code = `JSON_UPDATE_SIBLING_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const initialJValue = {
        a: 'original_a',
        b: 'original_b',
        c: 'original_c',
        nested: {
          x: 1,
          y: 2,
          z: 3,
        },
      };

      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: initialJValue,
        },
      });

      const id = created.data.id;

      // Update only 'b' and 'nested.y'
      await repo.updateById({
        id,
        data: {
          'jValue.b': 'updated_b',
          'jValue.nested.y': 99,
        } as any,
      });

      const verified = await repo.findById({ id });
      const jValue = verified?.jValue as Record<string, any>;

      const allPreserved =
        jValue?.a === 'original_a' &&
        jValue?.b === 'updated_b' &&
        jValue?.c === 'original_c' &&
        jValue?.nested?.x === 1 &&
        jValue?.nested?.y === 99 &&
        jValue?.nested?.z === 3;

      if (allPreserved) {
        this.logger.info('[CASE 9] PASSED | a=original_a, b=updated_b, c=original_c, x=1, y=99, z=3');
      } else {
        this.logger.error('[CASE 9] FAILED | jValue: %j', jValue);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Creates missing intermediate keys
  // ----------------------------------------------------------------
  private async case10_CreatesMissingIntermediateKeys(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 10] Create missing intermediate keys');

    const code = `JSON_UPDATE_CREATE_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      // Create with empty jValue
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      // Update deeply nested path on empty object
      await repo.updateById({
        id,
        data: {
          'jValue.deeply.nested.path.value': 'created',
        } as any,
      });

      const verified = await repo.findById({ id });
      const jValue = verified?.jValue as Record<string, any>;

      if (jValue?.deeply?.nested?.path?.value === 'created') {
        this.logger.info('[CASE 10] PASSED | Created deeply.nested.path.value="created"');
      } else {
        this.logger.error('[CASE 10] FAILED | jValue: %j', jValue);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: updateAll with JSON paths
  // ----------------------------------------------------------------
  private async case11_UpdateAllWithJsonPaths(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 11] Bulk update with JSON paths');

    const groupId = `JSON_BULK_${getUID()}`;

    try {
      // Create multiple configs
      await repo.createAll({
        data: [
          {
            code: `${groupId}_1`,
            group: groupId,
            dataType: DataTypes.JSON,
            jValue: { verified: false, batchGroup: groupId },
          },
          {
            code: `${groupId}_2`,
            group: groupId,
            dataType: DataTypes.JSON,
            jValue: { verified: false, batchGroup: groupId },
          },
          {
            code: `${groupId}_3`,
            group: groupId,
            dataType: DataTypes.JSON,
            jValue: { verified: false, batchGroup: groupId },
          },
        ],
      });

      // Bulk update using JSON path
      const updateResult = await repo.updateAll({
        where: { group: groupId },
        data: { 'jValue.verified': true } as any,
      });

      if (updateResult.count === 3) {
        // Verify all configs have verified=true
        const configs = await repo.find({
          filter: { where: { group: groupId } },
        });

        const allVerified = configs.every(c => (c.jValue as any)?.verified === true);

        if (allVerified) {
          this.logger.info('[CASE 11] PASSED | All %d configs have verified=true', configs.length);
        } else {
          this.logger.error('[CASE 11] FAILED | Not all configs verified');
        }
      } else {
        this.logger.info('[CASE 11] INFO | updateAll returned count: %d (expected 3)', updateResult.count);
      }

      await repo.deleteAll({ where: { group: groupId } });
    } catch (error) {
      this.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Error - Non-existent column
  // ----------------------------------------------------------------
  private async case12_ErrorNonExistentColumn(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 12] Error: Non-existent column path');

    const code = `JSON_UPDATE_ERR_COL_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      try {
        await repo.updateById({
          id,
          data: { 'nonexistent.field': 'value' } as any,
        });
        this.logger.error('[CASE 12] FAILED | Should have thrown error');
      } catch (err: any) {
        if (err.message.includes('NOT FOUND') || err.message.includes('not found')) {
          this.logger.info('[CASE 12] PASSED | Error thrown for non-existent column');
        } else {
          this.logger.info('[CASE 12] INFO | Different error: %s', err.message.substring(0, 80));
        }
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 12] FAILED | Setup error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Error - Non-JSON column
  // ----------------------------------------------------------------
  private async case13_ErrorNonJsonColumn(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 13] Error: JSON path on non-JSON column');

    const code = `JSON_UPDATE_ERR_TYPE_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      try {
        // description is a text column, not JSON
        await repo.updateById({
          id,
          data: { 'description.nested': 'value' } as any,
        });
        this.logger.error('[CASE 13] FAILED | Should have thrown error');
      } catch (err: any) {
        if (err.message.toLowerCase().includes('json') || err.message.includes('not JSON')) {
          this.logger.info('[CASE 13] PASSED | Error thrown for non-JSON column');
        } else {
          this.logger.info('[CASE 13] INFO | Different error: %s', err.message.substring(0, 80));
        }
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 13] FAILED | Setup error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Error - Invalid path component
  // ----------------------------------------------------------------
  private async case14_ErrorInvalidPathComponent(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 14] Error: Invalid characters in path');

    const code = `JSON_UPDATE_ERR_PATH_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      const invalidPaths = [
        'jValue.invalid field',  // space
        'jValue.field@domain',   // special char
        'jValue.2startWithNum',  // starts with number
        'jValue.field()',        // parentheses
      ];

      let allRejected = true;

      for (const path of invalidPaths) {
        try {
          await repo.updateById({
            id,
            data: { [path]: 'value' } as any,
          });
          this.logger.error('[CASE 14] FAILED | Path should be rejected: %s', path);
          allRejected = false;
        } catch {
          // Expected to throw
        }
      }

      if (allRejected) {
        this.logger.info('[CASE 14] PASSED | All invalid paths rejected');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 14] FAILED | Setup error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Security - SQL injection in path
  // ----------------------------------------------------------------
  private async case15_SecuritySqlInjectionInPath(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 15] Security: SQL injection in path rejected');

    const code = `JSON_UPDATE_SEC_PATH_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      const sqlInjectionPaths = [
        "jValue.'; DROP TABLE Configuration; --",
        "jValue.' OR '1'='1",
        'jValue.field; DELETE FROM Configuration;',
        'jValue.UNION SELECT * FROM passwords',
      ];

      let allRejected = true;

      for (const path of sqlInjectionPaths) {
        try {
          await repo.updateById({
            id,
            data: { [path]: 'value' } as any,
          });
          this.logger.error('[CASE 15] FAILED | SQL injection should be rejected: %s', path.substring(0, 40));
          allRejected = false;
        } catch {
          // Expected - SQL injection should be rejected
        }
      }

      if (allRejected) {
        this.logger.info('[CASE 15] PASSED | All SQL injection paths rejected');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 15] FAILED | Setup error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Security - SQL injection in value
  // ----------------------------------------------------------------
  private async case16_SecuritySqlInjectionInValue(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 16] Security: SQL injection in value safely stored');

    const code = `JSON_UPDATE_SEC_VAL_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      const sqlInjectionPayload = "'; DROP TABLE Configuration; --";

      // This should succeed - the value is stored as a string
      await repo.updateById({
        id,
        data: { 'jValue.userInput': sqlInjectionPayload } as any,
      });

      const verified = await repo.findById({ id });
      const jValue = verified?.jValue as Record<string, any>;

      if (jValue?.userInput === sqlInjectionPayload) {
        this.logger.info('[CASE 16] PASSED | SQL injection payload safely stored as string');
      } else {
        this.logger.error('[CASE 16] FAILED | Value not stored correctly: %s', jValue?.userInput);
      }

      // Verify no tables were dropped (Configuration table still works)
      const configStillExists = await repo.findById({ id });
      if (configStillExists) {
        this.logger.info('[CASE 16] PASSED | Database intact after injection attempt');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }
}
