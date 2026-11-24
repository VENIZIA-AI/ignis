import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { ImportSupport } from './import-support';

/**
 * `venizia/prefer-tnullable`. `X | null | undefined` is `TNullable<X>`, the framework's own name for it
 * (`@venizia/ignis-helpers/common`). A union with only `null` or only `undefined` is not reported: those say
 * something different.
 *
 * The fix rewrites the union and adds the import. `source` is where `TNullable` comes from (default the helpers
 * `common` entry); `null` turns the import, and so the fix, off for a project that has no such package.
 */
export class PreferTNullableRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/prefer-tnullable`;

  static readonly DEFAULT_SOURCE = '@venizia/ignis-helpers/common';

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [
        {
          type: 'object',
          properties: { source: { type: ['string', 'null'] } },
          additionalProperties: false,
        },
      ],
      messages: {
        nullable:
          'Use TNullable<X> (from @venizia/ignis-helpers/common) for `X | null | undefined`.',
      },
    },
    create: (context) => {
      const options: unknown = context.options[0];
      const configured = AstNode.readField({ node: options, key: 'source' });
      const source =
        configured === null
          ? undefined
          : typeof configured === 'string'
            ? configured
            : PreferTNullableRule.DEFAULT_SOURCE;

      return {
        [AstNodeTypes.UNION_TYPE]: (node: Rule.Node) => {
          const members: unknown = AstNode.readField({ node, key: 'types' });

          if (!Array.isArray(members) || members.length < 3) {
            return;
          }

          const typeOf = (member: unknown) => AstNode.getType({ node: member });
          const nulls = members.filter((member) => typeOf(member) === AstNodeTypes.NULL_KEYWORD);
          const undefineds = members.filter(
            (member) => typeOf(member) === AstNodeTypes.UNDEFINED_KEYWORD,
          );

          if (nulls.length !== 1 || undefineds.length !== 1) {
            return;
          }

          // The definition of `TNullable` itself says exactly this.
          const parent: unknown = AstNode.readField({ node, key: 'parent' });
          const parentName = AstNode.readField({
            node: AstNode.readField({ node: parent, key: 'id' }),
            key: 'name',
          });

          if (
            AstNode.getType({ node: parent }) === AstNodeTypes.TYPE_ALIAS_DECLARATION &&
            parentName === 'TNullable'
          ) {
            return;
          }

          const rest = members.filter(
            (member) =>
              typeOf(member) !== AstNodeTypes.NULL_KEYWORD &&
              typeOf(member) !== AstNodeTypes.UNDEFINED_KEYWORD,
          );
          const canFix =
            source !== undefined || ImportSupport.isInScope({ context, name: 'TNullable' });

          context.report({
            node,
            messageId: 'nullable',
            fix: canFix
              ? (fixer) => [
                  fixer.replaceText(
                    node,
                    `TNullable<${rest.map((member) => context.sourceCode.getText(member)).join(' | ')}>`,
                  ),
                  ...ImportSupport.ensure({
                    context,
                    fixer,
                    name: 'TNullable',
                    source: source ?? PreferTNullableRule.DEFAULT_SOURCE,
                    isType: true,
                  }),
                ]
              : null,
          });
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity; source?: string | null } = {}): Linter.RuleEntry {
    const { severity = 'error', source } = opts;

    return source === undefined ? [severity] : [severity, { source }];
  }
}
