import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/** A route a handler is written for, and the private method it hands its context to. */
interface IForward {
  config: string;
  method: string;
  node: Rule.Node;
}

/** What one class declares: the route each method's context is typed from, and the handlers that forward to a method. */
interface IClassFacts {
  typed: Map<string, string>;
  forwards: IForward[];
}

/** The bindings of one function: the root names it declares, and the paths among them that hold a typed context. */
interface IFrame {
  declared: Set<string>;
  typed: Set<string>;
}

/** The members of a route's AST this rule reads. */
class RouteNodes {
  static readonly CONTEXT_TYPE = 'TContextOf';
  static readonly CONFIG_TYPE = 'IAuthRouteConfig';
  static readonly DECORATORS: ReadonlySet<string> = new Set([
    'api',
    'get',
    'post',
    'put',
    'patch',
    'del',
  ]);

  static field(node: unknown, key: string): unknown {
    return AstNode.readField({ node, key });
  }

  static type(node: unknown): string | undefined {
    return AstNode.getType({ node });
  }

  static list(node: unknown, key: string): unknown[] {
    const value = RouteNodes.field(node, key);

    return Array.isArray(value) ? value : [];
  }

  static nameOf(node: unknown): string | undefined {
    const value = RouteNodes.field(node, 'name');

    return typeof value === 'string' ? value : undefined;
  }

  /** The type arguments written on a type reference or a call. */
  static typeArguments(node: unknown): unknown[] {
    return RouteNodes.list(
      RouteNodes.field(node, 'typeArguments') ?? RouteNodes.field(node, 'typeParameters'),
      'params',
    );
  }

  /** `a.b.c` of an expression, a qualified type name or an indexed access type; `undefined` for anything computed. */
  static chain(node: unknown): string | undefined {
    const type = RouteNodes.type(node);

    if (type === AstNodeTypes.IDENTIFIER) {
      return RouteNodes.nameOf(node);
    }

    if (type === AstNodeTypes.THIS_EXPRESSION) {
      return 'this';
    }

    const join = (left: unknown, right: string | undefined) => {
      const head = RouteNodes.chain(left);

      return head === undefined || right === undefined ? undefined : `${head}.${right}`;
    };

    const literal = (value: unknown) => (typeof value === 'string' ? value : undefined);

    if (type === AstNodeTypes.MEMBER_EXPRESSION) {
      const property = RouteNodes.field(node, 'property');
      const isComputed = RouteNodes.field(node, 'computed') === true;

      return join(
        RouteNodes.field(node, 'object'),
        isComputed ? literal(RouteNodes.field(property, 'value')) : RouteNodes.nameOf(property),
      );
    }

    if (type === 'TSQualifiedName') {
      return join(
        RouteNodes.field(node, 'left'),
        RouteNodes.nameOf(RouteNodes.field(node, 'right')),
      );
    }

    if (type === AstNodeTypes.TYPE_QUERY) {
      return RouteNodes.chain(RouteNodes.field(node, 'exprName'));
    }

    if (type === 'TSIndexedAccessType') {
      const index = RouteNodes.field(RouteNodes.field(node, 'indexType'), 'literal');

      return join(RouteNodes.field(node, 'objectType'), literal(RouteNodes.field(index, 'value')));
    }

    return undefined;
  }

  /** The value of the property `key` of an object expression. */
  static property(node: unknown, key: string): unknown {
    const found = RouteNodes.list(node, 'properties').find(
      (item) => RouteNodes.nameOf(RouteNodes.field(item, 'key')) === key,
    );

    return RouteNodes.field(found, 'value');
  }

  /** The type a pattern is annotated with. */
  static annotation(pattern: unknown): unknown {
    return RouteNodes.field(RouteNodes.field(pattern, 'typeAnnotation'), 'typeAnnotation');
  }

  static referenceName(node: unknown): string | undefined {
    return RouteNodes.type(node) === AstNodeTypes.TYPE_REFERENCE
      ? RouteNodes.nameOf(RouteNodes.field(node, 'typeName'))
      : undefined;
  }

