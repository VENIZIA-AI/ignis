import type { Linter, Rule, Scope } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/**
 * `@venizia/zod-schema-suffix`. A `const` that holds a schema built from `zod` ends in `Schema`, or in `_SCHEMA` when
 * the name is upper-case, so the value and the type inferred from it do not share a name. The schema is recognised by
 * what it starts from: a call chain whose first identifier is bound by an import of `zod` (or one of its sub-paths),
 * or of `z` from `@hono/zod-openapi`, whatever that binding is called. A chain that starts from another schema
 * (`BaseSchema.extend(...)`) is not followed.
 */
export class ZodSchemaSuffixRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/zod-schema-suffix`;

  static readonly SUFFIX = 'Schema';

  static readonly UPPER_SUFFIX = '_SCHEMA';

  private static readonly UPPER_NAME = /^[A-Z0-9_$]+$/;

  private static readonly ZOD_SOURCE = /^zod(?:\/.*)?$/;

  /** Re-exports `z` next to its own functions (`createRoute`), so only its `z` is zod. */
  private static readonly HONO_SOURCE = '@hono/zod-openapi';

  private static readonly TEST_FILE = /(?:^|[\\/])__tests__[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/;

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
  ]);

  /** The wrappers a type adds around an expression. */
  private static readonly WRAPPERS = new Set<string>([
    AstNodeTypes.AS_EXPRESSION,
    AstNodeTypes.SATISFIES_EXPRESSION,
    AstNodeTypes.NON_NULL_EXPRESSION,
    AstNodeTypes.CHAIN_EXPRESSION,
  ]);

  /** The identifier a call chain starts from, when it has a call and reads nothing that leaves the schema. */
  private static rootOf(opts: { expression: unknown }): Rule.Node | undefined {
    let node: unknown = opts.expression;
    let hasCall = false;

    while (AstNode.isNode(node)) {
      const type = AstNode.getType({ node });

      if (type === AstNodeTypes.IDENTIFIER) {
        return hasCall ? node : undefined;
      }

      if (type === AstNodeTypes.CALL_EXPRESSION) {
        hasCall = true;
        node = AstNode.readField({ node, key: 'callee' });
        continue;
      }

      if (type === AstNodeTypes.MEMBER_EXPRESSION) {
        const property = AstNode.readField({
          node: AstNode.readField({ node, key: 'property' }),
          key: 'name',
        });

        if (typeof property === 'string' && ZodSchemaSuffixRule.NOT_A_SCHEMA.has(property)) {
          return undefined;
        }

        node = AstNode.readField({ node, key: 'object' });
        continue;
      }

      if (type === undefined || !ZodSchemaSuffixRule.WRAPPERS.has(type)) {
        return undefined;
      }

      node = AstNode.readField({ node, key: 'expression' });
    }

    return undefined;
  }

  /** Whether the binding an import declares is zod: anything of `zod` that can build a schema, or hono's `z`. */
  private static isZodBinding(opts: { definition: Scope.Definition }): boolean {
    const { definition } = opts;
    const source = AstNode.readField({
      node: AstNode.readField({ node: definition.parent, key: 'source' }),
      key: 'value',
    });
    const imported = AstNode.readField({
      node: AstNode.readField({ node: definition.node, key: 'imported' }),
      key: 'name',
    });

    if (source === ZodSchemaSuffixRule.HONO_SOURCE) {
      return imported === 'z';
    }

    return (
      ZodSchemaSuffixRule.ZOD_SOURCE.test(String(source)) &&
      !(typeof imported === 'string' && ZodSchemaSuffixRule.NOT_A_SCHEMA.has(imported))
    );
  }

  /** Whether the identifier resolves to a value import of zod. */
  private static isZodImport(opts: { context: Rule.RuleContext; node: Rule.Node }): boolean {
    const { context, node } = opts;
    const name = AstNode.readField({ node, key: 'name' });

    if (typeof name !== 'string') {
      return false;
    }

    let scope: Scope.Scope | null = context.sourceCode.getScope(node);

    while (scope) {
      const variable = scope.set.get(name);

      if (variable && variable.defs.length > 0) {
        return variable.defs.some(
          (definition) =>
            definition.type === 'ImportBinding' && ZodSchemaSuffixRule.isZodBinding({ definition }),
        );
      }

      scope = scope.upper;
    }

    return false;
  }

  /** The name the const should have, or `undefined` when its name is already one. */
  private static suggest(opts: { name: string }): string | undefined {
    const { name } = opts;
    const { SUFFIX, UPPER_SUFFIX } = ZodSchemaSuffixRule;

    if (ZodSchemaSuffixRule.UPPER_NAME.test(name)) {
      return name.endsWith(UPPER_SUFFIX) || name === 'SCHEMA'
        ? undefined
        : `${name}${UPPER_SUFFIX}`;
    }

    return name.endsWith(SUFFIX) || name === 'schema' ? undefined : `${name}${SUFFIX}`;
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      schema: [
        {
          type: 'object',
          properties: {
            ignoreTests: { type: 'boolean' },
            ignore: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        suffix: 'A const that holds a zod schema ends in `{{suffix}}`: `{{name}} → {{suggested}}`.',
      },
    },
    create: (context) => {
      const options: unknown = context.options[0];
      const configured: unknown = AstNode.readField({ node: options, key: 'ignore' });
      const ignored = new Set<unknown>(Array.isArray(configured) ? configured : []);

      if (
        AstNode.readField({ node: options, key: 'ignoreTests' }) !== false &&
        ZodSchemaSuffixRule.TEST_FILE.test(context.filename)
      ) {
        return {};
      }

      return {
        [AstNodeTypes.VARIABLE_DECLARATOR]: (node: Rule.Node) => {
          const parent: unknown = AstNode.readField({ node, key: 'parent' });
          const id = AstNode.readField({ node, key: 'id' });
          const name = AstNode.readField({ node: id, key: 'name' });

          if (
            AstNode.readField({ node: parent, key: 'kind' }) !== 'const' ||
            typeof name !== 'string' ||
            ignored.has(name)
          ) {
            return;
          }

          const suggested = ZodSchemaSuffixRule.suggest({ name });

          if (suggested === undefined) {
            return;
          }

          const root = ZodSchemaSuffixRule.rootOf({
            expression: AstNode.readField({ node, key: 'init' }),
          });

          if (root === undefined || !ZodSchemaSuffixRule.isZodImport({ context, node: root })) {
            return;
          }

          context.report({
            node: AstNode.isNode(id) ? id : node,
            messageId: 'suffix',
            data: {
              name,
              suggested,
              suffix: suggested.endsWith(ZodSchemaSuffixRule.UPPER_SUFFIX)
                ? ZodSchemaSuffixRule.UPPER_SUFFIX
                : ZodSchemaSuffixRule.SUFFIX,
            },
          });
        },
      };
    },
  };

  static build(
    opts: { severity?: TRuleSeverity; ignoreTests?: boolean; ignore?: string[] } = {},
  ): Linter.RuleEntry {
    const { severity = 'error', ignoreTests = true, ignore = [] } = opts;

    return [severity, { ignoreTests, ignore }];
  }
}
