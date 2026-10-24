import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { HOUSE_PLUGIN_NAMESPACE } from './common';

/** `&&` directly under a JSX child: `disabled={a && b}` is a value, not something drawn. */
const LEAKED_RENDER_SELECTOR = ['JSXElement', 'JSXFragment']
  .map((parent) => `${parent} > JSXExpressionContainer > LogicalExpression[operator='&&']`)
  .join(', ');

/**
 * `venizia/no-leaked-render`. `{count && <X />}` draws `0` when `count` is `0`; draw nothing with
 * `cond ? <X /> : null`. Only a child of JSX is checked. The fix rewrites it to the ternary and keeps
 * any comment between `&&` and the drawn part.
 */
export class NoLeakedRenderRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-leaked-render`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: {
        leaked: 'Draw nothing with `cond ? <X /> : null`; `&&` draws 0 when cond is 0.',
      },
    },
    create: (context) => ({
      [LEAKED_RENDER_SELECTOR]: (node: Rule.Node) => {
        if (node.type !== 'LogicalExpression') {
          return;
        }

        const source = context.sourceCode;
        const operator = source.getTokenAfter(node.left, (token) => token.value === '&&');
        if (!operator) {
          return;
        }

        const drawn = source.text.slice(operator.range[1], node.range?.[1]).trim();
        context.report({
          node,
          messageId: 'leaked',
          fix: (fixer) => fixer.replaceText(node, `${source.getText(node.left)} ? ${drawn} : null`),
        });
      },
    }),
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
