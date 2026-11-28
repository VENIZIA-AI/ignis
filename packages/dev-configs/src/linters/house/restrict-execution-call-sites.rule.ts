import { matchesGlob, relative, resolve, sep } from 'node:path';
import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { ExecutionSupport } from './execution-support';

/**
 * `@venizia/restrict-execution-call-sites`. A scoped run takes the values its caller names, so an application lists
 * the files that may say who is running: `Execution.run`, `ExecutionFrames.run` and `ExecutionFrames.root` are
 * reported everywhere else. `Execution.sleep` and the other methods are never reported.
 *
 * - `allow`: globs, relative to the working directory, of files that may call `Execution.run` without `isRoot`.
 * - `allowRoot`: globs of files that may also open a root frame: `isRoot`, `ExecutionFrames.run` and `.root`.
 *   Options the rule cannot read (a spread, a variable, `run` passed as a value) may set `isRoot`, so they count.
 *
 * A computed name that cannot be read, on either class, counts as one that may open a root.
 * With no list, every call is reported. The presets do not turn the rule on. It follows imports of the framework's
 * packages only: a re-export of the application's own, or `Execution` held in another variable, is not followed.
 */
export class RestrictExecutionCallSitesRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/restrict-execution-call-sites`;

  /** The restricted methods of each class, and whether the method opens a frame of any shape by itself. */
  private static readonly METHODS: ReadonlyMap<string, boolean> = new Map([
    ['Execution.run', false],
    ['ExecutionFrames.run', true],
    ['ExecutionFrames.root', true],
  ]);

  private static matches(opts: { context: Rule.RuleContext; globs: unknown }): boolean {
    const { context, globs } = opts;
    const absolute = resolve(context.cwd, context.filename);
    const path = relative(context.cwd, absolute).split(sep).join('/');

    return (
      Array.isArray(globs) &&
      globs.some((glob) => typeof glob === 'string' && matchesGlob(path, glob))
    );
  }

  /** Whether the `Execution.run` read at `member` opens a root frame, or may. */
  private static mayBeRoot(opts: { context: Rule.RuleContext; member: Rule.Node }): boolean {
    const { context, member } = opts;
    const call = ExecutionSupport.child({ node: member, key: 'parent' });
    const isCall =
      call?.type === AstNodeTypes.CALL_EXPRESSION &&
      ExecutionSupport.child({ node: call, key: 'callee' }) === member;
    const object = isCall
      ? ExecutionSupport.unwrap({
          node: ExecutionSupport.list({ node: call, key: 'arguments' })[0],
        })
      : undefined;

    if (object?.type !== AstNodeTypes.OBJECT_EXPRESSION) {
      return true;
    }

    // A system run has no `isRoot`.
    const mode = ExecutionSupport.optionOf({ object, name: 'mode' });

    if (!mode.isUnknown && ExecutionSupport.isSystemRun({ context, object })) {
      return false;
    }

    const { value, isUnknown } = ExecutionSupport.optionOf({ object, name: 'isRoot' });

    if (isUnknown || value === undefined) {
      return isUnknown;
    }

    const isFalse = AstNode.readField({ node: value, key: 'value' }) === false;
    const isUndefined = AstNode.readField({ node: value, key: 'name' }) === 'undefined';

    return !isFalse && !isUndefined;
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'problem',
      schema: [
        {
          type: 'object',
          properties: {
            allow: { type: 'array', items: { type: 'string' } },
            allowRoot: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        restricted:
          '`{{method}}` says who is running: call it only from a file the lint configuration lists (`allow`).',
        root: '`{{method}}` opens, or may open, a root frame: only a file listed in `allowRoot` may. Write the options as an object, without `isRoot`, or list the file.',
      },
    },
    create: (context) => {
      const options: unknown = context.options[0];
      const globsOf = (key: string) => AstNode.readField({ node: options, key });

      if (RestrictExecutionCallSitesRule.matches({ context, globs: globsOf('allowRoot') })) {
        return {};
      }

      const isAllowed = RestrictExecutionCallSitesRule.matches({
        context,
        globs: globsOf('allow'),
      });

      const check = (opts: {
        node: Rule.Node;
        owner: string | undefined;
        name: string | undefined;
        member?: Rule.Node;
      }) => {
        const { node, owner, name, member } = opts;
        // A name that cannot be read may be any method, the one that opens a root included.
        const isUnread =
          name === undefined && (owner === 'Execution' || owner === 'ExecutionFrames');
        const method = isUnread ? `${owner}[...]` : `${owner}.${name}`;
        const opensRoot = isUnread || RestrictExecutionCallSitesRule.METHODS.get(method);

        if (opensRoot === undefined) {
          return;
        }

        if (!isAllowed) {
          context.report({ node, messageId: 'restricted', data: { method } });

          return;
        }

        const isRoot =
          opensRoot ||
          member === undefined ||
          RestrictExecutionCallSitesRule.mayBeRoot({ context, member });

        if (isRoot) {
          context.report({ node, messageId: 'root', data: { method } });
        }
      };

      return {
        [AstNodeTypes.MEMBER_EXPRESSION]: (node: Rule.Node) => {
          const owner = ExecutionSupport.exportOf({
            context,
            node: ExecutionSupport.child({ node, key: 'object' }),
          });
          const name = ExecutionSupport.keyOf({ node, key: 'property' });

          check({ node, owner, name, member: node });
        },
        [AstNodeTypes.VARIABLE_DECLARATOR]: (node: Rule.Node) => {
          const owner = ExecutionSupport.exportOf({
            context,
            node: ExecutionSupport.child({ node, key: 'init' }),
          });
          const pattern = ExecutionSupport.child({ node, key: 'id' });

          for (const property of ExecutionSupport.list({ node: pattern, key: 'properties' })) {
            const name = ExecutionSupport.keyOf({ node: property, key: 'key' });

            // A rest element takes the others, and has no key.
            if (property.type === AstNodeTypes.PROPERTY) {
              check({ node: property, owner, name });
            }
          }
        },
      };
    },
  };

  static build(
    opts: { severity?: TRuleSeverity; allow?: string[]; allowRoot?: string[] } = {},
  ): Linter.RuleEntry {
    const { severity = 'error', allow = [], allowRoot = [] } = opts;

    return [severity, { allow, allowRoot }];
  }
}
