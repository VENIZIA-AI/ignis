import type { Rule, SourceCode } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AwaitSupport } from './await-support';
import { AstNodeTypes, HOUSE_PLUGIN_NAMESPACE, nodeType, readField } from './common';
import { PromiseChainSupport } from './promise-chain-support';

/** Whether a parameter of `owner` (a function or a catch clause) is read or written anywhere. */
const isParameterUsed = (opts: { owner: Rule.Node; sourceCode: SourceCode }): boolean =>
  opts.sourceCode
    .getDeclaredVariables(opts.owner)
    .some(
      (variable) =>
        variable.defs.some((definition) =>
          ['Parameter', 'CatchClause'].includes(definition.type),
        ) && variable.references.length > 0,
    );

/** A parameter that is not a plain name (`({ message }) =>`, `catch ({ message })`) reads the error by itself. */
const isPlainParameter = (opts: { parameter: unknown }): boolean =>
  opts.parameter === null ||
  opts.parameter === undefined ||
  nodeType({ node: opts.parameter }) === 'Identifier';

/**
 * `venizia/no-silent-catch`. A handled error leaves a trace (V-C-06). Reported: a `.catch(h)` (also `?.catch`,
 * `['catch']`) whose handler is an arrow or function expression that ignores its parameter and whose body is empty
 * or only gives back a constant (`() => null`, `() => undefined`, `() => ({})`, `() => []`, `() => {}`,
 * `function () {}`), and a `catch` block that is empty, holds only a comment, or only assigns or returns a constant
 * without reading the error. Handled, and not reported: anything that reads the error (logs, wraps or rethrows
 * it), makes any call (a log, a cleanup, a fallback), throws, or reads another variable.
 *
 * It is not ESLint's `no-empty`: `no-empty` reports an empty block only, lets a block that holds a comment pass,
 * and never sees `.catch(() => null)`. Both report `catch {}`, each with its own message. There is no fix: what to
 * log is a decision. A deliberate silent catch carries an `eslint-disable-next-line` with its reason.
 */
export class NoSilentCatchRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-silent-catch`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      schema: [],
      messages: {
        silentHandler:
          'This `.catch` handler swallows the error with no trace: log it, rethrow it or wrap it (V-C-06), or keep it with an `eslint-disable-next-line` and the reason.',
        silentBlock:
          'This `catch` block swallows the error with no trace: log it, rethrow it or wrap it (V-C-06), or keep it with an `eslint-disable-next-line` and the reason.',
      },
    },
    create: (context) => {
      const { sourceCode } = context;

      return {
        [AstNodeTypes.CALL_EXPRESSION]: (node: Rule.Node) => {
          if (PromiseChainSupport.chainMethodOf({ node }) !== 'catch') {
            return;
          }

          const args = readField({ node, key: 'arguments' });
          const handler: unknown = Array.isArray(args) ? args[0] : undefined;
          const handlerType = nodeType({ node: handler });
          if (
            !AwaitSupport.isNode(handler) ||
            (handlerType !== 'ArrowFunctionExpression' && handlerType !== 'FunctionExpression')
          ) {
            return;
          }

          const params = readField({ node: handler, key: 'params' });
          if (
            !Array.isArray(params) ||
            !params.every((parameter) => isPlainParameter({ parameter })) ||
            isParameterUsed({ owner: handler, sourceCode })
          ) {
            return;
          }

          const body = readField({ node: handler, key: 'body' });
          const isSilent =
            nodeType({ node: body }) === 'BlockStatement'
              ? PromiseChainSupport.isSilentBlock({
                  statements: readField({ node: body, key: 'body' }),
                })
              : PromiseChainSupport.isConstant({ node: body });

          if (isSilent) {
            context.report({ node: handler, messageId: 'silentHandler' });
          }
        },
        [AstNodeTypes.CATCH_CLAUSE]: (node: Rule.Node) => {
          if (
            !isPlainParameter({ parameter: readField({ node, key: 'param' }) }) ||
            isParameterUsed({ owner: node, sourceCode })
          ) {
            return;
          }

          const body = readField({ node, key: 'body' });
          if (
            PromiseChainSupport.isSilentBlock({
              statements: readField({ node: body, key: 'body' }),
            })
          ) {
            context.report({ node, messageId: 'silentBlock' });
          }
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
