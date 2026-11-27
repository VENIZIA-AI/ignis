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

  /** A call that takes a request init: `fetch`, `fetchFn`, `new Request`. */
  static readonly REQUEST_CALLEE = /fetch|^Request$/i;

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
 * The fix is offered only for a string that is exactly the constant's value (lowercase), so what is sent does not
 * change. Another spelling is reported only: the constants are lowercase, the framework's fetchers send a method
 * uppercased, and the platform `fetch` does not uppercase `patch`. It applies in a project that depends on an IGNIS
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

      const check = (value: unknown) => {
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
              if (!isExact || isOwner || configured === null) {
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
                ? [fixer.replaceText(node, `${local}.Methods.${member}`), ...imports]
                : null;
            },
          });
        }
      };

      const checkNamed = (name: unknown, value: unknown) => {
        const held = HttpMethodSites.nameOf(name);

        if (held !== undefined && HttpMethodSites.NAMES.has(held)) {
          check(value);
        }
      };

      return {
        [AstNodeTypes.PROPERTY]: (node: Rule.Node) => {
          if (HttpMethodSites.isRequest(HttpMethodSites.field(node, 'parent'))) {
            checkNamed(HttpMethodSites.field(node, 'key'), HttpMethodSites.field(node, 'value'));
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
