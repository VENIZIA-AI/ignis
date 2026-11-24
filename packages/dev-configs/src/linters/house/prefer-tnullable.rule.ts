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

  /**
   * The source of a union member with the parentheses that belong to it: a function, constructor or conditional type is
   * written `(...)` inside a union, and the member text alone (`() => void`) would change the type or not parse.
   */
  private static textOf(opts: { context: Rule.RuleContext; member: Rule.Node }): string {
    const { context, member } = opts;
    const { text } = context.sourceCode;
    const [memberStart, memberEnd] = member.range ?? [0, 0];
    let start = memberStart;
    let end = memberEnd;

    for (;;) {
      const before = text.slice(0, start).trimEnd();
      const after = text.slice(end).trimStart();

      if (!before.endsWith('(') || !after.startsWith(')')) {
        return text.slice(start, end);
      }

      start = before.length - 1;
      end = text.length - after.length + 1;
    }
  }

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
        nullable: 'Use TNullable<X> (from {{source}}) for `X | null | undefined`.',
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
          // A local TNullable is not known to mean what the framework's does, so it is never written toward.
          const isLocal = ImportSupport.isDeclared({ context, name: 'TNullable' });
          const texts = rest.map((member) => PreferTNullableRule.textOf({ context, member }));
          const ensure = (fixer: Rule.RuleFixer) =>
            ImportSupport.ensure({
              context,
              fixer,
              name: 'TNullable',
              source: source ?? PreferTNullableRule.DEFAULT_SOURCE,
              isType: true,
            });

          context.report({
            node,
            messageId: 'nullable',
            data: { source: source ?? PreferTNullableRule.DEFAULT_SOURCE },
            fix: (fixer) => {
              if (
                isLocal ||
                (source === undefined && !ImportSupport.isImported({ context, name: 'TNullable' }))
              ) {
                return null;
              }

              const imports = ensure(fixer);

              return imports
                ? [fixer.replaceText(node, `TNullable<${texts.join(' | ')}>`), ...imports]
                : null;
            },
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
