import { dirname } from 'node:path';
import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { FrameworkExports } from './framework-exports';
import { ImportSupport } from './import-support';

/** What makes a string a place where an HTTP method is written, read from the syntax around it. */
class HttpMethodSites {
  /** The values of `HTTP.Methods`, in any case. */
  static readonly VERB = /^(?:get|post|put|patch|delete|head|options|query)$/i;

  /** The names a method is held under. */
  static readonly NAMES: ReadonlySet<string> = new Set(['method', 'verb', 'httpMethod']);

  /** A property beside `method` that makes its object a route config or a request, not a table of method names. */
  static readonly REQUEST_KEYS: ReadonlySet<string> = new Set([
    'baseUrl',
    'body',
    'configs',
    'data',
    'headers',
    'path',
    'paths',
    'query',
    'request',
    'responses',
    'signal',
    'url',
  ]);

  /** A call that takes a request init: `fetch`, `fetchFn`, a name ending in `Fetch`, `new Request`. */
  static readonly REQUEST_CALLEE = /^(?:fetch|fetchFn|Request)$|Fetch$/;

  /** The call names under which an object with a target is a request the framework sends, uppercasing its method. */
  static readonly SENDERS: ReadonlySet<string> = new Set(['execute', 'request', 'send']);

  /** The properties that say where a request goes. */
  static readonly TARGET_KEYS: ReadonlySet<string> = new Set(['baseUrl', 'path', 'paths', 'url']);

  /** HTTP clients that send a method as written: in a file that imports one, a request call is not the framework's. */
  static readonly FOREIGN_CLIENTS: ReadonlySet<string> = new Set([
    'got',
    'http',
    'https',
    'ky',
    'node-fetch',
    'node:http',
    'node:http2',
    'node:https',
    'ofetch',
    'undici',
  ]);

  static field(node: unknown, key: string): unknown {
    return AstNode.readField({ node, key });
  }

  static nameOf(node: unknown): string | undefined {
    const name = HttpMethodSites.field(node, 'name') ?? HttpMethodSites.field(node, 'value');

    return typeof name === 'string' ? name : undefined;
  }

  /** The strings an expression writes out: itself, either branch of a conditional, either side of `??` and `||`. */
  static literalsOf(node: unknown): unknown[] {
    const type = AstNode.getType({ node });

    if (type === AstNodeTypes.LITERAL) {
      return [node];
    }

    if (type === AstNodeTypes.CONDITIONAL_EXPRESSION) {
      return ['consequent', 'alternate'].flatMap((key) =>
        HttpMethodSites.literalsOf(HttpMethodSites.field(node, key)),
      );
    }

    if (type === AstNodeTypes.LOGICAL_EXPRESSION) {
      return ['left', 'right'].flatMap((key) =>
        HttpMethodSites.literalsOf(HttpMethodSites.field(node, key)),
      );
    }

    const isWrapped =
      type === AstNodeTypes.AS_EXPRESSION || type === AstNodeTypes.SATISFIES_EXPRESSION;

    return isWrapped ? HttpMethodSites.literalsOf(HttpMethodSites.field(node, 'expression')) : [];
  }

  /** What a fix replaces: the literal, or its `as const`, which TypeScript refuses on a member reference (TS1355). */
  static replaced(node: Rule.Node): Rule.Node {
    const parent = HttpMethodSites.field(node, 'parent');
    const annotation = HttpMethodSites.field(parent, 'typeAnnotation');
    const asserted = HttpMethodSites.nameOf(HttpMethodSites.field(annotation, 'typeName'));

    return asserted === 'const' && AstNode.isNode(parent) ? parent : node;
  }

  static keysOf(object: unknown): string[] {
    const properties = HttpMethodSites.field(object, 'properties');

    if (!Array.isArray(properties)) {
      return [];
    }

    return properties.flatMap((property) => {
      return HttpMethodSites.nameOf(HttpMethodSites.field(property, 'key')) ?? [];
    });
  }

  static importsForeignClient(context: Rule.RuleContext): boolean {
    return context.sourceCode.ast.body.some((statement) => {
      const source = HttpMethodSites.field(HttpMethodSites.field(statement, 'source'), 'value');

      return typeof source === 'string' && HttpMethodSites.FOREIGN_CLIENTS.has(source);
    });
  }

