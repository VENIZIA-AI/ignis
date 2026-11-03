import { AstNode } from './common';

const CHAIN_METHODS = new Set(['then', 'catch', 'finally']);
/** Wrappers that leave the value of the expression they hold unchanged: `x!`, `x as T`, `x satisfies T`, `<T>x`, `a?.b`. */
const VALUE_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);
const CONSTANT_UNARY_OPERATORS = new Set(['-', '+', '!', 'void']);

/** The shared parts of the promise chain rules: what a chain call is, what a constant is, what a silent handler body is. */
export class PromiseChainSupport {
  /** `node` without the wrappers that do not change its value (`!`, `as`, `satisfies`, `<T>`, an optional chain). */
  static unwrap(opts: { node: unknown }): unknown {
    let current = opts.node;

    while (VALUE_WRAPPERS.has(AstNode.getType({ node: current }) ?? '')) {
      current = AstNode.readField({ node: current, key: 'expression' });
    }

    return current;
  }

  /** The name a member access reads: `a.name`, `a['name']`, ``a[`name`]``; `undefined` for a computed key. */
  static memberName(opts: { member: unknown }): string | undefined {
    const { member } = opts;
    const property = AstNode.readField({ node: member, key: 'property' });

    if (AstNode.readField({ node: member, key: 'computed' }) !== true) {
      const name = AstNode.readField({ node: property, key: 'name' });
      return typeof name === 'string' ? name : undefined;
    }

    if (AstNode.getType({ node: property }) === 'Literal') {
      const value = AstNode.readField({ node: property, key: 'value' });
      return typeof value === 'string' ? value : undefined;
    }

    const expressions = AstNode.readField({ node: property, key: 'expressions' });
    const quasis = AstNode.readField({ node: property, key: 'quasis' });
    if (
      AstNode.getType({ node: property }) === 'TemplateLiteral' &&
      Array.isArray(expressions) &&
      expressions.length === 0 &&
      Array.isArray(quasis)
    ) {
      const cooked = AstNode.readField({
        node: AstNode.readField({ node: quasis[0], key: 'value' }),
        key: 'cooked',
      });
      return typeof cooked === 'string' ? cooked : undefined;
    }

    return undefined;
  }

  /**
   * `then`, `catch` or `finally` when `node` (after `unwrap`) is a call of that method - `p.then(f)`, `p?.catch(f)`,
   * `p['finally'](f)` - and `undefined` for anything else. It reads the syntax only, so a thenable counts too.
   */
  static chainMethodOf(opts: { node: unknown }): string | undefined {
    const call = PromiseChainSupport.unwrap({ node: opts.node });
    if (AstNode.getType({ node: call }) !== 'CallExpression') {
      return undefined;
    }

    const callee = PromiseChainSupport.unwrap({
      node: AstNode.readField({ node: call, key: 'callee' }),
    });
    if (AstNode.getType({ node: callee }) !== 'MemberExpression') {
      return undefined;
    }

    const name = PromiseChainSupport.memberName({ member: callee });
    return name !== undefined && CHAIN_METHODS.has(name) ? name : undefined;
  }

  /**
   * Whether a chain call (`.then`, `.catch`, `.finally`) sits anywhere on the spine of `node`: the receivers and
   * callees a call chain is built from (`a.then(f).limit(1)` has one, `a.where(x).limit(1)` has none).
   */
  static hasChainOnSpine(opts: { node: unknown }): boolean {
    let current = PromiseChainSupport.unwrap({ node: opts.node });

    for (;;) {
      const type = AstNode.getType({ node: current });

      if (type === 'CallExpression') {
        if (PromiseChainSupport.chainMethodOf({ node: current }) !== undefined) {
          return true;
        }
        current = PromiseChainSupport.unwrap({
          node: AstNode.readField({ node: current, key: 'callee' }),
        });
        continue;
      }

      if (type === 'MemberExpression') {
        current = PromiseChainSupport.unwrap({
          node: AstNode.readField({ node: current, key: 'object' }),
        });
        continue;
      }

      return false;
    }
  }

