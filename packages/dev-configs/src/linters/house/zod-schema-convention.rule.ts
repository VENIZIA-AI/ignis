import { matchesGlob, relative, sep } from 'node:path';
import type { Linter, Rule, Scope } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/** The checks of `@venizia/zod-schema-convention`, as its options take them. */
export interface IZodSchemaConventionOptions {
  /** A const that holds a schema is PascalCase and ends in `Schema`. @default true */
  schemaName?: boolean;
  /** A type inferred from a schema `XSchema` is named `TX` or `XType`. @default true */
  typeName?: boolean;
  /** Globs, from the working directory, of the files where an object schema is `z.strictObject`. @default [] */
  strictPaths?: ReadonlyArray<string>;
  /** Globs, from the working directory, of the files where `z.any()` is refused. @default [] */
  noAnyPaths?: ReadonlyArray<string>;
  /** `z.object({ ... }).strict()` is written `z.strictObject({ ... })`, in every file. @default true */
  strictCall?: boolean;
  /** Refuses `.passthrough()` on a schema. @default true */
  noPassthrough?: boolean;
  /** Globs, from the working directory, of the files where `z.coerce` is refused. @default [] */
  noCoercePaths?: ReadonlyArray<string>;
  /** Skips test files. @default true */
  ignoreTests?: boolean;
  /** Names of consts and types the two name checks leave alone. @default [] */
  ignore?: ReadonlyArray<string>;
}

/**
 * `@venizia/zod-schema-convention`. How a zod schema is named, how its inferred types are named, that a strict object
 * is written `z.strictObject` and `.passthrough()` is not used and, in the files a project lists, that objects are
 * strict and `any` and `z.coerce` are not used.
 *
 * A schema is recognised file by file, without types: a call chain that starts at an import of `zod` (or `z` of
 * `@hono/zod-openapi`), at another schema const of the file, or at an import named `...Schema` / `..._SCHEMA` through a
 * method that builds a schema (`extend`, `pick`, ...). An imported schema under another name, a member
 * (`this.schema.extend`), a factory's result and a schema held in an object are not followed.
 */
