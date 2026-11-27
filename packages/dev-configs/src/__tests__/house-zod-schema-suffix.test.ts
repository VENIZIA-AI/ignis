import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import { houseEslintPlugin, ZodSchemaSuffixRule } from '../linters/house';

/** The messages of the rule on `code`, under the options `build` gives. */
const findings = (
  code: string,
  opts: { filename?: string; ignore?: string[]; ignoreTests?: boolean } = {},
) => {
  const { filename = 'src/subject.js', ...options } = opts;

  return new Linter()
    .verify(
      code,
      [
        {
          plugins: { '@venizia': houseEslintPlugin },
          rules: { [ZodSchemaSuffixRule.NAME]: ZodSchemaSuffixRule.build(options) },
        },
      ],
      { filename },
    )
    .map((message) => message.message);
};

describe('@venizia/zod-schema-suffix', () => {
  const reported: Array<[string, string]> = [
    ['a named z', "import { z } from 'zod';\nexport const User = z.object({});"],
    ['a strict object', "import { z } from 'zod';\nconst User = z.strictObject({});"],
    ['a chained call', "import { z } from 'zod';\nconst User = z.string().min(1);"],
    ['an extended object', "import { z } from 'zod';\nconst User = z.object({}).extend({});"],
    ['a member before the call', "import { z } from 'zod';\nconst User = z.coerce.number();"],
    ['a namespace import', "import * as zod from 'zod';\nconst User = zod.object({});"],
    ['a default import', "import z from 'zod';\nconst User = z.object({});"],
    ['an alias', "import { z as schema } from 'zod';\nconst User = schema.object({});"],
    ['zod/v4', "import { z } from 'zod/v4';\nconst User = z.object({});"],
    ['zod/mini', "import * as z from 'zod/mini';\nconst User = z.object({});"],
    ['a direct constructor import', "import { object } from 'zod/mini';\nconst User = object({});"],
    ['z of hono', "import { z } from '@hono/zod-openapi';\nconst User = z.object({});"],
    [
      'an alias of z of hono',
      "import { z as zod } from '@hono/zod-openapi';\nconst User = zod.object({}).openapi({});",
    ],
    [
      'a local const',
      "import { z } from 'zod';\nfunction build() { const User = z.object({}); return User; }",
    ],
  ];

  for (const [name, code] of reported) {
    test(`reports ${name}`, () => {
      expect(findings(code)).toEqual([
        'A const that holds a zod schema ends in `Schema`: `User → UserSchema`.',
      ]);
    });
  }

  const upper: Array<[string, string]> = [
    ['USER', 'USER_SCHEMA'],
    ['ID', 'ID_SCHEMA'],
    ['USERSCHEMA', 'USERSCHEMA_SCHEMA'],
  ];

  for (const [name, suggested] of upper) {
    test(`asks for _SCHEMA on ${name}`, () => {
      expect(findings(`import { z } from 'zod';\nconst ${name} = z.string();`)).toEqual([
        `A const that holds a zod schema ends in \`_SCHEMA\`: \`${name} → ${suggested}\`.`,
      ]);
    });
  }

  test('accepts each form of the suffix and the bare names', () => {
    for (const name of ['USER_SCHEMA', 'SCHEMA', 'schema', 'userSchema']) {
      expect(findings(`import { z } from 'zod';\nconst ${name} = z.string();`)).toEqual([]);
    }
  });

  const silent: Array<[string, string]> = [
    ['the suffix', "import { z } from 'zod';\nconst UserSchema = z.object({});"],
    ['another z', "import { z } from './local';\nconst User = z.object({});"],
    ['a z with no import', 'const z = { object: () => 1 };\nconst User = z.object({});'],
    [
      'a shadowed z',
      "import { z } from 'zod';\nfunction f(z) { const User = z.object({}); return User; }",
    ],
    ['a parsed value', "import { z } from 'zod';\nconst user = z.string().parse('a');"],
    ['a safe parse', "import { z } from 'zod';\nconst result = z.object({}).safeParse({});"],
    ['an error report', "import { z } from 'zod';\nconst text = z.prettifyError(error);"],
    ['a JSON Schema', "import { z } from 'zod';\nconst json = z.toJSONSchema(UserSchema);"],
    ['a part of a schema', "import { z } from 'zod';\nconst shape = z.object({}).shape;"],
    ['an access with no call', "import { z } from 'zod';\nconst code = z.ZodIssueCode.custom;"],
    [
      'a chain from another schema',
      "import { z } from 'zod';\nconst User = BaseSchema.extend({});",
    ],
    [
      'a route of hono',
      "import { createRoute } from '@hono/zod-openapi';\nconst route = createRoute({});",
    ],
    [
      'an imported converter',
      "import { toJSONSchema } from 'zod';\nconst json = toJSONSchema(UserSchema);",
    ],
    ['a let', "import { z } from 'zod';\nlet User = z.object({});"],
    ['a destructuring', "import { z } from 'zod';\nconst { shape } = z.object({});"],
  ];

  for (const [name, code] of silent) {
    test(`says nothing on ${name}`, () => {
      expect(findings(code)).toEqual([]);
    });
  }

  const subject = "import { z } from 'zod';\nconst User = z.object({});";

  test('skips tests unless told otherwise', () => {
    for (const filename of ['src/__tests__/a.js', 'src/a.test.js', 'src/a.spec.js']) {
      expect(findings(subject, { filename })).toEqual([]);
      expect(findings(subject, { filename, ignoreTests: false })).toHaveLength(1);
    }
  });

  test('skips a name on the ignore list', () => {
    expect(findings(subject, { ignore: ['User'] })).toEqual([]);
  });
});
