import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import type { IZodSchemaConventionOptions } from '../linters/house';
import { houseConfigs, houseEslintPlugin, ZodSchemaConventionRule } from '../linters/house';

const run = (opts: { code: string; rule: string; entry: Linter.RuleEntry; filename?: string }) => {
  const config: Linter.Config[] = [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser as Linter.Parser },
      plugins: { '@venizia': houseEslintPlugin },
      rules: { [opts.rule]: opts.entry },
    },
  ];
  const linter = new Linter({ cwd: '/project' });
  const filename = opts.filename ?? '/project/src/subject.ts';

  return {
    messages: linter.verify(opts.code, config, { filename }).map((message) => message.message),
    fixed: linter.verifyAndFix(opts.code, config, { filename }).output,
  };
};

const zod = (code: string, options: IZodSchemaConventionOptions = {}, filename?: string) =>
  run({
    code,
    rule: ZodSchemaConventionRule.NAME,
    entry: ZodSchemaConventionRule.build(options),
    filename,
  });

const Z = "import { z } from 'zod';\n";
const named = (name: string, expected: string) =>
  `A const that holds a zod schema is PascalCase and ends in \`Schema\`: \`${name} → ${expected}\`.`;

describe('@venizia/zod-schema-convention: schema names', () => {
  test.each([
    ['camelCase', 'const user = z.object({});', 'user', 'UserSchema'],
    ['camelCase with the suffix', 'const userSchema = z.object({});', 'userSchema', 'UserSchema'],
    ['upper case', 'const SALE_ORDER = z.string();', 'SALE_ORDER', 'SaleOrderSchema'],
    ['the old suffix', 'const USER_SCHEMA = z.string();', 'USER_SCHEMA', 'UserSchema'],
    ['PascalCase without the suffix', 'const User = z.string();', 'User', 'UserSchema'],
    [
      'a local const',
      'function f() { const user = z.string(); return user; }',
      'user',
      'UserSchema',
    ],
    ['a bare name', 'const schema = z.string();', 'schema', '<What>Schema'],
  ])('reports %s', (_, code, name, expected) => {
    expect(zod(Z + code).messages).toEqual([named(name, expected)]);
  });

  test.each([
    ['another const of the file', 'const ASchema = z.object({}); const b = ASchema.extend({});'],
    ['a chain of consts', 'const ASchema = z.object({}); const b = ASchema.pick({});'],
    ['any method of a local schema', 'const ASchema = z.object({}); const b = ASchema.nullable();'],
    ['an array of a local schema', 'const ASchema = z.string(); const b = ASchema.array();'],
    [
      "an imported schema's extend",
      "import { BaseSchema } from './base';\nconst b = BaseSchema.extend({});",
    ],
    [
      'an imported upper-case schema',
      "import { BASE_SCHEMA } from './base';\nconst b = BASE_SCHEMA.omit({});",
    ],
  ])('follows %s', (_, code) => {
    expect(zod(Z + code).messages).toEqual([named('b', 'BSchema')]);
  });

  test.each([
    ['z of hono', "import { z } from '@hono/zod-openapi';\nconst b = z.object({}).openapi({});"],
    ['zod/mini', "import * as z from 'zod/mini';\nconst b = z.object({});"],
    ['an alias', "import { z as s } from 'zod/v4';\nconst b = s.object({});"],
  ])('knows %s', (_, code) => {
    expect(zod(code).messages).toEqual([named('b', 'BSchema')]);
  });

  test.each([
    ['the form it asks for', 'const UserSchema = z.object({});'],
    ['a parsed value', "const user = z.string().parse('a');"],
    ['a value parsed by a local schema', 'const ASchema = z.string(); const a = ASchema.parse(1);'],
    ['a part of a schema', 'const shape = z.object({}).shape;'],
    ['a let', 'let user = z.string();'],
    [
      'another call on an import',
      "import { BaseSchema } from './base';\nconst a = BaseSchema.describeIt();",
    ],
    ['an import under another name', "import { base } from './base';\nconst a = base.extend({});"],
    ['a member', 'const a = this.schema.extend({});'],
    [
      'a route of hono',
      "import { createRoute } from '@hono/zod-openapi';\nconst route = createRoute({});",
    ],
    ['a const that refers to itself', 'const a = a.extend({});'],
    ['an implemented function', 'const f = z.function({ input: [] }).implement(() => 1);'],
    ['an asynchronously implemented function', 'const f = z.function({}).implementAsync(run);'],
    ['the values of an enum', "const values = z.enum(['a']).enum;"],
    ['the metadata read back', 'const ASchema = z.string(); const info = ASchema.meta();'],
    ['a regex of zod', 'const isEmail = z.regexes.email.test(text);'],
    ["a class of zod's", "import { ZodError } from 'zod';\nconst error = ZodError.create([]);"],
    ["a class of zod's through z", 'const error = z.ZodError.create([]);'],
    [
      'a bare Schema of another library',
      "import { Schema } from 'effect';\nconst joined = Schema.extend(A, B);",
    ],
    [
      'what a function answers',
      "import { getSchema } from './base';\nconst a = getSchema().extend({});",
    ],
    [
      'a derivation after another call',
      "import { BaseSchema } from './base';\nconst a = BaseSchema.build().extend({});",
    ],
  ])('says nothing on %s', (_, code) => {
    expect(zod(Z + code).messages).toEqual([]);
  });

  test.each([
    ['an enum', "const b = z.enum(['a']);"],
    ['metadata set on a schema', "const b = z.string().meta({ id: 'b' });"],
  ])('still follows %s', (_, code) => {
    expect(zod(Z + code).messages).toEqual([named('b', 'BSchema')]);
  });

  test('is off with schemaName: false, and skips an ignored name', () => {
    expect(zod(`${Z}const user = z.string();`, { schemaName: false }).messages).toEqual([]);
    expect(zod(`${Z}const user = z.string();`, { ignore: ['user'] }).messages).toEqual([]);
  });

  test('skips tests unless told otherwise', () => {
    const code = `${Z}const user = z.string();`;
    const file = '/project/src/__tests__/a.ts';

    expect(zod(code, {}, file).messages).toEqual([]);
    expect(zod(code, { ignoreTests: false }, file).messages).toHaveLength(1);
  });
});

