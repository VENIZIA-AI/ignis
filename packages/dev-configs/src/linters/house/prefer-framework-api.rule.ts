import type { Linter, Rule, Scope } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import type { IBrowserApiPattern } from './browser-api-patterns';
import { BrowserApiPatterns } from './browser-api-patterns';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/** The objects a global event listener is added to. */
const GLOBAL_TARGETS: ReadonlyArray<string> = ['window', 'document', 'self', 'globalThis'];

/** The names that stand for the global object. */
const GLOBAL_OBJECTS: ReadonlyArray<string> = ['window', 'globalThis', 'self'];

/**
 * `venizia/prefer-framework-api`. A browser API that `@venizia/ardor-react` wraps in a hook (`window.matchMedia`, a
 * `ResizeObserver`, `navigator.onLine`, a `beforeunload` listener, `navigator.clipboard.writeText`, `window.confirm`...) is
 * used through the hook, which owns the subscribe and cleanup. The rows are `BrowserApiPatterns.TABLE`; the message names
 * the hook. The rule is for apps: ardor-react's own source, where the hooks are written, turns it off.
 *
 * Only a reference to the global is reported: a `window`, `navigator` or `document` the file binds itself is not. And only
 * where a hook can be called: in a component (a PascalCase function that draws JSX) or a hook (`useX`), see `isInReact`. A
 * module function, a class and an event handler making a one-off call are left alone. Hooks the author wants to bypass on
 * purpose take an `eslint-disable-next-line` with the reason, or `ignore` lists pattern ids.
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

  private static readonly FUNCTIONS = new Set<string>([
    AstNodeTypes.FUNCTION_DECLARATION,
    AstNodeTypes.FUNCTION_EXPRESSION,
    AstNodeTypes.ARROW_FUNCTION_EXPRESSION,
  ]);

  /** Whether a function has JSX anywhere in it: with a PascalCase name, that is a component. */
  private static readonly jsxCache = new WeakMap<object, boolean>();

  private static containsJsx(opts: { context: Rule.RuleContext; node: unknown }): boolean {
    const { context, node } = opts;

    if (typeof node !== 'object' || node === null) {
      return false;
    }

    const cached = PreferFrameworkApiRule.jsxCache.get(node);

    if (cached !== undefined) {
      return cached;
    }

    const type = AstNode.getType({ node });
    let found = type === AstNodeTypes.JSX_ELEMENT || type === AstNodeTypes.JSX_FRAGMENT;

    for (const key of type === undefined ? [] : (context.sourceCode.visitorKeys[type] ?? [])) {
      const child = AstNode.readField({ node, key });

      for (const entry of Array.isArray(child) ? child : [child]) {
        found = found || PreferFrameworkApiRule.containsJsx({ context, node: entry });
      }
    }

    PreferFrameworkApiRule.jsxCache.set(node, found);

    return found;
  }

  /** The name a function is known by: its own, or the variable it is assigned to (through one `memo(...)` / `forwardRef(...)`). */
  private static nameOf(opts: { fn: Rule.Node }): string | undefined {
    const { fn } = opts;
    const own = AstNode.readField({
      node: AstNode.readField({ node: fn, key: 'id' }),
      key: 'name',
    });

    if (typeof own === 'string') {
      return own;
    }

    let parent: unknown = AstNode.readField({ node: fn, key: 'parent' });

    if (AstNode.getType({ node: parent }) === AstNodeTypes.CALL_EXPRESSION) {
      parent = AstNode.readField({ node: parent, key: 'parent' });
    }

    const name = AstNode.readField({
      node: AstNode.readField({ node: parent, key: 'id' }),
      key: 'name',
    });

    return AstNode.getType({ node: parent }) === AstNodeTypes.VARIABLE_DECLARATOR &&
      typeof name === 'string'
      ? name
      : undefined;
  }

  /** A hook (`useX`), or a component: a PascalCase function that draws JSX. */
  private static isReactFunction(opts: { context: Rule.RuleContext; fn: Rule.Node }): boolean {
    const name = PreferFrameworkApiRule.nameOf({ fn: opts.fn });

    if (name === undefined) {
      return false;
    }

    return (
      /^use[A-Z0-9]/.test(name) ||
      (/^[A-Z]/.test(name) &&
        PreferFrameworkApiRule.containsJsx({ context: opts.context, node: opts.fn }))
    );
  }

  /** Whether `fn` is an argument of a hook call (`useEffect(() => ...)`): the callback runs for the component or the hook. */
  private static isHookCallback(opts: { fn: Rule.Node }): boolean {
    const parent: unknown = AstNode.readField({ node: opts.fn, key: 'parent' });
    const callee = AstNode.readField({ node: parent, key: 'callee' });
    const name =
      AstNode.readField({ node: callee, key: 'name' }) ??
      AstNode.readField({
        node: AstNode.readField({ node: callee, key: 'property' }),
        key: 'name',
      });

    return (
      AstNode.getType({ node: parent }) === AstNodeTypes.CALL_EXPRESSION &&
      typeof name === 'string' &&
      /^use[A-Z0-9]/.test(name)
    );
  }

  /**
   * Whether `node` is in a component or a hook, which is where a hook can be called. A subscription (a listener, an
   * observer) counts through any handler or helper on the way up: it belongs in a hook. A plain read (`window.innerWidth`,
   * `window.confirm`) counts only in the body of the component or the hook, or in a callback it hands to a hook
   * (`useEffect`, `useMemo`): inside an event handler, or outside every component (a module function, a class), it is a
   * one-off call a hook cannot make.
   */
  private static isInReact(opts: {
    context: Rule.RuleContext;
    node: Rule.Node;
    subscribes: boolean;
  }): boolean {
    const { context, node, subscribes } = opts;

    for (const ancestor of [...context.sourceCode.getAncestors(node)].reverse()) {
      const type = AstNode.getType({ node: ancestor });

      if (
        type === undefined ||
        !PreferFrameworkApiRule.FUNCTIONS.has(type) ||
        !AstNode.isNode(ancestor)
      ) {
        continue;
      }

      if (PreferFrameworkApiRule.isReactFunction({ context, fn: ancestor })) {
        return true;
      }

      if (!subscribes && !PreferFrameworkApiRule.isHookCallback({ fn: ancestor })) {
        return false;
      }
    }

    return false;
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
          "Use {{hooks}} instead of {{written}}, the hook owns the subscribe and the cleanup: `import { {{name}} } from '{{package}}';`",
      },
    },
    create: (context) => {
      const options: unknown = context.options[0];
      const ignored = AstNode.readField({ node: options, key: 'ignore' });
      const ignore = new Set(Array.isArray(ignored) ? ignored : []);
      const patterns = BrowserApiPatterns.TABLE.filter((pattern) => !ignore.has(pattern.id));

      const report = (opts: { node: Rule.Node; pattern: IBrowserApiPattern }) => {
        const { node, pattern } = opts;
        const subscribes = pattern.match.type === 'listener' || pattern.match.type === 'new';

        if (!PreferFrameworkApiRule.isInReact({ context, node, subscribes })) {
          return;
        }

        context.report({
          node,
          messageId: 'framework',
          data: {
            hooks: pattern.hooks,
            // One import line, for the first hook the row suggests (the `useX` words are in backticks).
            name: /`(use\w+)`/.exec(pattern.hooks)?.[1],
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
              (match.type === 'global' &&
                GLOBAL_OBJECTS.includes(path.split('.')[0] ?? '') &&
                path.split('.').length === 2 &&
                match.names.includes(bare)) ||
              (match.type === 'path' && match.paths.includes(bare))
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
                pattern.match.type === 'global' &&
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

          // A listener on a socket, an element or an `EventTarget` of the author's own is not the browser's.
          const isOwnerGlobal =
            owner === '' ||
            (PreferFrameworkApiRule.isGlobal({ context, node, path: owner }) &&
              GLOBAL_TARGETS.includes(owner));

          for (const pattern of patterns) {
            const { match } = pattern;

            if (
              match.type === 'listener' &&
              match.events.includes(event) &&
              isOwnerGlobal &&
              (match.objects === undefined || owner === '' || match.objects.includes(owner))
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
            if (pattern.match.type === 'new' && pattern.match.callees.includes(bare)) {
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