  /** The `TContextOf<...>` a parameter carries, directly or as the `context` of its options, and the path it binds. */
  static contextOf(param: unknown): { path: string; config: string | undefined } | undefined {
    const annotation = RouteNodes.annotation(param);

    const read = (type: unknown, path: string | undefined) => {
      if (path === undefined || RouteNodes.referenceName(type) !== RouteNodes.CONTEXT_TYPE) {
        return undefined;
      }

      return { path, config: RouteNodes.chain(RouteNodes.typeArguments(type)[0]) };
    };

    if (RouteNodes.type(annotation) !== 'TSTypeLiteral') {
      return read(annotation, RouteNodes.nameOf(param));
    }

    const member = RouteNodes.list(annotation, 'members').find(
      (item) => RouteNodes.nameOf(RouteNodes.field(item, 'key')) === 'context',
    );
    const bound = RouteNodes.property(param, 'context');
    const holder = RouteNodes.nameOf(param);

    return read(
      RouteNodes.annotation(member),
      holder === undefined ? RouteNodes.nameOf(bound) : `${holder}.context`,
    );
  }

  /** The route config of a `defineRoute`, `defineJSXRoute` or `bindRoute().to` call whose options hold the handler. */
  static routeOf(call: unknown): { config: string | undefined } | undefined {
    const callee = RouteNodes.field(call, 'callee');
    const method = RouteNodes.nameOf(RouteNodes.field(callee, 'property'));
    const [first] = RouteNodes.list(call, 'arguments');

    if (method === 'defineRoute' || method === 'defineJSXRoute') {
      return { config: RouteNodes.chain(RouteNodes.property(first, 'configs')) };
    }

    const bound = RouteNodes.field(callee, 'object');
    const binder = RouteNodes.nameOf(
      RouteNodes.field(RouteNodes.field(bound, 'callee'), 'property'),
    );

    if (method !== 'to' || binder !== 'bindRoute') {
      return undefined;
    }

    const [options] = RouteNodes.list(bound, 'arguments');

    return { config: RouteNodes.chain(RouteNodes.property(options, 'configs')) };
  }

  /** The `this.<method>` a handler body passes its context straight to. */
  static forwardOf(handler: unknown, context: string): string | undefined {
    let body = RouteNodes.field(handler, 'body');

    if (RouteNodes.type(body) === AstNodeTypes.BLOCK_STATEMENT) {
      const statements = RouteNodes.list(body, 'body');
      body = statements.length === 1 ? RouteNodes.field(statements[0], 'argument') : undefined;
    }

    if (RouteNodes.type(body) === AstNodeTypes.AWAIT_EXPRESSION) {
      body = RouteNodes.field(body, 'argument');
    }

    const callee = RouteNodes.field(body, 'callee');

    if (RouteNodes.type(RouteNodes.field(callee, 'object')) !== AstNodeTypes.THIS_EXPRESSION) {
      return undefined;
    }

    const passes = RouteNodes.list(body, 'arguments').some(
      (argument) =>
        RouteNodes.nameOf(argument) === context ||
        RouteNodes.nameOf(RouteNodes.property(argument, 'context')) === context,
    );

    return passes ? RouteNodes.nameOf(RouteNodes.field(callee, 'property')) : undefined;
  }

  /** Whether a declared type is `IAuthRouteConfig`, alone, in an `Omit` or as the value of a `Record`. */
  static isWideConfig(type: unknown): boolean {
    const name = RouteNodes.referenceName(type);
    const [first, second] = RouteNodes.typeArguments(type);

    if (name === 'Record') {
      return RouteNodes.isWideConfig(second);
    }

    if (name === 'Readonly') {
      return RouteNodes.isWideConfig(first);
    }

    return name === 'Omit' ? RouteNodes.isWideConfig(first) : name === RouteNodes.CONFIG_TYPE;
  }
}

/**
 * `@venizia/typed-route-context`: reports what compiles and still leaves a route handler unchecked. It reads syntax
 * only, so a context passed on to another file, stored, or passed further than one method is not followed.
 *
 * - a route config object declared as `IAuthRouteConfig` (or in a `Record` of it) instead of `satisfies`;
 * - `valid<T>()` with a type argument on a context typed from its route;
 * - a decorated method whose `TContextOf` names another route than its decorator;
 * - a handler that passes its context straight to a method of the same class typed for another route.
 */
