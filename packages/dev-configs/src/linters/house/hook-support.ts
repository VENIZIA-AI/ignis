import { AstNode } from './common';

const HOOK_NAME = /^use[A-Z]/;
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const CALLBACK_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/** The shared parts of the two hook rules: which call is a hook, and which argument is a function. */
export class HookSupport {
  /** `useX(...)` and `React.useX(...)`: the name the call is made through, or `undefined` when it is not a plain name. */
  static calleeName(opts: { call: unknown }): string | undefined {
    const callee = AstNode.readField({ node: opts.call, key: 'callee' });
    const type = AstNode.getType({ node: callee });

    if (type === 'Identifier') {
      const name = AstNode.readField({ node: callee, key: 'name' });
      return typeof name === 'string' ? name : undefined;
    }

    if (
      type === 'MemberExpression' &&
      AstNode.readField({ node: callee, key: 'computed' }) === false
    ) {
      const property = AstNode.readField({ node: callee, key: 'property' });
      const name = AstNode.readField({ node: property, key: 'name' });
      return AstNode.getType({ node: property }) === 'Identifier' && typeof name === 'string'
        ? name
        : undefined;
    }

    return undefined;
  }

  static isHook(opts: { name: string | undefined }): boolean {
    return opts.name !== undefined && HOOK_NAME.test(opts.name);
  }

  static isEffectHook(opts: { name: string | undefined }): boolean {
    return opts.name !== undefined && EFFECT_HOOKS.has(opts.name);
  }

  /** An arrow or a function expression: the two forms a hook callback is written in. */
  static isCallback(opts: { node: unknown }): boolean {
    return CALLBACK_TYPES.has(AstNode.getType({ node: opts.node }) ?? '');
  }

  static isAsync(opts: { node: unknown }): boolean {
    return (
      HookSupport.isCallback(opts) && AstNode.readField({ node: opts.node, key: 'async' }) === true
    );
  }

  /**
   * The async functions an argument hands over: the argument itself, a property value of an object literal
   * (`useMutation({ mutationFn: async () => {} })`, an async method too) and an element of an array literal, at any
   * depth of literals. It does not look inside a function: what a sync callback builds is not an argument.
   */
  static asyncFunctionsIn(opts: { node: unknown }): unknown[] {
    const { node } = opts;
    const type = AstNode.getType({ node });

    if (HookSupport.isAsync({ node })) {
      return [node];
    }

    if (type === 'ObjectExpression') {
      const properties = AstNode.readField({ node, key: 'properties' });

      return Array.isArray(properties)
        ? properties.flatMap((property) =>
            AstNode.getType({ node: property }) === 'Property'
              ? HookSupport.asyncFunctionsIn({
                  node: AstNode.readField({ node: property, key: 'value' }),
                })
              : [],
          )
        : [];
    }

    if (type === 'ArrayExpression') {
      const elements = AstNode.readField({ node, key: 'elements' });

      return Array.isArray(elements)
        ? elements.flatMap((element) => HookSupport.asyncFunctionsIn({ node: element }))
        : [];
    }

    return [];
  }
}
