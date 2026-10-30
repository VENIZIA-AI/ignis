/** The estree node types the house rules visit - computed visitor keys, so the names stay PascalCase as ESLint needs them. */
export class AstNodeTypes {
  static readonly NEW_EXPRESSION = 'NewExpression';
  static readonly CALL_EXPRESSION = 'CallExpression';
  static readonly FUNCTION_DECLARATION = 'FunctionDeclaration';
  static readonly FUNCTION_EXPRESSION = 'FunctionExpression';
  static readonly ARROW_FUNCTION_EXPRESSION = 'ArrowFunctionExpression';
  static readonly EXPORT_NAMED_DECLARATION = 'ExportNamedDeclaration';
  static readonly UNION_TYPE = 'TSUnionType';
  static readonly AWAIT_EXPRESSION = 'AwaitExpression';
  static readonly RETURN_STATEMENT = 'ReturnStatement';
}

/** The ESLint namespace the house rules live under: `venizia/<rule>`. */
export const HOUSE_PLUGIN_NAMESPACE = 'venizia';

/** Reads an AST node without trusting its type: TypeScript nodes carry fields estree does not declare. */
export class AstNode {
  /** A field of an AST node. */
  static readField(opts: { node: unknown; key: string }): unknown {
    const { node, key } = opts;
    return typeof node === 'object' && node !== null && key in node
      ? Reflect.get(node, key)
      : undefined;
  }

  /** The node's `type`, or `undefined` for anything that is not an AST node. */
  static getType(opts: { node: unknown }): string | undefined {
    const type = AstNode.readField({ node: opts.node, key: 'type' });
    return typeof type === 'string' ? type : undefined;
  }
}

/** @deprecated Use `AstNode.readField({ node, key })`. Removed in 0.5. */
export const readField = (opts: { node: unknown; key: string }): unknown => AstNode.readField(opts);

/** @deprecated Use `AstNode.getType({ node })`. Removed in 0.5. */
export const nodeType = (opts: { node: unknown }): string | undefined => AstNode.getType(opts);
