import type { Rule, SourceCode } from 'eslint';
import { nodeType, readField } from './common';

const STATEMENT_LISTS = new Set(['BlockStatement', 'Program', 'StaticBlock', 'SwitchCase']);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
/** The child of a statement that runs exactly once, before anything else of that statement. */
const HEAD_FIELD: Record<string, string> = {
  IfStatement: 'test',
  SwitchStatement: 'discriminant',
  ForOfStatement: 'right',
  ForInStatement: 'right',
  ExpressionStatement: 'expression',
  ReturnStatement: 'argument',
  ThrowStatement: 'argument',
};
/** Nodes that evaluate to a value without doing anything else, so running them later or earlier changes nothing. */
const PURE_LEAVES = new Set([
  'Identifier',
  'Literal',
  'ThisExpression',
  'ArrowFunctionExpression',
  'FunctionExpression',
  'PrivateIdentifier',
]);
/** Wrappers whose parentheses around an `await` carry no meaning once the `await` is a name. */
const GROUPING_PARENTS = new Set([
  'MemberExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'UnaryExpression',
  'BinaryExpression',
  'SpreadElement',
  'ArrayExpression',
]);

/** The shared parts of the two `await` rules: where a statement can go before another, what may run first, fresh names. */
export class AwaitSupport {
  static parentOf(opts: { node: unknown }): unknown {
    return readField({ node: opts.node, key: 'parent' });
  }

  static rangeOf(opts: { node: unknown }): [number, number] | undefined {
    const range = readField({ node: opts.node, key: 'range' });
    return Array.isArray(range) && typeof range[0] === 'number' && typeof range[1] === 'number'
      ? [range[0], range[1]]
      : undefined;
  }

  /**
   * The statement that can take a `const` in front of it so that `awaitNode` is evaluated first, or `undefined`
   * when hoisting would change what runs: the `await` sits in a branch (`?:`, the right of `&&`, `||`, `??`),
   * in a loop test or update, in an unbraced `if` branch, in an optional chain, or in an arrow expression body.
   */
  static hoistTarget(opts: { awaitNode: unknown }): Rule.Node | undefined {
    let child: unknown = opts.awaitNode;
    let ancestor = AwaitSupport.parentOf({ node: child });

    while (ancestor) {
      const type = nodeType({ node: ancestor }) ?? '';

      if (FUNCTION_TYPES.has(type) || type === 'ChainExpression') {
        return undefined;
      }
      if (type === 'ConditionalExpression' && readField({ node: ancestor, key: 'test' }) !== child) {
        return undefined;
      }
      if (type === 'LogicalExpression' && readField({ node: ancestor, key: 'left' }) !== child) {
        return undefined;
      }
      if (
        type === 'AssignmentExpression' &&
        ['??=', '||=', '&&='].includes(String(readField({ node: ancestor, key: 'operator' }))) &&
        readField({ node: ancestor, key: 'right' }) === child
      ) {
        return undefined;
      }
      if (type.endsWith('Statement') || type === 'VariableDeclaration') {
        const head = HEAD_FIELD[type];
        const isHead = type === 'VariableDeclaration' || readField({ node: ancestor, key: head }) === child;
        const outer = AwaitSupport.parentOf({ node: ancestor });

        return isHead && STATEMENT_LISTS.has(nodeType({ node: outer }) ?? '') && (type === 'VariableDeclaration' || head !== undefined)
          ? (ancestor as Rule.Node)
          : undefined;
      }

      child = ancestor;
      ancestor = AwaitSupport.parentOf({ node: child });
    }

    return undefined;
  }

  static isPure(opts: { node: unknown }): boolean {
    const { node } = opts;
    const type = nodeType({ node }) ?? '';
    const pure = (child: unknown) => AwaitSupport.isPure({ node: child });
    const all = (key: string) => {
      const list = readField({ node, key });
      return Array.isArray(list) && list.every((entry) => entry === null || pure(entry));
    };

    if (PURE_LEAVES.has(type) || type.startsWith('TS') && !['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression'].includes(type)) {
      return true;
    }

    switch (type) {
      case 'TemplateLiteral':
        return all('expressions');
      case 'MemberExpression':
        return pure(readField({ node, key: 'object' })) && pure(readField({ node, key: 'property' }));
      case 'ArrayExpression':
        return all('elements');
      case 'ObjectExpression':
        return all('properties');
      case 'Property':
        return pure(readField({ node, key: 'key' })) && pure(readField({ node, key: 'value' }));
      case 'SpreadElement':
        return pure(readField({ node, key: 'argument' }));
      case 'UnaryExpression':
        return readField({ node, key: 'operator' }) !== 'delete' && pure(readField({ node, key: 'argument' }));
      case 'BinaryExpression':
      case 'LogicalExpression':
        return pure(readField({ node, key: 'left' })) && pure(readField({ node, key: 'right' }));
      case 'ConditionalExpression':
        return ['test', 'consequent', 'alternate'].every((key) => pure(readField({ node, key })));
      case 'TSAsExpression':
      case 'TSNonNullExpression':
      case 'TSSatisfiesExpression':
        return pure(readField({ node, key: 'expression' }));
      default:
        return false;
    }
  }