  /**
   * A value that is the same every time and reads nothing: a literal, `undefined`, a template with no `${}`, `-1`,
   * `void 0`, and an array or object literal built only from those (`[]`, `{}`, `{ items: [] }`).
   */
  static isConstant(opts: { node: unknown }): boolean {
    const node = PromiseChainSupport.unwrapTypes({ node: opts.node });
    const type = AstNode.getType({ node }) ?? '';
    const constant = (child: unknown) => PromiseChainSupport.isConstant({ node: child });

    switch (type) {
      case 'Literal': {
        return true;
      }
      case 'Identifier': {
        return AstNode.readField({ node, key: 'name' }) === 'undefined';
      }
      case 'TemplateLiteral': {
        const expressions = AstNode.readField({ node, key: 'expressions' });
        return Array.isArray(expressions) && expressions.length === 0;
      }
      case 'UnaryExpression': {
        return (
          CONSTANT_UNARY_OPERATORS.has(String(AstNode.readField({ node, key: 'operator' }))) &&
          constant(AstNode.readField({ node, key: 'argument' }))
        );
      }
      case 'ArrayExpression': {
        const elements = AstNode.readField({ node, key: 'elements' });
        return (
          Array.isArray(elements) &&
          elements.every((element) => element === null || constant(element))
        );
      }
      case 'ObjectExpression': {
        const properties = AstNode.readField({ node, key: 'properties' });
        return (
          Array.isArray(properties) &&
          properties.every(
            (property) =>
              AstNode.getType({ node: property }) === 'Property' &&
              AstNode.readField({ node: property, key: 'computed' }) !== true &&
              AstNode.readField({ node: property, key: 'method' }) !== true &&
              AstNode.readField({ node: property, key: 'kind' }) === 'init' &&
              constant(AstNode.readField({ node: property, key: 'value' })),
          )
        );
      }
      default: {
        return false;
      }
    }
  }

  /**
   * Whether the statements of a handler or a `catch` block leave no trace of the error: none at all (a comment does
   * not count), or only `return;`, `return <constant>;` and `<name or member> = <constant>;`. Anything else - a
   * call, a `throw`, a read of a variable - is a decision someone made, and counts as handled.
   */
  static isSilentBlock(opts: { statements: unknown }): boolean {
    const { statements } = opts;

    return (
      Array.isArray(statements) &&
      statements.every((statement) => {
        const type = AstNode.getType({ node: statement });

        if (type === 'EmptyStatement') {
          return true;
        }

        if (type === 'ReturnStatement') {
          const argument = AstNode.readField({ node: statement, key: 'argument' });
          return argument === null || PromiseChainSupport.isConstant({ node: argument });
        }

        const expression = AstNode.readField({ node: statement, key: 'expression' });
        return (
          type === 'ExpressionStatement' &&
          AstNode.getType({ node: expression }) === 'AssignmentExpression' &&
          AstNode.readField({ node: expression, key: 'operator' }) === '=' &&
          PromiseChainSupport.isPlainTarget({
            node: AstNode.readField({ node: expression, key: 'left' }),
          }) &&
          PromiseChainSupport.isConstant({
            node: AstNode.readField({ node: expression, key: 'right' }),
          })
        );
      })
    );
  }

  /** `name`, `this.name`, `a.b.c`: an assignment target that reads no computed key and calls nothing. */
  static isPlainTarget(opts: { node: unknown }): boolean {
    const { node } = opts;
    const type = AstNode.getType({ node });

    if (type === 'Identifier' || type === 'ThisExpression') {
      return true;
    }

    return (
      type === 'MemberExpression' &&
      AstNode.readField({ node, key: 'computed' }) !== true &&
      PromiseChainSupport.isPlainTarget({ node: AstNode.readField({ node, key: 'object' }) })
    );
  }

  /** `node` without the type-only wrappers (`as`, `satisfies`, `!`, `<T>`), keeping an optional chain. */
  static unwrapTypes(opts: { node: unknown }): unknown {
    let current = opts.node;

    while (
      VALUE_WRAPPERS.has(AstNode.getType({ node: current }) ?? '') &&
      AstNode.getType({ node: current }) !== 'ChainExpression'
    ) {
      current = AstNode.readField({ node: current, key: 'expression' });
    }

    return current;
  }
}
