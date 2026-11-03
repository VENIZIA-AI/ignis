import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

const HOOK_NAME = /^use[A-Z]/;
const CALL_TYPES = new Set(['CallExpression', 'NewExpression']);

const isArrayContaining = (opts: { list: unknown; item: unknown }) =>
  Array.isArray(opts.list) && opts.list.includes(opts.item);

/** `useX(...)`: a hook's callback is ours, so it counts. */
const isHookCall = (call: unknown) => {
  const callee = AstNode.readField({ node: call, key: 'callee' });
  const name = AstNode.readField({ node: callee, key: 'name' });
  return (
    AstNode.getType({ node: callee }) === 'Identifier' &&
    typeof name === 'string' &&
    HOOK_NAME.test(name)
  );
};

/** `node` is an argument of a call or `new` that is not a hook. */
const isLibraryArgument = (opts: { node: unknown; parent: unknown }) =>
  CALL_TYPES.has(AstNode.getType({ node: opts.parent }) ?? '') &&
  isArrayContaining({
    list: AstNode.readField({ node: opts.parent, key: 'arguments' }),
    item: opts.node,
  }) &&
  !isHookCall(opts.parent);

/**
 * An object literal whose shape something else declares: a typed variable, `satisfies`, or an argument
 * of a non-hook call (a library option bag). A nested literal inherits it.
 */
const hasDeclaredShape = (object: unknown): boolean => {
  let current = object;

  while (current) {
    const parent = AstNode.readField({ node: current, key: 'parent' });
    const parentType = AstNode.getType({ node: parent });
    const isTypedVariable =
      parentType === 'VariableDeclarator' &&
      Boolean(
        AstNode.readField({
          node: AstNode.readField({ node: parent, key: 'id' }),
          key: 'typeAnnotation',
        }),
      );

    if (
      isTypedVariable ||
      parentType === 'TSSatisfiesExpression' ||
      isLibraryArgument({ node: current, parent })
    ) {
      return true;
    }

    const isNestedValue =
      parentType === 'Property' && AstNode.readField({ node: parent, key: 'value' }) === current;
    current = isNestedValue ? AstNode.readField({ node: parent, key: 'parent' }) : undefined;
  }

  return false;
};

/**
 * `venizia/max-params-own`. A function we write takes at most `max` (default 5) positional parameters;
 * beyond that it takes one options object. A signature that belongs to someone else is not counted: an
 * inline callback handed to a call (map, reduce, sort, a library handler) or to a JSX prop, a function a
 * declared type fixes (`const x: TFn = (...)`, a member of a typed or `satisfies` object), and a
 * constructor whose every parameter is injected (`@inject`). A hook's callback (`useCallback(...)`) is ours.
 */
export class MaxParamsOwnRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/max-params-own`;

  static readonly DEFAULT_MAX = 5;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      schema: [{ type: 'integer', minimum: 0 }],
      messages: {
        tooMany:
          'A function we write takes up to {{max}} positional parameters, not {{count}}: take one options object.',
      },
    },
    create: (context) => {
      const max =
        typeof context.options[0] === 'number' ? context.options[0] : MaxParamsOwnRule.DEFAULT_MAX;

      const isCallback = (node: Rule.Node) => {
        const parent = node.parent;
        const isJsxProp =
          AstNode.getType({ node: parent }) === 'JSXExpressionContainer' &&
          AstNode.getType({ node: AstNode.readField({ node: parent, key: 'parent' }) }) ===
            'JSXAttribute';
        return isJsxProp || isLibraryArgument({ node, parent });
      };

      const isInjectedConstructor = (opts: { node: Rule.Node; params: unknown[] }) => {
        const parent = opts.node.parent;
        const isDecorated = (param: unknown) => {
          const own = AstNode.readField({ node: param, key: 'decorators' });
          const property = AstNode.readField({
            node: AstNode.readField({ node: param, key: 'parameter' }),
            key: 'decorators',
          });
          return (
            (Array.isArray(own) && own.length > 0) ||
            (Array.isArray(property) && property.length > 0)
          );
        };

        return (
          AstNode.getType({ node: parent }) === 'MethodDefinition' &&
          AstNode.readField({ node: parent, key: 'kind' }) === 'constructor' &&
          opts.params.every(isDecorated)
        );
      };

      const isTypedByContext = (node: Rule.Node) => {
        const parent = node.parent;
        const parentType = AstNode.getType({ node: parent });
        const isTypedInit =
          parentType === 'VariableDeclarator' &&
          AstNode.readField({ node: parent, key: 'init' }) === node &&
          Boolean(
            AstNode.readField({
              node: AstNode.readField({ node: parent, key: 'id' }),
              key: 'typeAnnotation',
            }),
          );
        const grandParent = AstNode.readField({ node: parent, key: 'parent' });
        const isMember =
          parentType === 'Property' &&
          AstNode.readField({ node: parent, key: 'value' }) === node &&
          AstNode.getType({ node: grandParent }) === 'ObjectExpression';

        return isTypedInit || (isMember && hasDeclaredShape(grandParent));
      };

      const check = (node: Rule.Node) => {
        const params = AstNode.readField({ node, key: 'params' });
        if (!Array.isArray(params) || params.length <= max) {
          return;
        }

        if (isCallback(node) || isInjectedConstructor({ node, params }) || isTypedByContext(node)) {
          return;
        }

        context.report({
          node,
          messageId: 'tooMany',
          data: { count: String(params.length), max: String(max) },
        });
      };

      return {
        [AstNodeTypes.FUNCTION_DECLARATION]: check,
        [AstNodeTypes.FUNCTION_EXPRESSION]: check,
        [AstNodeTypes.ARROW_FUNCTION_EXPRESSION]: check,
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity; max?: number } = {}): Linter.RuleEntry {
    const { severity = 'error', max = MaxParamsOwnRule.DEFAULT_MAX } = opts;
    return [severity, max];
  }
}
