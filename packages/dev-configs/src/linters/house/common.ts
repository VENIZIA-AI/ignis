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
  static readonly CATCH_CLAUSE = 'CatchClause';
  static readonly SWITCH_CASE = 'SwitchCase';
  static readonly BLOCK_STATEMENT = 'BlockStatement';
  static readonly ARRAY_EXPRESSION = 'ArrayExpression';
  static readonly AS_EXPRESSION = 'TSAsExpression';
  static readonly ASSIGNMENT_EXPRESSION = 'AssignmentExpression';
  static readonly BINARY_EXPRESSION = 'BinaryExpression';
  static readonly CHAIN_EXPRESSION = 'ChainExpression';
  static readonly CONDITIONAL_EXPRESSION = 'ConditionalExpression';
  static readonly EMPTY_STATEMENT = 'EmptyStatement';
  static readonly EXPORT_DEFAULT_DECLARATION = 'ExportDefaultDeclaration';
  static readonly EXPORT_SPECIFIER = 'ExportSpecifier';
  static readonly EXPRESSION_STATEMENT = 'ExpressionStatement';
  static readonly IDENTIFIER = 'Identifier';
  static readonly JSX_ATTRIBUTE = 'JSXAttribute';
  static readonly JSX_ELEMENT = 'JSXElement';
  static readonly JSX_EXPRESSION_CONTAINER = 'JSXExpressionContainer';
  static readonly JSX_FRAGMENT = 'JSXFragment';
  static readonly LITERAL = 'Literal';
  static readonly LITERAL_TYPE = 'TSLiteralType';
  static readonly LOGICAL_EXPRESSION = 'LogicalExpression';
  static readonly MAPPED_TYPE = 'TSMappedType';
  static readonly MEMBER_EXPRESSION = 'MemberExpression';
  static readonly METHOD_DEFINITION = 'MethodDefinition';
  static readonly NON_NULL_EXPRESSION = 'TSNonNullExpression';
  static readonly NULL_KEYWORD = 'TSNullKeyword';
  static readonly OBJECT_EXPRESSION = 'ObjectExpression';
  static readonly PRIVATE_IDENTIFIER = 'PrivateIdentifier';
  static readonly PROGRAM = 'Program';
  static readonly PROPERTY = 'Property';
  static readonly SATISFIES_EXPRESSION = 'TSSatisfiesExpression';
  static readonly SEQUENCE_EXPRESSION = 'SequenceExpression';
  static readonly SPREAD_ELEMENT = 'SpreadElement';
  static readonly STATIC_BLOCK = 'StaticBlock';
  static readonly TEMPLATE_LITERAL = 'TemplateLiteral';
  static readonly THIS_EXPRESSION = 'ThisExpression';
  static readonly TRY_STATEMENT = 'TryStatement';
  static readonly TYPE_ALIAS_DECLARATION = 'TSTypeAliasDeclaration';
  static readonly TYPE_ASSERTION = 'TSTypeAssertion';
  static readonly TYPE_PARAMETER_INSTANTIATION = 'TSTypeParameterInstantiation';
  static readonly TYPE_QUERY = 'TSTypeQuery';
  static readonly TYPE_REFERENCE = 'TSTypeReference';
  static readonly UNARY_EXPRESSION = 'UnaryExpression';
  static readonly UNDEFINED_KEYWORD = 'TSUndefinedKeyword';
  static readonly VARIABLE_DECLARATION = 'VariableDeclaration';
  static readonly VARIABLE_DECLARATOR = 'VariableDeclarator';
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