  /** The call an object literal is written in as an argument, through the literals and type wrappers around it. */
  static enclosingCall(object: unknown): unknown {
    const wrappers: ReadonlySet<string> = new Set([
      'ConditionalExpression',
      'LogicalExpression',
      'ObjectExpression',
      'Property',
      'SpreadElement',
      'TSAsExpression',
      'TSSatisfiesExpression',
    ]);
    let current = HttpMethodSites.field(object, 'parent');

    while (AstNode.isNode(current) && wrappers.has(current.type)) {
      current = HttpMethodSites.field(current, 'parent');
    }

    return current;
  }

  static calleeName(call: unknown): string | undefined {
    const callee = HttpMethodSites.field(call, 'callee');

    return HttpMethodSites.nameOf(HttpMethodSites.field(callee, 'property') ?? callee);
  }

  /** The `params` of a `send` that names a `resource`: how a data provider is told the method. */
  static isSendParams(object: unknown): boolean {
    const property = HttpMethodSites.field(object, 'parent');

    if (HttpMethodSites.nameOf(HttpMethodSites.field(property, 'key')) !== 'params') {
      return false;
    }

    const argument = HttpMethodSites.field(property, 'parent');
    const call = HttpMethodSites.field(argument, 'parent');
    const callee = HttpMethodSites.field(call, 'callee');

    return (
      HttpMethodSites.nameOf(HttpMethodSites.field(callee, 'property')) === 'send' &&
      HttpMethodSites.keysOf(argument).includes('resource')
    );
  }

  /**
   * Whether the framework reads the method of this object, so its lowercase constant is what goes out. Never an
   * object written into a `fetch` or `new Request` call. Otherwise: a route config (`responses`, a `configs`
   * property, `satisfies IAuthRouteConfig`); a request with a target passed to an `execute`, `send` or `request`
   * method; or the `params` of a `send` that names a `resource`. The last two need a file that imports no other
   * HTTP client.
   */
  static isFrameworkRead(opts: { object: unknown; context: Rule.RuleContext }): boolean {
    const { object, context } = opts;
    const enclosing = HttpMethodSites.calleeName(HttpMethodSites.enclosingCall(object));

    if (enclosing !== undefined && HttpMethodSites.REQUEST_CALLEE.test(enclosing)) {
      return false;
    }

    const keys = HttpMethodSites.keysOf(object);
    const parent = HttpMethodSites.field(object, 'parent');
    const annotation = HttpMethodSites.field(parent, 'typeAnnotation');
    const typeName = HttpMethodSites.nameOf(HttpMethodSites.field(annotation, 'typeName'));
    const heldAs = HttpMethodSites.nameOf(HttpMethodSites.field(parent, 'key'));

    if (keys.includes('responses') || typeName === 'IAuthRouteConfig' || heldAs === 'configs') {
      return true;
    }

    if (HttpMethodSites.importsForeignClient(context)) {
      return false;
    }

    if (HttpMethodSites.isSendParams(object)) {
      return true;
    }

    const callee = HttpMethodSites.field(parent, 'callee');
    const called = HttpMethodSites.nameOf(HttpMethodSites.field(callee, 'property'));

    return (
      called !== undefined &&
      HttpMethodSites.SENDERS.has(called) &&
      keys.some((key) => HttpMethodSites.TARGET_KEYS.has(key))
    );
  }

  /** Whether an object literal is a route config or a request: by a sibling property, or by the call it is passed to. */
  static isRequest(object: unknown): boolean {
    const properties = HttpMethodSites.field(object, 'properties');
    const hasSibling =
      Array.isArray(properties) &&
      properties.some((property) => {
        const key = HttpMethodSites.nameOf(HttpMethodSites.field(property, 'key'));

        return key !== undefined && HttpMethodSites.REQUEST_KEYS.has(key);
      });

    if (hasSibling) {
      return true;
    }

    const parent = HttpMethodSites.field(object, 'parent');
    const callee = HttpMethodSites.field(parent, 'callee');
    const name = HttpMethodSites.nameOf(HttpMethodSites.field(callee, 'property') ?? callee);

    return name !== undefined && HttpMethodSites.REQUEST_CALLEE.test(name);
  }
}

/**
 * `@venizia/prefer-http-method`. An HTTP method written by hand (`method: 'get'`) is `HTTP.Methods.GET`
 * (`@venizia/ignis-helpers/common`). Read where the syntax says it is one: `method`, `verb` or `httpMethod` in a route
 * config or a request, and a variable or parameter of those names.
 *
 * The fix is offered for a string that is exactly the constant's value (lowercase), so what is sent does not change,
 * and for an uppercase one where the framework reads it (see `isFrameworkRead`). Anything else is reported only:
 * the constants are lowercase, and the platform `fetch` does not uppercase `patch`.
 *
 * It reads syntax only. Another client reached through `require`, a dynamic `import()` or a sub-path of its package
 * is not seen, and neither is a `send` on a client socket that carries a `path`: check the diff `--fix` makes. It applies in a project that depends on an IGNIS
 * package. `source` is where `HTTP` is imported from; `null` turns the import, and so the fix, off.
 */
