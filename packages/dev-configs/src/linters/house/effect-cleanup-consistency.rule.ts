import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { HookSupport } from './hook-support';

/** What the rule knows about the function whose code path is open; one per function, so a nested function is its own. */
interface IFunctionFrame {
  upper: IFunctionFrame | undefined;
  hook: string | undefined;
  returnsValue: boolean;
  returnsNothing: boolean;
  segments: Set<{ reachable: boolean }>;
}

/**
 * `venizia/effect-cleanup-consistency`. The callback of `useEffect`, `useLayoutEffect` and `useInsertionEffect`
 * returns a cleanup on every path or on none. An early `return;` beside a later `return () => {}` leaves React
 * with a cleanup on some runs only; the early exit returns a no-op instead. A bare `return;` and falling off the
 * end both mean "no value". It uses ESLint's code path analysis the way `consistent-return` does, so an
 * unreachable end of the function is not a path. A nested function's own `return` is not counted.
 */
export class EffectCleanupConsistencyRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/effect-cleanup-consistency`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        inconsistent:
          'The callback of `{{hook}}` returns a cleanup on some paths only; return one on every path (a no-op `() => {}` for an early exit) or on none.',
      },
    },
    create: (context) => {
      const targets = new Map<unknown, string>();
      let frame: IFunctionFrame | undefined;

      const checkExit = (node: Rule.Node) => {
        const current = frame;
        if (
          !current?.hook ||
          AstNode.getType({ node: AstNode.readField({ node, key: 'body' }) }) !== 'BlockStatement'
        ) {
          return;
        }

        const endIsReachable = [...current.segments].some((segment) => segment.reachable);
        if (current.returnsValue && (current.returnsNothing || endIsReachable)) {
          context.report({ node, messageId: 'inconsistent', data: { hook: current.hook } });
        }
      };

      return {
        [AstNodeTypes.CALL_EXPRESSION]: (node: Rule.Node) => {
          const hook = HookSupport.calleeName({ call: node });
          const args = AstNode.readField({ node, key: 'arguments' });
          if (
            !HookSupport.isEffectHook({ name: hook }) ||
            hook === undefined ||
            !Array.isArray(args)
          ) {
            return;
          }

          if (HookSupport.isCallback({ node: args[0] })) {
            targets.set(args[0], hook);
          }
        },
        onCodePathStart: (_codePath, node) => {
          frame = {
            upper: frame,
            hook: targets.get(node),
            returnsValue: false,
            returnsNothing: false,
            segments: new Set(),
          };
        },
        onCodePathEnd: () => {
          frame = frame?.upper;
        },
        onCodePathSegmentStart: (segment) => frame?.segments.add(segment),
        onCodePathSegmentEnd: (segment) => frame?.segments.delete(segment),
        onUnreachableCodePathSegmentStart: (segment) => frame?.segments.add(segment),
        onUnreachableCodePathSegmentEnd: (segment) => frame?.segments.delete(segment),
        [AstNodeTypes.RETURN_STATEMENT]: (node: Rule.Node) => {
          if (!frame) {
            return;
          }

          if (AstNode.readField({ node, key: 'argument' })) {
            frame.returnsValue = true;
          } else {
            frame.returnsNothing = true;
          }
        },
        'FunctionExpression:exit': checkExit,
        'ArrowFunctionExpression:exit': checkExit,
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
