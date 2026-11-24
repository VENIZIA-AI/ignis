import { dirname } from 'node:path';
import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { FrameworkExports } from './framework-exports';
import { ImportSupport } from './import-support';

/**
 * `venizia/no-shadow-framework-type`. A type alias or interface written in your project under the name a `@venizia/*`
 * package already exports (`ValueOrPromise`, `TNullable`, `TConstValue`) is a copy of the framework's: import it.
 *
 * The names come from the installed packages' `.d.ts` files (see `FrameworkExports`), for the packages your nearest
 * `package.json` depends on. Not reported: a name the file imports, a name shorter than `minLength` (default 4, so a
 * generic `T` never matches), a name in `allow`, anything inside `declare module` or `declare global` (an augmentation),
 * a declaration file, and a package's own declarations of what it exports. There is no fix: a copy may differ from the
 * original, so the replacement is the author's to check.
 */
export class NoShadowFrameworkTypeRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-shadow-framework-type`;

  static readonly DEFAULT_MIN_LENGTH = 4;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'problem',
      schema: [
        {
          type: 'object',
          properties: {
            allow: { type: 'array', items: { type: 'string' } },
            minLength: { type: 'integer', minimum: 1 },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        shadow: '`{{name}}` is exported by {{source}}: import it instead of declaring your own.',
      },
    },
    create: (context) => {
      if (context.filename.endsWith('.d.ts')) {
        return {};
      }

      const options: unknown = context.options[0];
      const allowed = AstNode.readField({ node: options, key: 'allow' });
      const configuredLength = AstNode.readField({ node: options, key: 'minLength' });
      const allow = new Set(Array.isArray(allowed) ? allowed : []);
      const minLength =
        typeof configuredLength === 'number'
          ? configuredLength
          : NoShadowFrameworkTypeRule.DEFAULT_MIN_LENGTH;
      let known: Map<string, string> | undefined;

      return {
        [AstNodeTypes.PROGRAM]: () => {
          for (const statement of context.sourceCode.ast.body) {
            const declaration =
              AstNode.getType({ node: statement }) === AstNodeTypes.EXPORT_NAMED_DECLARATION
                ? AstNode.readField({ node: statement, key: 'declaration' })
                : statement;
            const type = AstNode.getType({ node: declaration });

            if (
              type !== AstNodeTypes.TYPE_ALIAS_DECLARATION &&
              type !== AstNodeTypes.INTERFACE_DECLARATION
            ) {
              continue;
            }

            const identifier = AstNode.readField({ node: declaration, key: 'id' });
            const name = AstNode.readField({ node: identifier, key: 'name' });

            if (typeof name !== 'string' || name.length < minLength || allow.has(name)) {
              continue;
            }

            known ??= FrameworkExports.of({ directory: dirname(context.filename) });
            const source = known.get(name);

            if (source === undefined || ImportSupport.isImported({ context, name })) {
              continue;
            }

            if (AstNode.isNode(identifier)) {
              context.report({ node: identifier, messageId: 'shadow', data: { name, source } });
            }
          }
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity; allow?: Array<string> } = {}): Linter.RuleEntry {
    const { severity = 'error', allow } = opts;

    return allow === undefined ? [severity] : [severity, { allow }];
  }
}