export class PreferHttpMethodRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/prefer-http-method`;

  static readonly DEFAULT_SOURCE = '@venizia/ignis-helpers/common';

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [
        {
          type: 'object',
          properties: { source: { type: ['string', 'null'] } },
          additionalProperties: false,
        },
      ],
      messages: {
        constant:
          "Write `HTTP.Methods.{{member}}`, not `'{{written}}'`: `import { HTTP } from '{{source}}';`",
        spelling:
          "Write `HTTP.Methods.{{member}}`, not `'{{written}}'`: `import { HTTP } from '{{source}}';` The constant is lowercase: the framework's fetchers send it uppercased, a plain `fetch` sends `patch` as written, so uppercase it there.",
      },
    },
    create: (context) => {
      const manifest = FrameworkExports.manifestFor({ directory: dirname(context.filename) });
      const isIgnis = manifest?.dependencies.some((name) => name.startsWith('@venizia/ignis'));

      if (isIgnis !== true) {
        return {};
      }

      const configured = AstNode.readField({ node: context.options[0], key: 'source' });
      const source =
        typeof configured === 'string' ? configured : PreferHttpMethodRule.DEFAULT_SOURCE;
      // A package does not import itself by name.
      const isOwner = source.startsWith(`${manifest?.name}/`);

      const check = (value: unknown, opts: { isFrameworkRead: boolean }) => {
        for (const node of HttpMethodSites.literalsOf(value)) {
          const written = HttpMethodSites.field(node, 'value');

          if (
            typeof written !== 'string' ||
            !HttpMethodSites.VERB.test(written) ||
            !AstNode.isNode(node)
          ) {
            continue;
          }

          const member = written.toUpperCase();
          const isExact = written === written.toLowerCase();

          context.report({
            node,
            messageId: isExact ? 'constant' : 'spelling',
            data: { member, written, source },
            fix: (fixer) => {
              // An uppercase spelling is rewritten only where the framework sends it: a plain `fetch` sends the value.
              const isSafe = isExact || (written === member && opts.isFrameworkRead);

              if (!isSafe || isOwner || configured === null) {
                return null;
              }

              const imports = ImportSupport.ensure({
                context,
                fixer,
                name: 'HTTP',
                source,
                isType: false,
              });
              const local =
                ImportSupport.importedAs({ context, name: 'HTTP', asValue: true }) ?? 'HTTP';

              return imports
                ? [
                    fixer.replaceText(HttpMethodSites.replaced(node), `${local}.Methods.${member}`),
                    ...imports,
                  ]
                : null;
            },
          });
        }
      };

      const checkNamed = (name: unknown, value: unknown, opts = { isFrameworkRead: false }) => {
        const held = HttpMethodSites.nameOf(name);

        if (held !== undefined && HttpMethodSites.NAMES.has(held)) {
          check(value, opts);
        }
      };

      return {
        [AstNodeTypes.PROPERTY]: (node: Rule.Node) => {
          const object = HttpMethodSites.field(node, 'parent');
          const isFrameworkRead = HttpMethodSites.isFrameworkRead({ object, context });

          if (isFrameworkRead || HttpMethodSites.isRequest(object)) {
            checkNamed(HttpMethodSites.field(node, 'key'), HttpMethodSites.field(node, 'value'), {
              isFrameworkRead,
            });
          }
        },
        [AstNodeTypes.VARIABLE_DECLARATOR]: (node: Rule.Node) => {
          checkNamed(HttpMethodSites.field(node, 'id'), HttpMethodSites.field(node, 'init'));
        },
        [AstNodeTypes.ASSIGNMENT_EXPRESSION]: (node: Rule.Node) => {
          checkNamed(HttpMethodSites.field(node, 'left'), HttpMethodSites.field(node, 'right'));
        },
        [AstNodeTypes.ASSIGNMENT_PATTERN]: (node: Rule.Node) => {
          checkNamed(HttpMethodSites.field(node, 'left'), HttpMethodSites.field(node, 'right'));
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity; source?: string | null } = {}): Linter.RuleEntry {
    const { severity = 'error', source } = opts;

    return source === undefined ? [severity] : [severity, { source }];
  }
}
