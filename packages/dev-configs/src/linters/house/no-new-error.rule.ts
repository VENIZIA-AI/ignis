import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/**
 * `venizia/no-new-error`. An error is thrown through `getError({ message })` (or an `ApplicationError`),
 * never `new Error(...)` or `Error(...)`: only an ApplicationError carries the status, the message code and
 * args, and the `extra` every IGNIS layer reads.
 */
export class NoNewErrorRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-new-error`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        newError:
          'Throw through getError({ message }) (or an ApplicationError), not `{{form}}`: only an ApplicationError carries the status, code and args.',
      },
    },
    create: (context) => {
      const report = (opts: { node: Rule.Node; form: string }) =>
        context.report({ node: opts.node, messageId: 'newError', data: { form: opts.form } });

      const isErrorIdentifier = (callee: unknown) =>
        AstNode.getType({ node: callee }) === 'Identifier' &&
        AstNode.readField({ node: callee, key: 'name' }) === 'Error';

      return {
        [AstNodeTypes.NEW_EXPRESSION]: (node: Rule.Node) => {
          if (isErrorIdentifier(AstNode.readField({ node, key: 'callee' }))) {
            report({ node, form: 'new Error(...)' });
          }
        },
        [AstNodeTypes.CALL_EXPRESSION]: (node: Rule.Node) => {
          if (isErrorIdentifier(AstNode.readField({ node, key: 'callee' }))) {
            report({ node, form: 'Error(...)' });
          }
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