  /**
   * Whether something that does more than read a value runs, inside `statement`, before `awaitNode` does.
   * Hoisting the `await` in front of the statement would then run it first.
   */
  static hasEffectBefore(opts: {
    statement: Rule.Node;
    awaitNode: unknown;
    sourceCode: SourceCode;
  }): boolean {
    const target = AwaitSupport.rangeOf({ node: opts.awaitNode });
    if (!target) {
      return true;
    }

    const visit = (node: unknown): boolean => {
      const range = AwaitSupport.rangeOf({ node });
      if (!range) {
        return false;
      }
      if (range[0] <= target[0] && target[1] <= range[1]) {
        const keys = opts.sourceCode.visitorKeys[nodeType({ node }) ?? ''] ?? [];

        return keys.some((key) => {
          const value = readField({ node, key });
          const entries = Array.isArray(value) ? value : [value];

          return entries.some((entry) => entry && entry !== opts.awaitNode && visit(entry));
        });
      }

      return range[1] <= target[0] && !AwaitSupport.isPure({ node });
    };

    return visit(opts.statement);
  }

  /** The leading whitespace of the line a node starts on. */
  static indentOf(opts: { node: Rule.Node; sourceCode: SourceCode }): string {
    const line = opts.sourceCode.lines[(opts.node.loc?.start.line ?? 1) - 1] ?? '';
    return /^\s*/.exec(line)?.[0] ?? '';
  }

  /** The nearest function or the program that holds `node`: the scope a new name must be free in. */
  static scopeNodeOf(opts: { node: unknown }): Rule.Node {
    let current = opts.node;
    let parent = AwaitSupport.parentOf({ node: current });

    while (parent && !FUNCTION_TYPES.has(nodeType({ node: parent }) ?? '')) {
      current = parent;
      parent = AwaitSupport.parentOf({ node: current });
    }

    return (parent ?? current) as Rule.Node;
  }

  /**
   * `base`, or `base2`, `base3`... the first word that does not appear in the function (or program) holding `node`
   * and that this lint pass has not handed out already: two fixes of one pass must not declare the same name.
   */
  static freshName(opts: {
    node: unknown;
    base: string;
    sourceCode: SourceCode;
    taken: Map<unknown, Set<string>>;
  }): string {
    const scope = AwaitSupport.scopeNodeOf({ node: opts.node });
    const text = opts.sourceCode.getText(scope);
    const reserved = opts.taken.get(scope) ?? new Set<string>();

    for (let index = 1; ; index += 1) {
      const candidate = index === 1 ? opts.base : `${opts.base}${index}`;
      if (!reserved.has(candidate) && !new RegExp(`\\b${candidate}\\b`).test(text)) {
        reserved.add(candidate);
        opts.taken.set(scope, reserved);

        return candidate;
      }
    }
  }

  /**
   * The range to replace with the name that stands for an `await`: the `await` itself, widened over the parentheses
   * around it when they only grouped it (`(await f()).x`, `!(await f())`).
   */
  static replaceRangeOf(opts: { awaitNode: Rule.Node; sourceCode: SourceCode }): [number, number] {
    const { awaitNode, sourceCode } = opts;
    const before = sourceCode.getTokenBefore(awaitNode);
    const after = sourceCode.getTokenAfter(awaitNode);
    const parentType = nodeType({ node: AwaitSupport.parentOf({ node: awaitNode }) }) ?? '';
    const callee =
      parentType === 'CallExpression' &&
      readField({ node: AwaitSupport.parentOf({ node: awaitNode }), key: 'callee' }) === awaitNode;

    if (
      before?.value === '(' &&
      after?.value === ')' &&
      (GROUPING_PARENTS.has(parentType) || callee)
    ) {
      return [before.range[0], after.range[1]];
    }

    return [awaitNode.range?.[0] ?? 0, awaitNode.range?.[1] ?? 0];
  }
}