export class TypedRouteContextRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/typed-route-context`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        wideConfig:
          'Declared as `IAuthRouteConfig`, this config loses its schemas: write `{ ... } satisfies IAuthRouteConfig`.',
        typedValid:
          'This context is typed from its route: remove the type argument of `valid()`, which replaces the schema type.',
        otherRoute: 'This route is `{{expected}}`, and the context is typed from `{{actual}}`.',
        forwarded:
          'The route `{{expected}}` passes its context to `{{method}}`, which is typed from `{{actual}}`.',
      },
    },
    create: (context) => {
      const frames: IFrame[] = [];
      const classes: IClassFacts[] = [];

      const isTyped = (path: string): boolean => {
        const [root] = path.split('.');
        const owner = frames.findLast((frame) => frame.declared.has(root ?? ''));

        return owner?.typed.has(path) === true;
      };

      const enterFunction = (node: Rule.Node) => {
        const frame: IFrame = { declared: new Set(), typed: new Set() };
        const params = RouteNodes.list(node, 'params');

        for (const param of params) {
          const own = RouteNodes.nameOf(param);

          if (own !== undefined) {
            frame.declared.add(own);
          }

          for (const property of RouteNodes.list(param, 'properties')) {
            const bound = RouteNodes.nameOf(RouteNodes.field(property, 'value'));

            if (bound !== undefined) {
              frame.declared.add(bound);
            }
          }

          const typed = RouteNodes.contextOf(param);

          if (typed !== undefined) {
            frame.typed.add(typed.path);
          }
        }

        frames.push(frame);

        const property = RouteNodes.field(node, 'parent');
        const call = RouteNodes.field(RouteNodes.field(property, 'parent'), 'parent');
        const isHandler = RouteNodes.nameOf(RouteNodes.field(property, 'key')) === 'handler';
        const route = isHandler ? RouteNodes.routeOf(call) : undefined;
        const [first] = params;
        const name = RouteNodes.nameOf(first);

        if (route === undefined || name === undefined || RouteNodes.annotation(first)) {
          return;
        }

        frame.typed.add(name);
        const method = RouteNodes.forwardOf(node, name);

        if (method !== undefined && route.config !== undefined) {
          classes.at(-1)?.forwards.push({ config: route.config, method, node });
        }
      };

      const leaveFunction = () => {
        frames.pop();
      };

      /** An empty object is a collection filled later, with no literal schema to keep. */
      const isFilledObject = (value: unknown) =>
        RouteNodes.type(value) === AstNodeTypes.OBJECT_EXPRESSION &&
        RouteNodes.list(value, 'properties').length > 0;

      const checkDeclared = (opts: { node: Rule.Node; pattern: unknown; value: unknown }) => {
        // `{ ... } as const` under a wide annotation loses the schemas the same way. An `as` of a wide type is
        // reported at the assertion itself.
        const isAsserted = RouteNodes.type(opts.value) === AstNodeTypes.AS_EXPRESSION;
        const value = isAsserted ? RouteNodes.field(opts.value, 'expression') : opts.value;
        const isReportedThere =
          isAsserted && RouteNodes.isWideConfig(RouteNodes.field(opts.value, 'typeAnnotation'));

        if (
          !isReportedThere &&
          isFilledObject(value) &&
          RouteNodes.isWideConfig(RouteNodes.annotation(opts.pattern))
        ) {
          context.report({ node: opts.node, messageId: 'wideConfig' });
        }
      };

      return {
        [AstNodeTypes.FUNCTION_DECLARATION]: enterFunction,
        [AstNodeTypes.FUNCTION_EXPRESSION]: enterFunction,
        [AstNodeTypes.ARROW_FUNCTION_EXPRESSION]: enterFunction,
        [`${AstNodeTypes.FUNCTION_DECLARATION}:exit`]: leaveFunction,
        [`${AstNodeTypes.FUNCTION_EXPRESSION}:exit`]: leaveFunction,
        [`${AstNodeTypes.ARROW_FUNCTION_EXPRESSION}:exit`]: leaveFunction,
        [AstNodeTypes.CLASS_BODY]: () => {
          classes.push({ typed: new Map(), forwards: [] });
        },
        [`${AstNodeTypes.CLASS_BODY}:exit`]: () => {
          const facts = classes.pop();

          for (const { config, method, node } of facts?.forwards ?? []) {
            const actual = facts?.typed.get(method);

            if (actual !== undefined && actual !== config) {
              context.report({
                node,
                messageId: 'forwarded',
                data: { expected: config, method, actual },
              });
            }
          }
        },
        [AstNodeTypes.METHOD_DEFINITION]: (node: Rule.Node) => {
          const method = RouteNodes.nameOf(RouteNodes.field(node, 'key'));
          const typed = RouteNodes.list(RouteNodes.field(node, 'value'), 'params')
            .map((param) => RouteNodes.contextOf(param))
            .find((found) => found !== undefined);
          const actual = typed?.config;

          if (method === undefined || actual === undefined) {
            return;
          }

          classes.at(-1)?.typed.set(method, actual);

          for (const decorator of RouteNodes.list(node, 'decorators')) {
            const call = RouteNodes.field(decorator, 'expression');
            const name = RouteNodes.nameOf(RouteNodes.field(call, 'callee'));
            const [options] = RouteNodes.list(call, 'arguments');
            const expected = RouteNodes.chain(RouteNodes.property(options, 'configs'));

            if (
              name !== undefined &&
              RouteNodes.DECORATORS.has(name) &&
              expected !== undefined &&
              expected !== actual
            ) {
              context.report({ node, messageId: 'otherRoute', data: { expected, actual } });
            }
          }
        },
        [AstNodeTypes.VARIABLE_DECLARATOR]: (node: Rule.Node) => {
          const pattern = RouteNodes.field(node, 'id');
          const value = RouteNodes.field(node, 'init');
          checkDeclared({ node, pattern, value });

          const frame = frames.at(-1);

          if (!frame) {
            return;
          }

          const own = RouteNodes.nameOf(pattern);

          if (own !== undefined) {
            frame.declared.add(own);
          }

          const source = RouteNodes.chain(value);

          for (const property of RouteNodes.list(pattern, 'properties')) {
            const key = RouteNodes.nameOf(RouteNodes.field(property, 'key'));
            const bound = RouteNodes.nameOf(RouteNodes.field(property, 'value'));

            if (bound === undefined) {
              continue;
            }

            const holdsContext = source !== undefined && isTyped(`${source}.${key}`);
            frame.declared.add(bound);

            if (holdsContext) {
              frame.typed.add(bound);
            }
          }
        },
        [AstNodeTypes.AS_EXPRESSION]: (node: Rule.Node) => {
          if (
            isFilledObject(RouteNodes.field(node, 'expression')) &&
            RouteNodes.isWideConfig(RouteNodes.field(node, 'typeAnnotation'))
          ) {
            context.report({ node, messageId: 'wideConfig' });
          }
        },
        [AstNodeTypes.PROPERTY_DEFINITION]: (node: Rule.Node) => {
          checkDeclared({
            node,
            pattern: node,
            value: RouteNodes.field(node, 'value'),
          });
        },
        [AstNodeTypes.CALL_EXPRESSION]: (node: Rule.Node) => {
          const callee = RouteNodes.field(node, 'callee');
          const request = RouteNodes.field(callee, 'object');

          if (
            RouteNodes.nameOf(RouteNodes.field(callee, 'property')) !== 'valid' ||
            RouteNodes.nameOf(RouteNodes.field(request, 'property')) !== 'req' ||
            RouteNodes.typeArguments(node).length === 0
          ) {
            return;
          }

          const holder = RouteNodes.chain(RouteNodes.field(request, 'object'));

          if (holder !== undefined && isTyped(holder)) {
            context.report({ node, messageId: 'typedValid' });
          }
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): Linter.RuleEntry {
    const { severity = 'error' } = opts;

    return [severity];
  }
}
