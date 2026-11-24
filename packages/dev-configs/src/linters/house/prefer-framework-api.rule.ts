import type { Linter, Rule, Scope } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import type { IBrowserApiPattern } from './browser-api-patterns';
import { BrowserApiPatterns } from './browser-api-patterns';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/** The names that stand for the global object. */
const GLOBAL_OBJECTS: ReadonlyArray<string> = ['window', 'globalThis', 'self'];

/**
 * `venizia/prefer-framework-api`. A browser API that `@venizia/ardor-react` wraps in a hook (`window.matchMedia`, a
 * `ResizeObserver`, `navigator.onLine`, a `beforeunload` listener, `navigator.clipboard.writeText`, `window.confirm`...) is
 * used through the hook, which owns the subscribe and cleanup. The rows are `BrowserApiPatterns.TABLE`; the message names
 * the hook. The rule is for apps: ardor-react's own source, where the hooks are written, turns it off.
 *
 * Only a reference to the global is reported: a `window`, `navigator` or `document` the file binds itself is not. Hooks
 * the author wants to bypass on purpose take an `eslint-disable-next-line` with the reason, or `ignore` lists pattern ids.
 *
 * @useWhen a React app should reach the browser (media queries, sizes, observers, online status, visibility, unload, clipboard, confirm) through the ardor-react hooks
 * @insteadOf window.matchMedia, new ResizeObserver, navigator.onLine and the other browser APIs written by hand
 */
export class PreferFrameworkApiRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/prefer-framework-api`;

  /** The dotted text of `a.b.c` (identifiers only), or `undefined` for anything else. */
  private static pathOf(opts: { node: unknown }): string | undefined {
    const { node } = opts;

    if (AstNode.getType({ node }) === AstNodeTypes.IDENTIFIER) {
      const name = AstNode.readField({ node, key: 'name' });

      return typeof name === 'string' ? name : undefined;
    }

    if (AstNode.getType({ node }) !== AstNodeTypes.MEMBER_EXPRESSION) {
      return undefined;
    }

    const property = AstNode.readField({ node, key: 'property' });
    const name = AstNode.readField({ node: property, key: 'name' });
    const head = PreferFrameworkApiRule.pathOf({
      node: AstNode.readField({ node, key: 'object' }),
    });

    return head !== undefined &&
      typeof name === 'string' &&
      AstNode.readField({ node, key: 'computed' }) !== true
      ? `${head}.${name}`
      : undefined;
  }

  /** `window.navigator.onLine` is `navigator.onLine`. */
  private static withoutGlobalRoot(opts: { path: string }): string {
    const [first, ...rest] = opts.path.split('.');

    return GLOBAL_OBJECTS.includes(first ?? '') && rest.length > 0 ? rest.join('.') : opts.path;
  }

  /** Whether the root identifier of `path` is the global one: no scope of the file binds it. */
  private static isGlobal(opts: {
    context: Rule.RuleContext;
    node: Rule.Node;
    path: string;
  }): boolean {
    const { context, node, path } = opts;
    const root = path.split('.')[0] ?? '';
    let scope: Scope.Scope | null = context.sourceCode.getScope(node);

    while (scope) {
      if ((scope.set.get(root)?.defs.length ?? 0) > 0) {
        return false;
      }

      scope = scope.upper;
    }

    return true;
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      schema: [
        {
          type: 'object',
          properties: { ignore: { type: 'array', items: { type: 'string' } } },
          additionalProperties: false,
        },
      ],
      messages: {
        framework:
          'Use {{hooks}} from {{package}} instead of {{written}}: the hook owns the subscribe and the cleanup.',
      },
    },
    create: (context) => {
      const options: unknown = context.options[0];
      const ignored = AstNode.readField({ node: options, key: 'ignore' });
      const ignore = new Set(Array.isArray(ignored) ? ignored : []);
      const patterns = BrowserApiPatterns.TABLE.filter((pattern) => !ignore.has(pattern.id));

      const report = (opts: { node: Rule.Node; pattern: IBrowserApiPattern }) => {
        const { node, pattern } = opts;

        context.report({
          node,
          messageId: 'framework',
          data: {
            hooks: pattern.hooks,
            package: BrowserApiPatterns.PACKAGE,
            written: pattern.written,
          },
        });
      };

      return {
        // `window.matchMedia`, `window.innerWidth`, `navigator.onLine`, `navigator.clipboard.writeText`...
        [AstNodeTypes.MEMBER_EXPRESSION]: (node: Rule.Node) => {
          const path = PreferFrameworkApiRule.pathOf({ node });

          if (path === undefined || !PreferFrameworkApiRule.isGlobal({ context, node, path })) {
            return;
          }

          const bare = PreferFrameworkApiRule.withoutGlobalRoot({ path });

          for (const pattern of patterns) {
            const { match } = pattern;

            if (
              (match.kind === 'global' &&
                GLOBAL_OBJECTS.includes(path.split('.')[0] ?? '') &&
                path.split('.').length === 2 &&
                match.names.includes(bare)) ||
              (match.kind === 'path' && match.paths.includes(bare))
            ) {
              report({ node, pattern });
            }
          }
        },
        [AstNodeTypes.CALL_EXPRESSION]: (node: Rule.Node) => {
          const callee = AstNode.readField({ node, key: 'callee' });
          const args: unknown = AstNode.readField({ node, key: 'arguments' });
          const first = Array.isArray(args) ? args[0] : undefined;
          const event = AstNode.readField({ node: first, key: 'value' });

          // `matchMedia(...)`, `confirm(...)` with no `window.`.
          if (AstNode.getType({ node: callee }) === AstNodeTypes.IDENTIFIER) {
            const name = AstNode.readField({ node: callee, key: 'name' });

            for (const pattern of patterns) {
              if (
                pattern.match.kind === 'global' &&
                typeof name === 'string' &&
                pattern.match.names.includes(name) &&
                PreferFrameworkApiRule.isGlobal({ context, node, path: name })
              ) {
                report({ node, pattern });
              }
            }
          }

          // `<object>.addEventListener('<event>', ...)`.
          const path = PreferFrameworkApiRule.pathOf({ node: callee });

          if (path === undefined || typeof event !== 'string') {
            return;
          }

          const parts = path.split('.');
          const method = parts.pop();
          const owner = parts.join('.');

          if (method !== 'addEventListener') {
            return;
          }

          for (const pattern of patterns) {
            const { match } = pattern;

            if (
              match.kind === 'listener' &&
              match.events.includes(event) &&
              (match.objects === undefined || match.objects.includes(owner))
            ) {
              report({ node, pattern });
            }
          }
        },
        [AstNodeTypes.NEW_EXPRESSION]: (node: Rule.Node) => {
          const path = PreferFrameworkApiRule.pathOf({
            node: AstNode.readField({ node, key: 'callee' }),
          });

          if (path === undefined || !PreferFrameworkApiRule.isGlobal({ context, node, path })) {
            return;
          }

          const bare = PreferFrameworkApiRule.withoutGlobalRoot({ path });

          for (const pattern of patterns) {
            if (pattern.match.kind === 'new' && pattern.match.callees.includes(bare)) {
              report({ node, pattern });
            }
          }
        },
      };
    },
  };

  static build(
    opts: { severity?: TRuleSeverity; ignore?: ReadonlyArray<string> } = {},
  ): Linter.RuleEntry {
    const { severity = 'error', ignore } = opts;

    return ignore === undefined ? [severity] : [severity, { ignore: [...ignore] }];
  }
}
