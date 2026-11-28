import { describe, expect, test } from 'bun:test';
import ts from 'typescript';
import { NamespaceFunctions } from '../cli/codemod/namespace-functions/rewriter';
import { GUARD_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/guards';
import { PublicNames, PublicNamesTable } from '../cli/codemod/public-names';

const rewrite = (...lines: string[]) =>
  PublicNames.rewrite({ typescript: ts, fileName: 'file.ts', source: lines.join('\n') });

const lines = (...text: string[]) => text.join('\n');

/** Every specifier a type name is importable from. */
const TYPE_SPECIFIERS = [
  '@venizia/ignis-inversion',
  '@venizia/ignis-helpers',
  '@venizia/ignis-helpers/common',
  '@venizia/ignis',
];

const TYPE_RENAMES = [
  ['ValueOf', 'TValueOf'],
  ['ValueOrPromise', 'TValueOrPromise'],
  ['TConstructor', 'TClass'],
  ['TAbstractConstructor', 'TAbstractClass'],
];

/** Each guard, the class that holds it now, and every specifier that exported the function. */
const GUARDS: Array<[string, string, string[]]> = [
  [
    'isClass',
    'ResolverUtility',
    [
      '@venizia/ignis-inversion',
      '@venizia/ignis-kernel',
      '@venizia/ignis',
      '@venizia/ignis-helpers',
      '@venizia/ignis-helpers/common',
    ],
  ],
  [
    'isClassProvider',
    'Binding',
    ['@venizia/ignis-inversion', '@venizia/ignis-kernel', '@venizia/ignis'],
  ],
  [
    'isApplicationError',
    'ApplicationError',
    ['@venizia/ignis-inversion', '@venizia/ignis-helpers', '@venizia/ignis-helpers/core'],
  ],
  ['isPromiseLike', 'Execution', ['@venizia/ignis-helpers']],
  ['isRedisHelper', 'AbstractRedisHelper', ['@venizia/ignis-helpers']],
  ['isDataSourceClass', 'DataSourceRoot', ['@venizia/ignis-kernel', '@venizia/ignis']],
  [
    'isRelationalTransaction',
    'AbstractRelationalDataSource',
    ['@venizia/ignis-connectors', '@venizia/ignis-connectors/relational'],
  ],
  [
    'isDatabaseTransaction',
    'AbstractPostgresDataSource',
    ['@venizia/ignis-connectors/postgres', '@venizia/ignis'],
  ],
];

describe('devz codemod public-names: types', () => {
  test('the table holds exactly the renamed types', () => {
    expect(PublicNamesTable.TYPE_ROWS.map((row) => [row.oldName, row.newName])).toEqual(
      TYPE_RENAMES,
    );
  });

  for (const specifier of TYPE_SPECIFIERS) {
    test.each(TYPE_RENAMES)(`%s becomes %s from ${specifier}`, (oldName, newName) => {
      const result = rewrite(
        `import type { ${oldName} } from '${specifier}';`,
        `export type TUse = ${oldName}<string>;`,
      );

      expect(result.output).toBe(
        lines(
          `import type { ${newName} } from '${specifier}';`,
          `export type TUse = ${newName}<string>;`,
        ),
      );
      expect(result.manual).toEqual([]);
    });
  }

  test('an aliased import keeps its alias', () => {
    const result = rewrite(
      `import { type ValueOrPromise as Maybe } from '@venizia/ignis-helpers';`,
      `export type TUse = Maybe<string>;`,
    );

    expect(result.output).toBe(
      lines(
        `import { type TValueOrPromise as Maybe } from '@venizia/ignis-helpers';`,
        `export type TUse = Maybe<string>;`,
      ),
    );
  });

  test('a local declaration and the same name from another package are left alone', () => {
    const local = lines(
      `import { BaseHelper } from '@venizia/ignis-helpers';`,
      `type ValueOf<T> = T[keyof T];`,
      `export type TUse = ValueOf<typeof BaseHelper>;`,
    );
    const foreign = lines(
      `import type { ValueOf } from 'type-fest';`,
      `export type TUse = ValueOf<object>;`,
    );

    expect(rewrite(local).output).toBe(local);
    expect(rewrite(foreign).output).toBe(foreign);
  });

  test('a file that declares the new name imports it under an Ignis alias', () => {
    const result = rewrite(
      `import type { ValueOrPromise } from '@venizia/ignis-helpers';`,
      `type TValueOrPromise = string;`,
      `export type TUse = ValueOrPromise<TValueOrPromise>;`,
    );

    expect(result.output).toBe(
      lines(
        `import type { TValueOrPromise as IgnisTValueOrPromise } from '@venizia/ignis-helpers';`,
        `type TValueOrPromise = string;`,
        `export type TUse = IgnisTValueOrPromise<TValueOrPromise>;`,
      ),
    );
  });

  test.each([
    ['TConstructor', 'TClass'],
    ['TAbstractConstructor', 'TAbstractClass'],
  ])('%s merges into an import of %s that is already there', (oldName, newName) => {
    const same = rewrite(
      `import type { ${oldName}, ${newName} } from '@venizia/ignis-helpers';`,
      `export type TUse = ${oldName}<A> | ${newName}<B>;`,
    );
    const split = rewrite(
      `import type { ${newName} } from '@venizia/ignis-helpers';`,
      `import type { ${oldName} } from '@venizia/ignis-inversion';`,
      `export type TUse = ${oldName}<A> | ${newName}<B>;`,
    );

    expect(same.output).toBe(
      lines(
        `import type { ${newName} } from '@venizia/ignis-helpers';`,
        `export type TUse = ${newName}<A> | ${newName}<B>;`,
      ),
    );
    expect(split.output).toBe(
      lines(
        `import type { ${newName} } from '@venizia/ignis-helpers';`,
        `export type TUse = ${newName}<A> | ${newName}<B>;`,
      ),
    );
  });

  test('a value-position use is not merged into a type-only import of the new name', () => {
    const result = rewrite(
      `import type { TClass } from '@venizia/ignis-helpers';`,
      `import { TConstructor } from '@venizia/ignis-inversion';`,
      `export type TUse = TConstructor<A> | TClass<B>;`,
    );

    expect(result.output).toContain(`export type TUse = TClass<A> | TClass<B>;`);
    expect(result.output).not.toContain('TConstructor');
  });

  test('a name declared again inside the file is left for a person', () => {
    const source = lines(
      `import type { ValueOf } from '@venizia/ignis-helpers';`,
      `export type TUse = ValueOf<object>;`,
      `export const make = <ValueOf>(value: ValueOf) => value;`,
    );
    const result = rewrite(source);

    expect(result.output).toBe(source);
    expect(result.manual.map((entry) => entry.line)).toEqual([3]);
  });
});

describe('devz codemod public-names: type guards', () => {
  test('the mapping table holds exactly these guards at these specifiers', () => {
    expect(
      GUARD_MAPPINGS.map((entry) => [entry.oldName, entry.className, [...entry.modules].sort()]),
    ).toEqual(
      expect.arrayContaining(
        GUARDS.map(([oldName, className, modules]) => [oldName, className, [...modules].sort()]),
      ),
    );
    expect(GUARD_MAPPINGS).toHaveLength(GUARDS.length);
  });

  for (const [oldName, className, modules] of GUARDS) {
    test.each(modules)(`${oldName} becomes ${className}.${oldName} from %s`, (specifier) => {
      const result = rewrite(
        `import { ${oldName} } from '${specifier}';`,
        `export const is = (value: unknown) => ${oldName}(value);`,
      );

      expect(result.output).toBe(
        lines(
          `import { ${className} } from '${specifier}';`,
          `export const is = (value: unknown) => ${className}.${oldName}(value);`,
        ),
      );
      expect(result.manual).toEqual([]);
    });
  }

  test('an aliased import and a type argument are handled', () => {
    const result = rewrite(
      `import { isClass as isCtor } from '@venizia/ignis-inversion';`,
      `export const is = (value: unknown) => isCtor<Foo>(value);`,
    );

    expect(result.output).toBe(
      lines(
        `import { ResolverUtility } from '@venizia/ignis-inversion';`,
        `export const is = (value: unknown) => ResolverUtility.isClass<Foo>(value);`,
      ),
    );
  });

  test('a type import of the class turns into a value import', () => {
    const result = rewrite(
      `import { isApplicationError, type ApplicationError } from '@venizia/ignis-helpers/core';`,
      `export const read = (error: unknown): ApplicationError | undefined =>`,
      `  isApplicationError(error) ? error : undefined;`,
    );

    expect(result.output).toBe(
      lines(
        `import { ApplicationError } from '@venizia/ignis-helpers/core';`,
        `export const read = (error: unknown): ApplicationError | undefined =>`,
        `  ApplicationError.isApplicationError(error) ? error : undefined;`,
      ),
    );
    expect(result.manual).toEqual([]);
  });

  test('an `import type` of the class moves to the value import', () => {
    const result = rewrite(
      `import { isApplicationError, UrlBuilder } from '@venizia/ignis-helpers/core';`,
      `import type { ApplicationError } from '@venizia/ignis-helpers/core';`,
      `export const read = (error: unknown): ApplicationError | undefined =>`,
      `  isApplicationError(error) ? error : UrlBuilder.fail();`,
    );

    expect(result.output).toBe(
      lines(
        `import { ApplicationError, UrlBuilder } from '@venizia/ignis-helpers/core';`,
        `export const read = (error: unknown): ApplicationError | undefined =>`,
        `  ApplicationError.isApplicationError(error) ? error : UrlBuilder.fail();`,
      ),
    );
    expect(result.manual).toEqual([]);
  });

  test('a local function of a guard name, and one from another package, are left alone', () => {
    const local = lines(
      `const isClass = (value: unknown) => Boolean(value);`,
      `export const use = isClass(1);`,
    );
    const foreign = lines(
      `import { isPromiseLike } from 'somewhere-else';`,
      `export const use = isPromiseLike(1);`,
    );

    expect(rewrite(local).output).toBe(local);
    expect(rewrite(foreign).output).toBe(foreign);
  });

  test('a guard passed as a value, or re-exported, is listed with its line', () => {
    const source = lines(
      `import { isRedisHelper } from '@venizia/ignis-helpers';`,
      `export { isPromiseLike } from '@venizia/ignis-helpers';`,
      `export const all = [1].filter(isRedisHelper);`,
    );
    const result = rewrite(source);

    expect(result.output).toBe(source);
    expect(result.manual.map((entry) => entry.line)).toEqual([2, 3]);
  });

  test('types and guards of one file are rewritten in one run', () => {
    const result = rewrite(
      `import { isPromiseLike, type ValueOrPromise } from '@venizia/ignis-helpers';`,
      `export const is = (value: ValueOrPromise<number>) => isPromiseLike(value);`,
    );

    expect(result.output).toBe(
      lines(
        `import { Execution, type TValueOrPromise } from '@venizia/ignis-helpers';`,
        `export const is = (value: TValueOrPromise<number>) => Execution.isPromiseLike(value);`,
      ),
    );
  });

  test('a second run changes nothing', () => {
    const first = rewrite(
      `import { isClass, type TConstructor } from '@venizia/ignis-inversion';`,
      `export const is = (value: TConstructor<A>) => isClass(value);`,
    );

    expect(rewrite(first.output).changed).toBe(false);
  });

  test('the namespace-functions command carries the same guard rows', () => {
    const result = NamespaceFunctions.rewrite({
      typescript: ts,
      fileName: 'file.ts',
      source: lines(`import { isClass } from '@venizia/ignis';`, `isClass(1);`),
      mappings: GUARD_MAPPINGS,
    });

    expect(result.output).toContain('ResolverUtility.isClass(1);');
  });
});
