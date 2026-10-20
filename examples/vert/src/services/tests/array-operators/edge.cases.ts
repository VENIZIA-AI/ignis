import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Edge Cases - cleanup and data-shape robustness: large arrays, special/unicode characters,
// duplicates, case sensitivity, empty strings, numeric-like strings and null columns
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 12: Cleanup test data
  // ----------------------------------------------------------------
  async case12Cleanup(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 12] Cleanup array operator test data');

    try {
      const deleted = await repo.deleteAll({ where: { description: 'ARRAY_OPERATOR_TEST' } });
      this.context.logger.info('[CASE 12] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.context.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Large Array Contains (100+ elements)
  // ----------------------------------------------------------------
  async case13LargeArrayContains(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 13] Large array with 100+ elements');

    try {
      // Create product with large array
      const largeTags = Array.from({ length: 100 }, (_, i) => `tag_${i}`);
      largeTags.push('special_tag'); // Add a specific tag we'll search for

      await repo.create({
        data: {
          code: `ARRAY_LARGE_${getUID()}`,
          name: 'Large Array Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 999,
          tags: largeTags,
        },
      });

      // Search for specific tag in large array
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['special_tag'] },
          } as any,
        },
      });

      const found = results.find(r => r.name === 'Large Array Product');
      if (found && found.tags?.length === 101) {
        this.context.logger.info('[CASE 13] PASSED | Found product with 101 tags');
      } else {
        this.context.logger.error(
          '[CASE 13] FAILED | Expected product with 101 tags | Got: %d',
          found?.tags?.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Special Characters in Array Elements
  // ----------------------------------------------------------------
  async case14SpecialCharactersInArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 14] Special characters in array elements');

    try {
      const specialTags = [
        'tag-with-dash',
        'tag_with_underscore',
        'tag.with.dots',
        'tag with spaces',
        'tag/with/slashes',
        'täg-wïth-ünicödé',
        '日本語タグ',
        'emoji🎉tag',
      ];

      await repo.create({
        data: {
          code: `ARRAY_SPECIAL_${getUID()}`,
          name: 'Special Chars Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 888,
          tags: specialTags,
        },
      });

      // Search for unicode tag
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['日本語タグ'] },
          } as any,
        },
      });

      const found = results.find(r => r.name === 'Special Chars Product');
      if (found) {
        this.context.logger.info('[CASE 14] PASSED | Found product with unicode tag');
      } else {
        this.context.logger.error('[CASE 14] FAILED | Could not find product with unicode tag');
      }

      // Search for tag with spaces
      const spacesResults = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['tag with spaces'] },
          } as any,
        },
      });

      const foundSpaces = spacesResults.find(r => r.name === 'Special Chars Product');
      if (foundSpaces) {
        this.context.logger.info('[CASE 14] PASSED | Found product with spaces in tag');
      } else {
        this.context.logger.error('[CASE 14] FAILED | Could not find product with spaces in tag');
      }
    } catch (error) {
      this.context.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Duplicate Elements in Array
  // ----------------------------------------------------------------
  async case15DuplicateElementsInArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 15] Duplicate elements in array');

    try {
      // Create product with duplicate tags
      const product = await repo.create({
        data: {
          code: `ARRAY_DUP_${getUID()}`,
          name: 'Duplicate Tags Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 777,
          tags: ['dup_tag', 'dup_tag', 'dup_tag', 'unique_tag'],
        },
      });

      // Verify the array stores duplicates
      const found = await repo.findById({ id: product.data.id });
      const dupCount = found?.tags?.filter(t => t === 'dup_tag').length ?? 0;

      if (dupCount === 3) {
        this.context.logger.info(
          '[CASE 15] PASSED | Array stores duplicate elements (count: %d)',
          dupCount,
        );
      } else if (dupCount === 1) {
        this.context.logger.info(
          '[CASE 15] INFO | Array de-duplicates elements (count: %d)',
          dupCount,
        );
      } else {
        this.context.logger.error('[CASE 15] FAILED | Unexpected duplicate count: %d', dupCount);
      }

      // Contains still works with duplicates
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['dup_tag'] },
          } as any,
        },
      });

      const containsResult = results.find(r => r.name === 'Duplicate Tags Product');
      if (containsResult) {
        this.context.logger.info('[CASE 15] PASSED | Contains works with duplicate elements');
      }
    } catch (error) {
      this.context.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Case Sensitivity
  // ----------------------------------------------------------------
  async case16CaseSensitivity(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 16] Case sensitivity in array operators');

    try {
      await repo.create({
        data: {
          code: `ARRAY_CASE_${getUID()}`,
          name: 'Case Test Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 666,
          tags: ['CamelCase', 'UPPERCASE', 'lowercase', 'MiXeD'],
        },
      });

      // Test exact case match
      const exactMatch = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['CamelCase'] },
          } as any,
        },
      });

      // Test wrong case
      const wrongCase = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['camelcase'] },
          } as any,
        },
      });

      if (exactMatch.find(r => r.name === 'Case Test Product')) {
        this.context.logger.info('[CASE 16] PASSED | Exact case match works');
      }

      if (!wrongCase.find(r => r.name === 'Case Test Product')) {
        this.context.logger.info('[CASE 16] PASSED | Array contains is case-sensitive');
      } else {
        this.context.logger.info('[CASE 16] INFO | Array contains is case-insensitive');
      }
    } catch (error) {
      this.context.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Empty String in Array
  // ----------------------------------------------------------------
  async case17EmptyStringInArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 17] Empty string in array elements');

    try {
      const product = await repo.create({
        data: {
          code: `ARRAY_EMPTY_STR_${getUID()}`,
          name: 'Empty String Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 555,
          tags: ['normal_tag', '', 'another_tag'],
        },
      });

      // Search for empty string
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: [''] },
          } as any,
        },
      });

      const found = results.find(r => r.name === 'Empty String Product');
      if (found) {
        this.context.logger.info('[CASE 17] PASSED | Can search for empty string in array');
      } else {
        this.context.logger.info('[CASE 17] INFO | Empty string search did not match');
      }

      // Verify empty string is stored
      const fetched = await repo.findById({ id: product.data.id });
      const hasEmpty = fetched?.tags?.includes('');
      if (hasEmpty) {
        this.context.logger.info('[CASE 17] PASSED | Empty string is stored in array');
      } else {
        this.context.logger.info('[CASE 17] INFO | Empty string may be filtered out');
      }
    } catch (error) {
      this.context.logger.error('[CASE 17] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Array with Numeric-like Strings
  // ----------------------------------------------------------------
  async case19ArrayWithNumericLikeStrings(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 19] Array with numeric-like strings');

    try {
      const product = await repo.create({
        data: {
          code: `ARRAY_NUMERIC_${getUID()}`,
          name: 'Numeric Strings Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 444,
          tags: ['123', '456.78', '-99', '0', '1e10'],
        },
      });

      // Search for numeric-like string
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['123'] },
          } as any,
        },
      });

      const found = results.find(r => r.name === 'Numeric Strings Product');
      if (found) {
        this.context.logger.info('[CASE 19] PASSED | Numeric-like strings work in array');
      } else {
        this.context.logger.error('[CASE 19] FAILED | Could not find product with numeric string');
      }

      // Verify all numeric strings stored correctly
      const fetched = await repo.findById({ id: product.data.id });
      if (fetched?.tags?.length === 5) {
        this.context.logger.info('[CASE 19] PASSED | All numeric-like strings stored');
      }
    } catch (error) {
      this.context.logger.error('[CASE 19] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 21: Null Array Column
  // ----------------------------------------------------------------
  async case21NullArrayColumn(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 21] Null array column handling');

    try {
      // Create product with null tags (if schema allows)
      const product = await repo.create({
        data: {
          code: `ARRAY_NULL_${getUID()}`,
          name: 'Null Tags Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 333,
          tags: null as any,
        },
      });

      // Verify null is stored
      const fetched = await repo.findById({ id: product.data.id });
      if (fetched?.tags === null) {
        this.context.logger.info('[CASE 21] PASSED | Null array column stored correctly');
      } else if (Array.isArray(fetched?.tags) && fetched.tags.length === 0) {
        this.context.logger.info('[CASE 21] INFO | Null converted to empty array');
      } else {
        this.context.logger.info('[CASE 21] INFO | Null handling: %j', fetched?.tags);
      }

      // Contains on null column should not match - use 'electronics' which EXISTS in other test products
      // This isolates the null array behavior: 'electronics' exists in Product A and B
      const resultsWithExistingTag = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['electronics'] },
          } as any,
        },
      });

      const nullProductInResults = resultsWithExistingTag.find(r => r.name === 'Null Tags Product');
      const productsWithElectronics = resultsWithExistingTag.filter(r =>
        r.tags?.includes('electronics'),
      );

      // Verify: products with 'electronics' should be found, but null-tags product should NOT
      if (!nullProductInResults && productsWithElectronics.length > 0) {
        this.context.logger.info(
          '[CASE 21] PASSED | Null array excluded from contains, %d products with electronics found',
          productsWithElectronics.length,
        );
      } else if (nullProductInResults) {
        this.context.logger.error(
          '[CASE 21] FAILED | Null array product should not match contains',
        );
      } else {
        this.context.logger.info(
          '[CASE 21] INFO | No electronics products found (may be cleaned up) | null excluded: %s',
          !nullProductInResults,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 21] FAILED | Error: %s', (error as Error).message);
    }
  }
}
