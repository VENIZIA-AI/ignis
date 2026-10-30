import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AwaitSupport } from './await-support';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const STATEMENT_LISTS = new Set(['BlockStatement', 'Program', 'StaticBlock', 'SwitchCase']);

/** `node` sits inside a `try`, `catch` or `finally` of its own function. */
const isInTry = (node: unknown): boolean => {
  let current = AwaitSupport.parentOf({ node });

  while (current && !FUNCTION_TYPES.has(AstNode.getType({ node: current }) ?? '')) {
    if (AstNode.getType({ node: current }) === 'TryStatement') {
      return true;
    }
    current = AwaitSupport.parentOf({ node: current });
  }

  return false;
};

/**
 * `venizia/no-return-await`. A function returns the promise (`return f()`), never `return await f()`. Where the
 * `await` matters (inside `try`, `catch` or `finally`) it is written on its own line:
 * `const result = await f(); return result;`. An arrow whose body is an `await` is the same: `() => f()`.
 */
export class NoReturnAwaitRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-return-await`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [],
      messages: {
        returnAwait:
          'Return the promise (`return f()`), not `return await f()`; where the await matters (inside try, catch or finally) write `const result = await f(); return result;`.',
      },
    },
    create: (context) => {
      const { sourceCode } = context;
      const taken = new Map<unknown, Set<string>>();

      const reportAwait = (opts: {
        reported: Rule.Node;
        awaitNode: Rule.Node;
        statement?: Rule.Node;
      }) => {
        const argument = AstNode.readField({ node: opts.awaitNode, key: 'argument' });
        const argumentText =
          AwaitSupport.isNode(argument) &&
          AstNode.getType({ node: argument }) !== 'SequenceExpression'
            ? sourceCode.getText(argument)
            : undefined;

        context.report({
          node: opts.reported,
          messageId: 'returnAwait',
          fix:
            argumentText === undefined
              ? null
              : (fixer) => {
                  if (!opts.statement || !isInTry(opts.statement)) {
                    return fixer.replaceText(opts.awaitNode, argumentText);
                  }

                  const outer = AwaitSupport.parentOf({ node: opts.statement });
                  if (!STATEMENT_LISTS.has(AstNode.getType({ node: outer }) ?? '')) {
                    return null;
                  }

                  const name = AwaitSupport.freshName({
                    node: opts.statement,
                    base: 'result',
                    sourceCode,
                    taken,
                  });
                  const indent = AwaitSupport.indentOf({ node: opts.statement, sourceCode });

                  return fixer.replaceText(
                    opts.statement,
                    `const ${name} = await ${argumentText};\n${indent}return ${name};`,
                  );
                },
        });
      };

      return {
        [AstNodeTypes.RETURN_STATEMENT]: (node: Rule.Node) => {
          const argument = AstNode.readField({ node, key: 'argument' });
          if (
            AwaitSupport.isNode(argument) &&
            AstNode.getType({ node: argument }) === 'AwaitExpression'
          ) {
            reportAwait({ reported: node, awaitNode: argument, statement: node });
          }
        },
        [AstNodeTypes.ARROW_FUNCTION_EXPRESSION]: (node: Rule.Node) => {
          const body = AstNode.readField({ node, key: 'body' });
          if (AwaitSupport.isNode(body) && AstNode.getType({ node: body }) === 'AwaitExpression') {
            reportAwait({ reported: node, awaitNode: body });
          }
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
