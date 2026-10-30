import { nodeType, readField } from './common';

const HOOK_NAME = /^use[A-Z]/;
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const CALLBACK_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/** The shared parts of the two hook rules: which call is a hook, and which argument is a function. */
export class HookSupport {
  /** `useX(...)` and `React.useX(...)`: the name the call is made through, or `undefined` when it is not a plain name. */
  static calleeName(opts: { call: unknown }): string | undefined {
    const callee = readField({ node: opts.call, key: 'callee' });
    const type = nodeType({ node: callee });

    if (type === 'Identifier') {
      const name = readField({ node: callee, key: 'name' });
      return typeof name === 'string' ? name : undefined;
    }

    if (type === 'MemberExpression' && readField({ node: callee, key: 'computed' }) === false) {
      const property = readField({ node: callee, key: 'property' });
      const name = readField({ node: property, key: 'name' });
      return nodeType({ node: property }) === 'Identifier' && typeof name === 'string'
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
    return CALLBACK_TYPES.has(nodeType({ node: opts.node }) ?? '');
  }

  static isAsync(opts: { node: unknown }): boolean {
    return HookSupport.isCallback(opts) && readField({ node: opts.node, key: 'async' }) === true;
  }
}
