import { dirname } from 'node:path';
import type { Linter, Rule, Scope } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import type { IBrowserApiPattern } from './browser-api-patterns';
import { BrowserApiPatterns } from './browser-api-patterns';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import type { IFrameworkApiPattern } from './framework-api-patterns';
import { FrameworkApiPatterns } from './framework-api-patterns';
import type { IPackageManifest } from './framework-exports';
import { FrameworkExports } from './framework-exports';

/** The objects a global event listener is added to. */
const GLOBAL_TARGETS: ReadonlyArray<string> = ['window', 'document', 'self', 'globalThis'];

/** The names that stand for the global object. */
const GLOBAL_OBJECTS: ReadonlyArray<string> = ['window', 'globalThis', 'self'];

/**
 * `@venizia/prefer-framework-api`. A browser API that `@venizia/ardor-react` wraps in a hook (`window.matchMedia`, a
 * `ResizeObserver`, `navigator.onLine`, a `beforeunload` listener, `navigator.clipboard.writeText`, `window.confirm`...) is
 * used through the hook, which owns the subscribe and cleanup. The rows are `BrowserApiPatterns.TABLE`; the message names
 * the hook. The rule is for apps: the package that ships the hooks (the nearest `package.json` is named
 * `@venizia/ardor-react`) is not reported.
 *
 * The rows of `FrameworkApiPatterns.TABLE` and of the `extra` option are not about React: they report anywhere in a file,
 * with their own message, in a package their `dependsOn` and `owner` allow.
 *
 * For the hook rows, only a reference to the global is reported: a `window`, `navigator` or `document` the file binds itself is not. And only
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

  /** A dev tool's own configuration: what it names never reaches a browser or a deployment (a dev server's proxy target). */
  private static readonly DEV_TOOL_CONFIG =
    /(?:^|\/)(?:vite\.config\.[cm]?[jt]s|\.configs\/builders\/.+)$/;

  /** The rows that apply in a file of this package: the table and `extra`, less the ignored ones. */
  private static rowsFor(opts: {
    filename: string;
    manifest: IPackageManifest | undefined;
    extra: ReadonlyArray<IFrameworkApiPattern>;
    ignore: ReadonlySet<unknown>;
  }): ReadonlyArray<IFrameworkApiPattern> {
    const { manifest, extra, ignore } = opts;
    const isDevToolConfig = PreferFrameworkApiRule.DEV_TOOL_CONFIG.test(
      opts.filename.replaceAll('\\', '/'),
    );

    return [...FrameworkApiPatterns.TABLE, ...extra].filter((row) => {
      const { id, dependsOn, owner } = row;

      if (isDevToolConfig && id === 'localhost-url') {
        return false;
      }

      if (ignore.has(id) || (owner !== undefined && manifest?.name === owner)) {
        return false;
      }

      return (
        dependsOn === undefined ||
        (manifest?.dependencies.some((entry) => entry.startsWith(dependsOn)) ?? false)
      );
    });
  }

  /** The listeners the rows outside React need, by node type or selector. */
  private static rowListeners(opts: {
    context: Rule.RuleContext;
    rows: ReadonlyArray<IFrameworkApiPattern>;
  }): Array<[string, (node: Rule.Node) => void]> {
    const { context, rows } = opts;
    const listeners: Array<[string, (node: Rule.Node) => void]> = [];

    for (const { match, message } of rows) {
      const report = (node: Rule.Node) => {
        context.report({ node, message });
      };

      /** Reports a global written as a member path, when `accepts` takes it. */
      const onPath = (given: {
        key: string;
        accepts: (bare: string) => boolean;
        property?: RegExp;
        isReadOnly?: boolean;
      }) => {
        listeners.push([
          AstNodeTypes.MEMBER_EXPRESSION,
          (node) => {
            const path = PreferFrameworkApiRule.pathOf({
              node: given.key === '' ? node : AstNode.readField({ node, key: given.key }),
            });

            if (
              path !== undefined &&
              !(given.isReadOnly === true && PreferFrameworkApiRule.isWritten({ node })) &&
              (given.property === undefined ||
                given.property.test(PreferFrameworkApiRule.memberName({ node }))) &&
              given.accepts(PreferFrameworkApiRule.withoutGlobalRoot({ path })) &&
              PreferFrameworkApiRule.isGlobal({ context, node, path })
            ) {
              report(node);
            }
          },
        ]);
      };

      switch (match.type) {
        case 'path': {
          onPath({ key: '', accepts: (bare) => match.paths.includes(bare) });
          break;
        }

        case 'member': {
          onPath({
            key: 'object',
            accepts: (bare) => match.objects.includes(bare),
            property: match.property === undefined ? undefined : new RegExp(match.property),
            isReadOnly: match.isReadOnly,
          });
          break;
        }

        case 'selector': {
          listeners.push([match.selector, report]);
          break;
        }

        case 'literal': {
          const pattern = new RegExp(match.pattern);

          const check = (node: Rule.Node, text: unknown) => {
            const isWanted =
              match.isFallbackOnly !== true || PreferFrameworkApiRule.isFallback({ node });

            if (typeof text === 'string' && isWanted && pattern.test(text)) {
              report(node);
            }
          };

          listeners.push([
            AstNodeTypes.LITERAL,
            (node) => check(node, AstNode.readField({ node, key: 'value' })),
          ]);
          listeners.push([
            AstNodeTypes.TEMPLATE_ELEMENT,
            (node) => {
              const value = AstNode.readField({ node, key: 'value' });
              const template: unknown = AstNode.readField({ node, key: 'parent' });
              const parts: unknown = AstNode.readField({ node: template, key: 'quasis' });

              // The first part is where a URL starts, and the template is what stands in a position.
              if (AstNode.isNode(template) && Array.isArray(parts) && parts[0] === node) {
                check(template, AstNode.readField({ node: value, key: 'cooked' }));
              }
            },
          ]);
          break;
        }

        case 'import': {
          const check = (node: Rule.Node) => {
            const source = AstNode.readField({ node, key: 'source' });
            const name = AstNode.readField({ node: source, key: 'value' });

            if (
              typeof name === 'string' &&
              match.sources.includes(name) &&
              !PreferFrameworkApiRule.isTypeOnly({ node })
            ) {
              report(node);
            }
          };

          listeners.push([AstNodeTypes.IMPORT_DECLARATION, check]);
          listeners.push([AstNodeTypes.IMPORT_EXPRESSION, check]);
          break;
        }

        default: {
          // The other types are hook rows of `BrowserApiPatterns`; as an `extra` row they match nothing here.
          break;
        }
      }
    }

    return listeners;
  }

  /** The name of `a.name` or `a['name']`; empty for `a[name]`, whose name the file does not state. */
  private static memberName(opts: { node: Rule.Node }): string {
    const property = AstNode.readField({ node: opts.node, key: 'property' });
    const computed = AstNode.readField({ node: opts.node, key: 'computed' }) === true;
    const name = AstNode.readField({ node: property, key: computed ? 'value' : 'name' });

    return typeof name === 'string' ? name : '';
  }

  /** The field each type of an `extra` row cannot do without. */
  private static readonly ROW_FIELDS = new Map<unknown, string>([
    ['path', 'paths'],
    ['member', 'objects'],
    ['selector', 'selector'],
    ['literal', 'pattern'],
    ['import', 'sources'],
  ]);

  /** Whether an `extra` entry is a row this rule can run. The option schema refuses the others before it gets here. */
  private static isRow(value: unknown): value is IFrameworkApiPattern {
    const match = AstNode.readField({ node: value, key: 'match' });
    const field = PreferFrameworkApiRule.ROW_FIELDS.get(AstNode.getType({ node: match }));

    return (
      typeof AstNode.readField({ node: value, key: 'id' }) === 'string' &&
      typeof AstNode.readField({ node: value, key: 'message' }) === 'string' &&
      field !== undefined &&
      AstNode.readField({ node: match, key: field }) !== undefined
    );
  }

  /** The schema of the `match` of an `extra` row: one shape per type, each with its own field required. */
  private static matchSchema() {
    const text = { type: 'string' } as const;
    const list = { type: 'array', items: text } as const;
    const flag = { type: 'boolean' } as const;
    const shapes: Array<{ type: string; more?: Record<string, typeof text | typeof flag> }> = [
      { type: 'path' },
      { type: 'member', more: { property: text, isReadOnly: flag } },
      { type: 'selector' },
      { type: 'literal', more: { isFallbackOnly: flag } },
      { type: 'import' },
    ];

    return {
      oneOf: shapes.map(({ type, more }) => {
        const field = PreferFrameworkApiRule.ROW_FIELDS.get(type) ?? type;
        const isText = type === 'selector' || type === 'literal';

        return {
          type: 'object' as const,
          properties: { type: { enum: [type] }, [field]: isText ? text : list, ...more },
          required: ['type', field],
          additionalProperties: false,
        };
      }),
    };
  }

  /**
   * Whether `node` is assigned to or deleted, rather than read. A member that a destructuring pattern writes
   * (`[process.env.APP_ENV_A] = values`) counts as a read and is reported.
   */
  private static isWritten(opts: { node: Rule.Node }): boolean {
    const { node } = opts;
    const parent: unknown = AstNode.readField({ node, key: 'parent' });
    const type = AstNode.getType({ node: parent });

    if (type === AstNodeTypes.ASSIGNMENT_EXPRESSION) {
      return AstNode.readField({ node: parent, key: 'left' }) === node;
    }

    return (
      type === AstNodeTypes.UNARY_EXPRESSION &&
      AstNode.readField({ node: parent, key: 'operator' }) === 'delete'
    );
  }

  private static readonly FALLBACK_KEYS = new Set<unknown>(['default', 'defaultValue', 'fallback']);

  /** Whether `node` is the value used when another is missing. */
  private static isFallback(opts: { node: Rule.Node }): boolean {
    const { node } = opts;
    const parent: unknown = AstNode.readField({ node, key: 'parent' });
    const type = AstNode.getType({ node: parent });
    const isRight = AstNode.readField({ node: parent, key: 'right' }) === node;

    if (type === AstNodeTypes.LOGICAL_EXPRESSION) {
      return isRight && AstNode.readField({ node: parent, key: 'operator' }) !== '&&';
    }

    if (type === AstNodeTypes.ASSIGNMENT_PATTERN) {
      return isRight;
    }

    if (type === AstNodeTypes.ASSIGNMENT_EXPRESSION) {
      const operator = AstNode.readField({ node: parent, key: 'operator' });

      return isRight && (operator === '??=' || operator === '||=');
    }

    return (
      type === AstNodeTypes.PROPERTY &&
      AstNode.readField({ node: parent, key: 'value' }) === node &&
      PreferFrameworkApiRule.FALLBACK_KEYS.has(
        AstNode.readField({
          node: AstNode.readField({ node: parent, key: 'key' }),
          key: 'name',
        }),
      )
    );
  }

  /** Whether an import declaration brings in types only. */
  private static isTypeOnly(opts: { node: unknown }): boolean {
    const { node } = opts;
    const specifiers: unknown = AstNode.readField({ node, key: 'specifiers' });
    const isType = (item: unknown) =>
      AstNode.readField({ node: item, key: 'importKind' }) === 'type';

    return (
      isType(node) ||
      (Array.isArray(specifiers) && specifiers.length > 0 && specifiers.every(isType))
    );
  }

  /** One listener object: two rows that visit the same node both run. */
  private static merge(opts: {
    listeners: Array<[string, (node: Rule.Node) => void]>;
  }): Rule.RuleListener {
    const byKey = new Map<string, Array<(node: Rule.Node) => void>>();

    for (const [key, listener] of opts.listeners) {
      byKey.set(key, [...(byKey.get(key) ?? []), listener]);
    }

    return Object.fromEntries(
      [...byKey].map(([key, all]) => [
        key,
        (node: Rule.Node) => {
          for (const listener of all) {
            listener(node);
          }
        },
      ]),
    );
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      schema: [
        {
          type: 'object',
          properties: {
            hooks: { type: 'boolean' },
            ignore: { type: 'array', items: { type: 'string' } },
            extra: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  message: { type: 'string' },
                  dependsOn: { type: 'string' },
                  owner: { type: 'string' },
                  match: PreferFrameworkApiRule.matchSchema(),
                },
                required: ['id', 'match', 'message'],
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        framework:
          "Use {{hooks}} instead of {{written}}, the hook owns the subscribe and the cleanup: `import { {{name}} } from '{{package}}';`",
      },
    },
    create: (context) => {
      const manifest = FrameworkExports.manifestFor({ directory: dirname(context.filename) });
      const options: unknown = context.options[0];
      const ignored = AstNode.readField({ node: options, key: 'ignore' });
      const ignore = new Set(Array.isArray(ignored) ? ignored : []);
      const added: unknown = AstNode.readField({ node: options, key: 'extra' });
      const rows = PreferFrameworkApiRule.rowsFor({
        filename: context.filename,
        manifest,
        extra: Array.isArray(added)
          ? added.filter((row: unknown) => PreferFrameworkApiRule.isRow(row))
          : [],
        ignore,
      });
      // The package that ships the hooks writes them with the browser APIs they wrap.
      const patterns =
        AstNode.readField({ node: options, key: 'hooks' }) === false ||
        manifest?.name === BrowserApiPatterns.PACKAGE
          ? []
          : BrowserApiPatterns.TABLE.filter((pattern) => !ignore.has(pattern.id));

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

      const hooks: Record<string, (node: Rule.Node) => void> = {
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

      return PreferFrameworkApiRule.merge({
        listeners: [
          ...Object.entries(hooks),
          ...PreferFrameworkApiRule.rowListeners({ context, rows }),
        ],
      });
    },
  };

  /**
   * `hooks: false` leaves out the rows of `BrowserApiPatterns`, for code that is not React: a `use...` function of another
   * library reads as a hook. An entry that sets options replaces the earlier ones, so it states `hooks` again.
   */
  static build(
    opts: {
      severity?: TRuleSeverity;
      hooks?: boolean;
      ignore?: ReadonlyArray<string>;
      extra?: ReadonlyArray<IFrameworkApiPattern>;
    } = {},
  ): Linter.RuleEntry {
    const { severity = 'error', hooks, ignore, extra } = opts;
    // Only what was given: the option schema refuses a key whose value is `undefined`.
    const options: Record<string, unknown> = {};

    if (hooks !== undefined) {
      options.hooks = hooks;
    }

    if (ignore !== undefined) {
      options.ignore = [...ignore];
    }

    if (extra !== undefined) {
      options.extra = [...extra];
    }

    return Object.keys(options).length === 0 ? [severity] : [severity, options];
  }
}
