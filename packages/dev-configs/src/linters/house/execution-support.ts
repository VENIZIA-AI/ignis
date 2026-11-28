import type { Rule, Scope } from 'eslint';
import { AstNode, AstNodeTypes } from './common';

/** What an options object says about one key, as far as the syntax shows. */
export interface IExecutionOption {
  /** The value last written for the key, when one is. */
  value?: Rule.Node;
  /** A spread or a computed key after it may supply or replace the value. */
  isUnknown: boolean;
}

/**
 * Reads the code that says who is running (`Execution`, `ExecutionFrames`, `ExecutionModes`) for the house rules.
 * A name counts only when it is bound by an import from `@venizia/ignis`, `@venizia/ignis-helpers` or a sub-path of
 * them, under an alias or a namespace too. A re-export of the application's own is not followed.
 */
export class ExecutionSupport {
  private static readonly PACKAGES = ['@venizia/ignis', '@venizia/ignis-helpers'];

  /** The syntax around an expression that does not change which value it is. */
  private static readonly WRAPPERS: ReadonlySet<string> = new Set([
    AstNodeTypes.AS_EXPRESSION,
    AstNodeTypes.SATISFIES_EXPRESSION,
    AstNodeTypes.NON_NULL_EXPRESSION,
    AstNodeTypes.CHAIN_EXPRESSION,
  ]);

  /** The node a field holds, or `undefined` for anything else. */
  static child(opts: { node: unknown; key: string }): Rule.Node | undefined {
    const value = AstNode.readField(opts);

    return AstNode.isNode(value) ? value : undefined;
  }

  /** The nodes a field holds; empty for anything that is not a list. */
  static list(opts: { node: unknown; key: string }): Rule.Node[] {
    const value: unknown = AstNode.readField(opts);

    return Array.isArray(value) ? value.filter((item) => AstNode.isNode(item)) : [];
  }

  /** The expression without the type wrappers and the optional chain around it. */
  static unwrap(opts: { node: Rule.Node | undefined }): Rule.Node | undefined {
    const { node } = opts;

    return node && ExecutionSupport.WRAPPERS.has(node.type)
      ? ExecutionSupport.unwrap({
          node: ExecutionSupport.child({ node, key: 'expression' }),
        })
      : node;
  }

  /** The name an identifier or a string literal writes. */
  private static textOf(opts: { node: unknown }): string | undefined {
    const { node } = opts;
    const name = AstNode.readField({ node, key: 'name' });
    const value = AstNode.readField({ node, key: 'value' });
    const text = name ?? value;

    return typeof text === 'string' ? text : undefined;
  }

  /** The name a member expression or a property reads: `a.run`, `a['run']`, `{ run }`. */
  static keyOf(opts: { node: unknown; key: string }): string | undefined {
    const written = AstNode.readField(opts);
    const isComputed = AstNode.readField({ node: opts.node, key: 'computed' }) === true;

    if (isComputed && AstNode.getType({ node: written }) !== AstNodeTypes.LITERAL) {
      return undefined;
    }

    return ExecutionSupport.textOf({ node: written });
  }

  /** The variable the identifier `node` refers to. */
  static variableOf(opts: {
    context: Rule.RuleContext;
    node: Rule.Node;
  }): Scope.Variable | undefined {
    const { context, node } = opts;
    const name = ExecutionSupport.textOf({ node });
    let scope: Scope.Scope | null = context.sourceCode.getScope(node);

    while (scope && name !== undefined) {
      const variable = scope.set.get(name);

      if (variable) {
        return variable;
      }

      scope = scope.upper;
    }

    return undefined;
  }

  /** The import that binds the identifier `node`, when it is a value import from the framework. */
  private static importOf(opts: { context: Rule.RuleContext; node: Rule.Node }): unknown {
    const definition: unknown = ExecutionSupport.variableOf(opts)?.defs[0];

    if (AstNode.readField({ node: definition, key: 'type' }) !== 'ImportBinding') {
      return undefined;
    }

    const specifier = AstNode.readField({ node: definition, key: 'node' });
    const declaration = AstNode.readField({ node: definition, key: 'parent' });
    const source = ExecutionSupport.textOf({
      node: AstNode.readField({ node: declaration, key: 'source' }),
    });
    const isFramework = ExecutionSupport.PACKAGES.some(
      (name) => source === name || source?.startsWith(`${name}/`) === true,
    );
    const isType = [specifier, declaration].some(
      (item) => AstNode.readField({ node: item, key: 'importKind' }) === 'type',
    );

    return isFramework && !isType ? specifier : undefined;
  }

  /** The framework export an expression denotes (`Alias`, `namespace.Execution`), or `undefined`. */
  static exportOf(opts: {
    context: Rule.RuleContext;
    node: Rule.Node | undefined;
  }): string | undefined {
    const { context } = opts;
    const node = ExecutionSupport.unwrap({ node: opts.node });

    if (node?.type === AstNodeTypes.IDENTIFIER) {
      const specifier = ExecutionSupport.importOf({ context, node });

      return AstNode.getType({ node: specifier }) === AstNodeTypes.IMPORT_SPECIFIER
        ? ExecutionSupport.textOf({
            node: AstNode.readField({ node: specifier, key: 'imported' }),
          })
        : undefined;
    }

    if (node?.type !== AstNodeTypes.MEMBER_EXPRESSION) {
      return undefined;
    }

    const object = ExecutionSupport.child({ node, key: 'object' });

    if (object?.type !== AstNodeTypes.IDENTIFIER) {
      return undefined;
    }

    const specifier = ExecutionSupport.importOf({ context, node: object });

    return AstNode.getType({ node: specifier }) === 'ImportNamespaceSpecifier'
      ? ExecutionSupport.keyOf({ node, key: 'property' })
      : undefined;
  }

  /** What the object literal `object` says about `name`, read in the order the properties are written. */
  static optionOf(opts: { object: Rule.Node; name: string }): IExecutionOption {
    const { object, name } = opts;
    let option: IExecutionOption = { isUnknown: false };

    for (const property of ExecutionSupport.list({ node: object, key: 'properties' })) {
      const key =
        property.type === AstNodeTypes.PROPERTY
          ? ExecutionSupport.keyOf({ node: property, key: 'key' })
          : undefined;

      if (key === undefined) {
        option = { value: option.value, isUnknown: true };
        continue;
      }

      if (key === name) {
        option = {
          value: ExecutionSupport.child({ node: property, key: 'value' }),
          isUnknown: false,
        };
      }
    }

    return option;
  }

  /** Whether the options object writes a system mode: `ExecutionModes.SYSTEM` or `'system'`. */
  static isSystemRun(opts: { context: Rule.RuleContext; object: Rule.Node }): boolean {
    const { context, object } = opts;
    const mode = ExecutionSupport.unwrap({
      node: ExecutionSupport.optionOf({ object, name: 'mode' }).value,
    });

    if (mode?.type === AstNodeTypes.LITERAL) {
      return ExecutionSupport.textOf({ node: mode }) === 'system';
    }

    return (
      mode?.type === AstNodeTypes.MEMBER_EXPRESSION &&
      ExecutionSupport.keyOf({ node: mode, key: 'property' }) === 'SYSTEM' &&
      ExecutionSupport.exportOf({
        context,
        node: ExecutionSupport.child({ node: mode, key: 'object' }),
      }) === 'ExecutionModes'
    );
  }
}