describe('@venizia/zod-schema-convention: inferred types', () => {
  const typed = (name: string, kind: string, schema = 'SaleOrderReplySchema') =>
    zod(`${Z}type ${name} = z.${kind}<typeof ${schema}>;`).messages;

  test.each([
    ['TSaleOrderReply', 'infer'],
    ['SaleOrderReplyType', 'output'],
    ['TSaleOrderReplyInput', 'input'],
    ['SaleOrderReplyInputType', 'input'],
    ['TSaleOrderReplyOutput', 'infer'],
    ['SaleOrderReplyOutputType', 'output'],
  ])('accepts %s from z.%s', (name, kind) => {
    expect(typed(name, kind)).toEqual([]);
  });

  test.each([
    ['SaleOrderReply', 'infer'],
    ['TReply', 'infer'],
    ['TSaleOrderReplySchema', 'infer'],
    ['TSaleOrderReplyOutput', 'input'],
    ['TSaleOrderReplyInput', 'infer'],
  ])('reports %s from z.%s', (name, kind) => {
    expect(typed(name, kind)).toEqual([
      `A type inferred from \`SaleOrderReplySchema\` is named \`TSaleOrderReply\` or \`SaleOrderReplyType\`, not \`${name}\`.`,
    ]);
  });

  test('reads an upper-case schema, and a type import of z', () => {
    expect(typed('TSaleOrder', 'infer', 'SALE_ORDER_SCHEMA')).toEqual([]);
    expect(
      zod("import type { z } from 'zod';\ntype A = z.infer<typeof UserSchema>;").messages,
    ).toHaveLength(1);
  });

  test('says nothing on another namespace, or with typeName: false', () => {
    expect(zod("import { y } from './y';\ntype A = y.infer<typeof UserSchema>;").messages).toEqual(
      [],
    );
    expect(zod(`${Z}type A = z.infer<typeof UserSchema>;`, { typeName: false }).messages).toEqual(
      [],
    );
  });
});

describe('@venizia/zod-schema-convention: strict objects and any', () => {
  const options = { strictPaths: ['src/dto/**'], noAnyPaths: ['src/dto/**'] };
  const inside = '/project/src/dto/a.ts';
  const strict = 'An object schema here is strict: `z.strictObject({ ... })`.';

  test('rewrites .strict() to z.strictObject', () => {
    const result = zod(
      `${Z}const ASchema = z.object({ a: z.string() }).strict();`,
      options,
      inside,
    );

    expect(result.messages).toEqual([strict]);
    expect(result.fixed).toBe(`${Z}const ASchema = z.strictObject({ a: z.string() });`);
  });

  test.each([
    ['a plain object', 'const ASchema = z.object({});'],
    ['.strict() with an argument', "const ASchema = z.object({}).strict('no');"],
    ['a comment before .strict()', 'const ASchema = z.object({}) /* why */.strict();'],
  ])('reports %s without a fix', (_, code) => {
    const result = zod(Z + code, options, inside);

    expect(result.messages).toEqual([strict]);
    expect(result.fixed).toBe(Z + code);
  });

  test('reports z.any()', () => {
    expect(zod(`${Z}const ASchema = z.array(z.any());`, options, inside).messages).toEqual([
      '`z.any()` accepts everything: describe the value, or use `z.unknown()` and narrow it.',
    ]);
  });

  test('says nothing outside the paths, or with no path', () => {
    const code = `${Z}const ASchema = z.object({ a: z.any() });`;

    expect(zod(code, options).messages).toEqual([]);
    expect(zod(code, {}, inside).messages).toEqual([]);
  });

  test('says nothing on a strict object or on another object()', () => {
    const code = `${Z}const ASchema = z.strictObject({});\nconst b = other.object({});`;

    expect(zod(code, options, inside).messages).toEqual([]);
  });
});

