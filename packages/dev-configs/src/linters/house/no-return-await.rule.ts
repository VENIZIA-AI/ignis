import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AwaitSupport } from './await-support';
import { HOUSE_PLUGIN_NAMESPACE, nodeType, readField } from './common';

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const STATEMENT_LISTS = new Set(['BlockStatement', 'Program', 'StaticBlock', 'SwitchCase']);

/** `node` sits inside a `try`, `catch` or `finally` of its own function. */
const isInTry = (node: unknown): boolean => {
  let current = AwaitSupport.parentOf({ node });

  while (current && !FUNCTION_TYPES.has(nodeType({ node: current }) ?? '')) {
    if (nodeType({ node: current }) === 'TryStatement') {
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

      const reportAwait = (opts: { reported: Rule.Node; awaitNode: Rule.Node; statement?: Rule.Node }) => {
        const argument = readField({ node: opts.awaitNode, key: 'argument' });
        const argumentText =
          argument && nodeType({ node: argument }) !== 'SequenceExpression'
            ? sourceCode.getText(argument as Rule.Node)
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
                  if (!STATEMENT_LISTS.has(nodeType({ node: outer }) ?? '')) {
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
        ReturnStatement: (node) => {
          const argument = readField({ node, key: 'argument' });
          if (nodeType({ node: argument }) === 'AwaitExpression') {
            reportAwait({ reported: node, awaitNode: argument as Rule.Node, statement: node });
          }
        },
        ArrowFunctionExpression: (node) => {
          const body = readField({ node, key: 'body' });
          if (nodeType({ node: body }) === 'AwaitExpression') {
            reportAwait({ reported: node, awaitNode: body as Rule.Node });
          }
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
