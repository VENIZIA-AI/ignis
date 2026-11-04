import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/**
 * `venizia/no-unbraced-case`: the statements of a `case` or `default` sit in one block, `case 'a': { ... }`.
 * It is the ESLint twin of oxlint's `unicorn/switch-case-braces` (`SwitchCaseBracesRule`, mode `always`).
 * Stacked labels with no statements stay as written. The fix wraps the statements in `{ }`.
 */
export class NoUnbracedCaseRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-unbraced-case`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [],
      messages: { unbraced: 'Wrap the statements of this case in a block: `case x: { ... }`.' },
    },
    create: (context) => ({
      [AstNodeTypes.SWITCH_CASE]: (node: Rule.Node) => {
        const statements: unknown = AstNode.readField({ node, key: 'consequent' });

        if (!Array.isArray(statements) || statements.length === 0) {
          return;
        }

        const [first] = statements;
        const last = statements[statements.length - 1];

        if (statements.length === 1 && AstNode.getType({ node: first }) === 'BlockStatement') {
          return;
        }

        context.report({
          node,
          messageId: 'unbraced',
          fix: (fixer) => [fixer.insertTextBefore(first, '{ '), fixer.insertTextAfter(last, ' }')],
        });
      },
    }),
  };

  static build(opts: { severity?: TRuleSeverity } = {}): Linter.RuleEntry {
    const { severity = 'error' } = opts;

    return [severity];
  }
}