describe('@venizia/zod-schema-convention: strict calls, passthrough and coerce', () => {
  const strictCall =
    '`z.object(...).strict()` is `z.strictObject(...)`: write the strict object directly.';
  const passthrough =
    '`.passthrough()` is deprecated: write `z.looseObject({ ... })`, or `.loose()` on a schema you did not declare here.';
  const coerce =
    '`z.coerce` accepts what it can convert, `"abc"` as `NaN` included: declare both sides with `z.codec`.';

  test('rewrites .strict() to z.strictObject in any file', () => {
    const result = zod(`${Z}const ASchema = z.object({ a: z.string() }).strict().optional();`);

    expect(result.messages).toEqual([strictCall]);
    expect(result.fixed).toBe(`${Z}const ASchema = z.strictObject({ a: z.string() }).optional();`);
  });

  test.each([
    ['.strict() with an argument', "const ASchema = z.object({}).strict('no');"],
    ['a comment before .strict()', 'const ASchema = z.object({}) /* why */.strict();'],
  ])('reports %s and rewrites nothing', (_, code) => {
    const result = zod(Z + code);

    expect(result.messages).toEqual([strictCall]);
    expect(result.fixed).toBe(Z + code);
  });

  test('reports a strict call once where objects are strict', () => {
    const result = zod(`${Z}const ASchema = z.object({}).strict();`, { strictPaths: ['src/**'] });

    expect(result.messages).toHaveLength(1);
  });

  test.each([
    ['a plain object outside the strict paths', 'const ASchema = z.object({});'],
    ['a loose object', 'const ASchema = z.looseObject({}); const BSchema = z.object({}).loose();'],
    ['strict() of something else', 'const ASchema = z.string(); other.object({}).strict();'],
    ['passthrough() of something else', 'const a = stream.passthrough();'],
  ])('says nothing on %s', (_, code) => {
    expect(zod(Z + code).messages).toEqual([]);
  });

  test.each([
    ['an object', 'const ASchema = z.object({}).passthrough();'],
    ['a local schema', 'const ASchema = z.object({}); const BSchema = ASchema.passthrough();'],
    [
      'an imported schema',
      "import { BaseSchema } from './base';\nconst BSchema = BaseSchema.passthrough();",
    ],
  ])('reports passthrough() on %s', (_, code) => {
    const result = zod(Z + code);

    expect(result.messages).toEqual([passthrough]);
    expect(result.fixed).toBe(Z + code);
  });

  test.each([
    ['z.coerce', `${Z}const ASchema = z.coerce.number();`],
    ['an imported coerce', "import { coerce } from 'zod';\nconst ASchema = coerce.date();"],
  ])('reports %s in the listed files only', (_, code) => {
    expect(zod(code, { noCoercePaths: ['src/dto/**'] }, '/project/src/dto/a.ts').messages).toEqual([
      coerce,
    ]);
    expect(zod(code, { noCoercePaths: ['src/dto/**'] }).messages).toEqual([]);
  });

  test('says nothing on a coerce that is not zod', () => {
    const code = `${Z}const a = other.coerce.number();`;

    expect(zod(code, { noCoercePaths: ['src/**'] }).messages).toEqual([]);
  });

  test('each check switches off', () => {
    const code = `${Z}const ASchema = z.object({}).strict(); const BSchema = z.object({}).passthrough();`;

    expect(zod(code, { strictCall: false, noPassthrough: false }).messages).toEqual([]);
  });
});

describe('houseConfigs', () => {
  test('carries the zod rule at error', () => {
    const levels = houseConfigs.flatMap((config) => {
      const entry = config.rules?.[ZodSchemaConventionRule.NAME];

      return Array.isArray(entry) ? [entry[0]] : [];
    });

    expect(levels).toEqual(['error']);
  });
});
