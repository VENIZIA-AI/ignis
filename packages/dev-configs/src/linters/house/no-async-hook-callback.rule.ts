import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNodeTypes, HOUSE_PLUGIN_NAMESPACE, readField } from './common';
import { HookSupport } from './hook-support';

/**
 * `venizia/no-async-hook-callback`. A hook never gets an async function: `useEffect(async () => {})` makes the
 * callback return a promise where React expects a cleanup function or nothing. Pass a sync callback and handle
 * the promise inside it with `.then`, `.catch` and `.finally`. Any direct argument of a `use[A-Z]...` call is
 * checked, `React.useX` too; an async function inside an object or array argument is not.
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
          if (HookSupport.isAsync({ node: argument })) {
            context.report({ node: argument, messageId: 'asyncCallback', data: { hook } });
          }
        }
      },
    }),
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
