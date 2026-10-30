import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AwaitSupport } from './await-support';
import { AstNodeTypes, HOUSE_PLUGIN_NAMESPACE, readField } from './common';
import { HookSupport } from './hook-support';

/**
 * `venizia/no-async-hook-callback`. A hook never gets an async function: `useEffect(async () => {})` makes the
 * callback return a promise where React expects a cleanup function or nothing. Pass a sync callback and handle
 * the promise inside it with `.then`, `.catch` and `.finally`. Every argument of a `use[A-Z]...` call is checked,
 * `React.useX` too: an async function as the argument, as the value of a property of an object literal
 * (`useMutation({ mutationFn: async () => {} })`) and as an element of an array literal. A sync callback that
 * builds an async function inside is not an argument and is left alone.
 */
export class NoAsyncHookCallbackRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-async-hook-callback`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        asyncCallback:
          'Do not pass an async function to `{{hook}}`; pass a sync callback and handle the promise inside it with .then/.catch/.finally.',
      },
    },
    create: (context) => ({
      [AstNodeTypes.CALL_EXPRESSION]: (node: Rule.Node) => {
        const hook = HookSupport.calleeName({ call: node });
        if (hook === undefined || !HookSupport.isHook({ name: hook })) {
          return;
        }

        const args = readField({ node, key: 'arguments' });
        if (!Array.isArray(args)) {
          return;
        }

        for (const argument of args) {
          for (const found of HookSupport.asyncFunctionsIn({ node: argument })) {
            if (AwaitSupport.isNode(found)) {
              context.report({ node: found, messageId: 'asyncCallback', data: { hook } });
            }
          }
        }
      },
    }),
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
