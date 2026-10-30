import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AwaitSupport } from './await-support';
import { AstNodeTypes, HOUSE_PLUGIN_NAMESPACE, nodeType, readField } from './common';

/**
 * `venizia/no-inline-await`. `await` stands alone: as a whole statement (`await f();`) or as the whole initializer
 * of a declaration (`const result = await f();`). Inside any other expression - a call argument, a spread, an
 * array or object, a ternary, a logical operator, a template literal, a member access, an assignment - it is
 * reported, and `return g(await f())` is the same report. `return await f()` is `no-return-await`'s.
 *
 * The fix moves the `await` into a `const` in front of the statement. It is made only when nothing that does more
 * than read a value runs before the `await` inside the statement, and when the `await` is not in a branch, a loop
 * test, an unbraced `if` branch or an arrow expression body; those cases are reported and left alone.
 */
export class NoInlineAwaitRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-inline-await`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [],
      messages: {
        inline:
          '`await` stands alone as a statement or as the whole initializer of a declaration (`const result = await f();`), not inside an expression.',
      },
    },
    create: (context) => {
      const { sourceCode } = context;
      const taken = new Map<unknown, Set<string>>();

      return {
        [AstNodeTypes.AWAIT_EXPRESSION]: (node: Rule.Node) => {
          const parent = AwaitSupport.parentOf({ node });
          const parentType = nodeType({ node: parent });
          const isWhole =
            (parentType === 'ExpressionStatement' &&
              readField({ node: parent, key: 'expression' }) === node) ||
            (parentType === 'VariableDeclarator' &&
              readField({ node: parent, key: 'init' }) === node);
          const isReturned =
            (parentType === 'ReturnStatement' || parentType === 'ArrowFunctionExpression') &&
            (readField({ node: parent, key: 'argument' }) === node ||
              readField({ node: parent, key: 'body' }) === node);

          if (isWhole || isReturned) {
            return;
          }

          const statement = AwaitSupport.hoistTarget({ awaitNode: node });
          const canFix =
            statement !== undefined &&
            !AwaitSupport.hasEffectBefore({ statement, awaitNode: node, sourceCode });

          context.report({
            node,
            messageId: 'inline',
            fix: canFix
              ? (fixer) => {
                  const name = AwaitSupport.freshName({
                    node,
                    base: 'result',
                    sourceCode,
                    taken,
                  });
                  const [start, end] = AwaitSupport.replaceRangeOf({ awaitNode: node, sourceCode });
                  const indent = AwaitSupport.indentOf({ node: statement, sourceCode });

                  return [
                    fixer.insertTextBefore(
                      statement,
                      `const ${name} = ${sourceCode.getText(node)};\n${indent}`,
                    ),
                    fixer.replaceTextRange([start, end], name),
                  ];
                }
              : null,
          });
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