export class ZodSchemaConventionRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/zod-schema-convention`;

  private static readonly ZOD_SOURCE = /^zod(?:\/.*)?$/;

  /** Re-exports `z` next to its own functions (`createRoute`), so only its `z` is zod. */
  private static readonly HONO_SOURCE = '@hono/zod-openapi';

  private static readonly SCHEMA_NAME = /^[A-Z][A-Za-z0-9]*Schema$/;

  private static readonly SUFFIX = /_?(?:Schema|SCHEMA)$/;

  /** An import that names a schema: something before the suffix, so a bare `Schema` of another library is not one. */
  private static readonly IMPORTED_SCHEMA = /^.+(?:Schema|_SCHEMA)$/;

  /** zod's classes: `ZodError.create([])` answers a value, not a schema. */
  private static readonly ZOD_CLASS = /^Zod[A-Z]/;

  private static readonly TEST_FILE = /(?:^|[\\/])__tests__[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/;

  /** The methods that make a schema of an imported one; any other call on it may answer a value. */
  private static readonly DERIVATIONS = new Set([
    'array',
    'extend',
    'merge',
    'omit',
    'partial',
    'pick',
    'required',
    'safeExtend',
  ]);

  /** A chain through one of these answers a value, an error report or a part of a schema, not a schema. */
  private static readonly NOT_A_SCHEMA = new Set([
    'parse',
    'parseAsync',
    'safeParse',
    'safeParseAsync',
    'decode',
    'decodeAsync',
    'safeDecode',
    'safeDecodeAsync',
    'encode',
    'encodeAsync',
    'safeEncode',
    'safeEncodeAsync',
    'spa',
    'toJSONSchema',
    'toJsonSchema',
    'prettifyError',
    'treeifyError',
    'flattenError',
    'formatError',
    'registry',
    'globalRegistry',
    'locales',
    'config',
    'isOptional',
    'isNullable',
    'shape',
    'def',
    '_def',
    '_zod',
    'description',
    'options',
    'implement',
    'implementAsync',
    'regexes',
  ]);

  /** The wrappers a type adds around an expression. */
  private static readonly WRAPPERS = new Set<string>([
    AstNodeTypes.AS_EXPRESSION,
    AstNodeTypes.SATISFIES_EXPRESSION,
    AstNodeTypes.NON_NULL_EXPRESSION,
    AstNodeTypes.CHAIN_EXPRESSION,
  ]);

  private static readonly INFERENCES = new Set<unknown>(['infer', 'input', 'output']);

  private static readString(opts: { node: unknown; path: ReadonlyArray<string> }): string {
    const value = opts.path.reduce<unknown>(
      (node, key) => AstNode.readField({ node, key }),
      opts.node,
    );

    return typeof value === 'string' ? value : '';
  }

  /** Whether the member access `node` leaves the schema: its value is not one. */
  private static isOutside(opts: { node: Rule.Node; member: string }): boolean {
    const { node, member } = opts;
    const parent: unknown = AstNode.readField({ node, key: 'parent' });
    const args: unknown = AstNode.readField({ node: parent, key: 'arguments' });
    const isCalled = AstNode.readField({ node: parent, key: 'callee' }) === node;

    if (ZodSchemaConventionRule.NOT_A_SCHEMA.has(member)) {
      return true;
    }

    if (ZodSchemaConventionRule.ZOD_CLASS.test(member)) {
      return true;
    }

    // `z.enum([...])` builds a schema and `.enum` reads its values; `.meta(info)` builds one and `.meta()` reads it.
    if (member === 'enum') {
      return !isCalled;
    }

    return member === 'meta' && Array.isArray(args) && args.length === 0;
  }

  /**
   * The identifier a call chain starts from, the member its first call goes through (`''` when it calls the identifier
   * itself), when it has a call and stays a schema.
   */
  private static chainOf(opts: { expression: unknown }) {
    let node: unknown = opts.expression;
    let hasCall = false;
    let firstCall = '';

    while (AstNode.isNode(node)) {
      const type = AstNode.getType({ node });

      if (type === AstNodeTypes.IDENTIFIER) {
        return hasCall ? { root: node, firstCall } : undefined;
      }

      if (type === AstNodeTypes.CALL_EXPRESSION) {
        const callee = AstNode.readField({ node, key: 'callee' });

        hasCall = true;
        firstCall = ZodSchemaConventionRule.readString({
          node: callee,
          path: ['property', 'name'],
        });
        node = callee;
        continue;
      }

      if (type === AstNodeTypes.MEMBER_EXPRESSION) {
        const member = ZodSchemaConventionRule.readString({ node, path: ['property', 'name'] });

        if (ZodSchemaConventionRule.isOutside({ node, member })) {
          return undefined;
        }

        node = AstNode.readField({ node, key: 'object' });
        continue;
      }

      if (type === undefined || !ZodSchemaConventionRule.WRAPPERS.has(type)) {
        return undefined;
      }

      node = AstNode.readField({ node, key: 'expression' });
    }

    return undefined;
  }

  /** The declaration an identifier resolves to, from the scope it is read in. */
  private static definitionOf(opts: {
    context: Rule.RuleContext;
    node: Rule.Node;
  }): Scope.Definition | undefined {
    const { context, node } = opts;
    const name = ZodSchemaConventionRule.readString({ node, path: ['name'] });
    let scope: Scope.Scope | null = context.sourceCode.getScope(node);

    while (scope) {
      const variable = scope.set.get(name);

      if (variable && variable.defs.length > 0) {
        return variable.defs[0];
      }

      scope = scope.upper;
    }

    return undefined;
  }

  /** The name zod exports what an import binds, when the import is zod's: `''` for a default or a namespace. */
  private static zodImport(opts: { definition: Scope.Definition | undefined }): string | undefined {
    const { definition } = opts;

    if (definition?.type !== 'ImportBinding') {
      return undefined;
    }

    const source = ZodSchemaConventionRule.readString({
      node: definition.parent,
      path: ['source', 'value'],
    });
    const imported = ZodSchemaConventionRule.readString({
      node: definition.node,
      path: ['imported', 'name'],
    });

    if (source === ZodSchemaConventionRule.HONO_SOURCE) {
      return imported === 'z' ? imported : undefined;
    }

    return ZodSchemaConventionRule.ZOD_SOURCE.test(source) &&
      !ZodSchemaConventionRule.NOT_A_SCHEMA.has(imported) &&
      !ZodSchemaConventionRule.ZOD_CLASS.test(imported)
      ? imported
      : undefined;
  }

  /** Whether `expression` builds a schema; `seen` stops a declaration that refers to itself. */
  private static isSchema(opts: {
    context: Rule.RuleContext;
    expression: unknown;
    seen: Set<unknown>;
  }): boolean {
    const { context, expression, seen } = opts;
    const chain = ZodSchemaConventionRule.chainOf({ expression });

    if (chain === undefined || seen.has(expression)) {
      return false;
    }

    seen.add(expression);

    const definition = ZodSchemaConventionRule.definitionOf({ context, node: chain.root });

    if (ZodSchemaConventionRule.zodImport({ definition }) !== undefined) {
      return true;
    }

    if (definition?.type === 'ImportBinding') {
      const name = ZodSchemaConventionRule.readString({ node: chain.root, path: ['name'] });

      // The derivation is the first call: what a call before it answers is not followed.
      return (
        ZodSchemaConventionRule.IMPORTED_SCHEMA.test(name) &&
        ZodSchemaConventionRule.DERIVATIONS.has(chain.firstCall)
      );
    }

    return (
      definition?.type === 'Variable' &&
      ZodSchemaConventionRule.isSchema({
        context,
        expression: AstNode.readField({ node: definition.node, key: 'init' }),
        seen,
      })
    );
  }

  /** `saleOrder`, `SALE_ORDER` and `SaleOrder` are all `SaleOrder`. */
  private static toPascalCase(opts: { name: string }): string {
    const isUpper = /^[A-Z0-9_$]+$/.test(opts.name);

    return opts.name
      .split(/[_$]+/)
      .map((word) => (isUpper ? word.toLowerCase() : word))
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /** The name of the schema a type alias infers from, and by which inference; `undefined` for any other type. */
  private static inferenceOf(opts: { context: Rule.RuleContext; node: Rule.Node }) {
    const { context, node } = opts;
    const annotation = AstNode.readField({ node, key: 'typeAnnotation' });
    const typeName = AstNode.readField({ node: annotation, key: 'typeName' });
    const left = AstNode.readField({ node: typeName, key: 'left' });
    const kind = ZodSchemaConventionRule.readString({ node: typeName, path: ['right', 'name'] });
    const args = AstNode.readField({
      node: AstNode.readField({ node: annotation, key: 'typeArguments' }),
      key: 'params',
    });
    const query = Array.isArray(args) ? args[0] : undefined;

    if (
      !AstNode.isNode(left) ||
      !ZodSchemaConventionRule.INFERENCES.has(kind) ||
      AstNode.getType({ node: query }) !== AstNodeTypes.TYPE_QUERY
    ) {
      return undefined;
    }

    const definition = ZodSchemaConventionRule.definitionOf({ context, node: left });
    const target = AstNode.readField({ node: query, key: 'exprName' });
    const schema =
      ZodSchemaConventionRule.readString({ node: target, path: ['name'] }) ||
      ZodSchemaConventionRule.readString({ node: target, path: ['right', 'name'] });

    return ZodSchemaConventionRule.zodImport({ definition }) === undefined || schema === ''
      ? undefined
      : { schema, kind };
  }

  private static matches(opts: { context: Rule.RuleContext; globs: unknown }): boolean {
    const { context, globs } = opts;
    const path = relative(context.cwd, context.filename).split(sep).join('/');

    return (
      Array.isArray(globs) &&
      globs.some((glob) => typeof glob === 'string' && matchesGlob(path, glob))
    );
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [
        {
          type: 'object',
          properties: {
            schemaName: { type: 'boolean' },
            typeName: { type: 'boolean' },
            strictPaths: { type: 'array', items: { type: 'string' } },
            noAnyPaths: { type: 'array', items: { type: 'string' } },
            strictCall: { type: 'boolean' },
            noPassthrough: { type: 'boolean' },
            noCoercePaths: { type: 'array', items: { type: 'string' } },
            ignoreTests: { type: 'boolean' },
            ignore: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        schemaName:
          'A const that holds a zod schema is PascalCase and ends in `Schema`: `{{name}} → {{expected}}`.',
        typeName:
          'A type inferred from `{{schema}}` is named `{{expected}}` or `{{other}}`, not `{{name}}`.',
        strict: 'An object schema here is strict: `z.strictObject({ ... })`.',
        any: '`z.any()` accepts everything: describe the value, or use `z.unknown()` and narrow it.',
        strictCall:
          '`z.object(...).strict()` is `z.strictObject(...)`: write the strict object directly.',
        passthrough:
          '`.passthrough()` is deprecated: write `z.looseObject({ ... })`, or `.loose()` on a schema you did not declare here.',
        coerce:
          '`z.coerce` accepts what it can convert, `"abc"` as `NaN` included: declare both sides with `z.codec`.',
      },
    },
    create: (context) => {
      const options: unknown = context.options[0];
      const read = (key: string) => AstNode.readField({ node: options, key });

      if (
        read('ignoreTests') !== false &&
        ZodSchemaConventionRule.TEST_FILE.test(context.filename)
      ) {
        return {};
      }

      const configured = read('ignore');
      const ignored = new Set<unknown>(Array.isArray(configured) ? configured : []);
      const isStrict = ZodSchemaConventionRule.matches({ context, globs: read('strictPaths') });
      const isNoAny = ZodSchemaConventionRule.matches({ context, globs: read('noAnyPaths') });
      const isNoCoerce = ZodSchemaConventionRule.matches({ context, globs: read('noCoercePaths') });
      const isStrictCallChecked = read('strictCall') !== false;
      const isPassthroughChecked = read('noPassthrough') !== false;

      const checkName = (node: Rule.Node) => {
        const parent: unknown = AstNode.readField({ node, key: 'parent' });
        const id = AstNode.readField({ node, key: 'id' });
        const name = ZodSchemaConventionRule.readString({ node: id, path: ['name'] });

        if (
          AstNode.readField({ node: parent, key: 'kind' }) !== 'const' ||
          name === '' ||
          ignored.has(name) ||
          ZodSchemaConventionRule.SCHEMA_NAME.test(name) ||
          !ZodSchemaConventionRule.isSchema({
            context,
            expression: AstNode.readField({ node, key: 'init' }),
            seen: new Set(),
          })
        ) {
          return;
        }

        const base = ZodSchemaConventionRule.toPascalCase({
          name: name.replace(/_?(?:schema|Schema|SCHEMA)$/, ''),
        });

        context.report({
          node: AstNode.isNode(id) ? id : node,
          messageId: 'schemaName',
          data: { name, expected: `${base || '<What>'}Schema` },
        });
      };

      const checkType = (node: Rule.Node) => {
        const name = ZodSchemaConventionRule.readString({ node, path: ['id', 'name'] });
        const inference = ZodSchemaConventionRule.inferenceOf({ context, node });

        if (inference === undefined || ignored.has(name)) {
          return;
        }

        const base = ZodSchemaConventionRule.toPascalCase({
          name: inference.schema.replace(ZodSchemaConventionRule.SUFFIX, ''),
        });
        // A schema with two types names each by the side it describes.
        const side = inference.kind === 'input' ? 'Input' : 'Output';
        const allowed = [`T${base}`, `${base}Type`, `T${base}${side}`, `${base}${side}Type`];

        if (base !== '' && !allowed.includes(name)) {
          context.report({
            node,
            messageId: 'typeName',
            data: { name, schema: inference.schema, expected: `T${base}`, other: `${base}Type` },
          });
        }
      };

      /** Whether the identifier `node` is zod's `name`, as an import binds it. */
      const isZodImport = (opts: { node: unknown; name?: string }) => {
        const { node, name } = opts;

        if (!AstNode.isNode(node) || AstNode.getType({ node }) !== AstNodeTypes.IDENTIFIER) {
          return false;
        }

        const definition = ZodSchemaConventionRule.definitionOf({ context, node });
        const imported = ZodSchemaConventionRule.zodImport({ definition });

        return name === undefined ? imported !== undefined : imported === name;
      };

      /** Whether `target` is a schema: a chain that builds one, a const that holds one, or an import named as one. */
      const isSchemaTarget = (target: unknown) => {
        if (
          !AstNode.isNode(target) ||
          AstNode.getType({ node: target }) !== AstNodeTypes.IDENTIFIER
        ) {
          return ZodSchemaConventionRule.isSchema({ context, expression: target, seen: new Set() });
        }

        const definition = ZodSchemaConventionRule.definitionOf({ context, node: target });
        const name = ZodSchemaConventionRule.readString({ node: target, path: ['name'] });

        if (definition?.type === 'ImportBinding') {
          return ZodSchemaConventionRule.IMPORTED_SCHEMA.test(name);
        }

        return (
          definition?.type === 'Variable' &&
          ZodSchemaConventionRule.isSchema({
            context,
            expression: AstNode.readField({ node: definition.node, key: 'init' }),
            seen: new Set(),
          })
        );
      };

      /** `z.coerce.number()`, or `coerce.number()` where `coerce` is imported from zod. */
      const checkCoerce = (opts: { node: Rule.Node; target: unknown }) => {
        const { node, target } = opts;
        const owner = AstNode.readField({ node: target, key: 'object' });
        const member = ZodSchemaConventionRule.readString({
          node: target,
          path: ['property', 'name'],
        });

        if (
          isZodImport({ node: target, name: 'coerce' }) ||
          (member === 'coerce' && isZodImport({ node: owner }))
        ) {
          context.report({ node, messageId: 'coerce' });
        }
      };

      /** `.strict()` called on `node`, with its fix when the call says no more than `z.strictObject`. */
      const strictCallOf = (opts: { node: Rule.Node; property: unknown }) => {
        const { node, property } = opts;
        const member: unknown = AstNode.readField({ node, key: 'parent' });
        const outer: unknown = AstNode.readField({ node: member, key: 'parent' });
        const args: unknown = AstNode.readField({ node: outer, key: 'arguments' });
        const isCalled =
          ZodSchemaConventionRule.readString({ node: member, path: ['property', 'name'] }) ===
            'strict' && AstNode.readField({ node: outer, key: 'callee' }) === member;

        if (!isCalled) {
          return undefined;
        }

        // `z.object(x).strict()` says the same as `z.strictObject(x)`; with an argument it says more.
        if (
          !Array.isArray(args) ||
          args.length > 0 ||
          !AstNode.isNode(property) ||
          !AstNode.isNode(outer)
        ) {
          return { fix: null };
        }

        const fix: Rule.ReportFixer = (fixer) => {
          const end = context.sourceCode.getRange(node)[1];
          const tail: [number, number] = [end, context.sourceCode.getRange(outer)[1]];
          const hasComment = context.sourceCode
            .getAllComments()
            .some(
              (comment) =>
                (comment.range?.[0] ?? 0) >= tail[0] && (comment.range?.[1] ?? 0) <= tail[1],
            );

          return hasComment
            ? null
            : [fixer.replaceText(property, 'strictObject'), fixer.removeRange(tail)];
        };

        return { fix };
      };

      const checkCall = (node: Rule.Node) => {
        const callee = AstNode.readField({ node, key: 'callee' });
        const isMember = AstNode.getType({ node: callee }) === AstNodeTypes.MEMBER_EXPRESSION;
        const root = isMember ? AstNode.readField({ node: callee, key: 'object' }) : callee;
        const property = AstNode.readField({ node: callee, key: 'property' });
        const method = ZodSchemaConventionRule.readString({ node: property, path: ['name'] });

        if (isPassthroughChecked && isMember && method === 'passthrough') {
          if (isSchemaTarget(root)) {
            context.report({ node, messageId: 'passthrough' });
          }
        }

        if (isNoCoerce && isMember) {
          checkCoerce({ node, target: root });
        }

        if (!AstNode.isNode(root) || AstNode.getType({ node: root }) !== AstNodeTypes.IDENTIFIER) {
          return;
        }

        const definition = ZodSchemaConventionRule.definitionOf({ context, node: root });
        const imported = ZodSchemaConventionRule.zodImport({ definition });

        if (imported === undefined) {
          return;
        }

        const called = isMember ? method : imported;

        if (isNoAny && called === 'any') {
          context.report({ node, messageId: 'any' });
        }

        if (called !== 'object') {
          return;
        }

        const strictCall = strictCallOf({ node, property: isMember ? property : undefined });

        if (isStrict) {
          context.report({ node, messageId: 'strict', fix: strictCall?.fix ?? null });

          return;
        }

        if (isStrictCallChecked && strictCall) {
          context.report({ node, messageId: 'strictCall', fix: strictCall.fix });
        }
      };

      return {
        ...(read('schemaName') !== false && {
          [AstNodeTypes.VARIABLE_DECLARATOR]: checkName,
        }),
        ...(read('typeName') !== false && { [AstNodeTypes.TYPE_ALIAS_DECLARATION]: checkType }),
        ...((isStrict || isNoAny || isNoCoerce || isStrictCallChecked || isPassthroughChecked) && {
          [AstNodeTypes.CALL_EXPRESSION]: checkCall,
        }),
      };
    },
  };

  static build(
    opts: IZodSchemaConventionOptions & { severity?: TRuleSeverity } = {},
  ): Linter.RuleEntry {
    const {
      severity = 'error',
      schemaName = true,
      typeName = true,
      strictPaths = [],
      noAnyPaths = [],
      strictCall = true,
      noPassthrough = true,
      noCoercePaths = [],
      ignoreTests = true,
      ignore = [],
    } = opts;

    return [
      severity,
      {
        schemaName,
        typeName,
        strictPaths: [...strictPaths],
        noAnyPaths: [...noAnyPaths],
        strictCall,
        noPassthrough,
        noCoercePaths: [...noCoercePaths],
        ignoreTests,
        ignore: [...ignore],
      },
    ];
  }
}
