import type { Rule, SourceCode } from 'eslint';
import { AstNode, AstNodeTypes } from './common';

const STATEMENT_LISTS = new Set([
  AstNodeTypes.BLOCK_STATEMENT,
  AstNodeTypes.PROGRAM,
  AstNodeTypes.STATIC_BLOCK,
  AstNodeTypes.SWITCH_CASE,
]);
const FUNCTION_TYPES = new Set([
  AstNodeTypes.FUNCTION_DECLARATION,
  AstNodeTypes.FUNCTION_EXPRESSION,
  AstNodeTypes.ARROW_FUNCTION_EXPRESSION,
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
  AstNodeTypes.IDENTIFIER,
  AstNodeTypes.LITERAL,
  AstNodeTypes.THIS_EXPRESSION,
  AstNodeTypes.ARROW_FUNCTION_EXPRESSION,
  AstNodeTypes.FUNCTION_EXPRESSION,
  AstNodeTypes.PRIVATE_IDENTIFIER,
]);
/** Wrappers whose parentheses around an `await` carry no meaning once the `await` is a name. */
const GROUPING_PARENTS = new Set([
  AstNodeTypes.MEMBER_EXPRESSION,
  AstNodeTypes.AS_EXPRESSION,
  AstNodeTypes.SATISFIES_EXPRESSION,
  AstNodeTypes.NON_NULL_EXPRESSION,
  AstNodeTypes.UNARY_EXPRESSION,
  AstNodeTypes.BINARY_EXPRESSION,
  AstNodeTypes.SPREAD_ELEMENT,
  AstNodeTypes.ARRAY_EXPRESSION,
]);

/** The shared parts of the two `await` rules: where a statement can go before another, what may run first, fresh names. */
export class AwaitSupport {
  static parentOf(opts: { node: unknown }): unknown {
    return AstNode.readField({ node: opts.node, key: 'parent' });
  }

  /** An ESTree node of the lint run: it has a `type` and a `range`. */
  static isNode(value: unknown): value is Rule.Node {
    return (
      AstNode.getType({ node: value }) !== undefined &&
      AwaitSupport.rangeOf({ node: value }) !== undefined
    );
  }

  static rangeOf(opts: { node: unknown }): [number, number] | undefined {
    const range = AstNode.readField({ node: opts.node, key: 'range' });

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
      const type = AstNode.getType({ node: ancestor }) ?? '';

      if (FUNCTION_TYPES.has(type) || type === AstNodeTypes.CHAIN_EXPRESSION) {
        return undefined;
      }

      if (
        type === AstNodeTypes.CONDITIONAL_EXPRESSION &&
        AstNode.readField({ node: ancestor, key: 'test' }) !== child
      ) {
        return undefined;
      }

      if (
        type === AstNodeTypes.LOGICAL_EXPRESSION &&
        AstNode.readField({ node: ancestor, key: 'left' }) !== child
      ) {
        return undefined;
      }

      if (
        type === AstNodeTypes.ASSIGNMENT_EXPRESSION &&
        ['??=', '||=', '&&='].includes(
          String(AstNode.readField({ node: ancestor, key: 'operator' })),
        ) &&
        AstNode.readField({ node: ancestor, key: 'right' }) === child
      ) {
        return undefined;
      }

      if (type.endsWith('Statement') || type === AstNodeTypes.VARIABLE_DECLARATION) {
        const head = HEAD_FIELD[type];
        const isHead =
          type === AstNodeTypes.VARIABLE_DECLARATION ||
          AstNode.readField({ node: ancestor, key: head }) === child;
        const outer = AwaitSupport.parentOf({ node: ancestor });

        const isListed =
          STATEMENT_LISTS.has(AstNode.getType({ node: outer }) ?? '') &&
          (type === AstNodeTypes.VARIABLE_DECLARATION || head !== undefined);

        return isHead && isListed && AwaitSupport.isNode(ancestor) ? ancestor : undefined;
      }

      child = ancestor;
      ancestor = AwaitSupport.parentOf({ node: child });
    }

    return undefined;
  }

  static isPure(opts: { node: unknown }): boolean {
    const { node } = opts;
    const type = AstNode.getType({ node }) ?? '';
    const pure = (child: unknown) => AwaitSupport.isPure({ node: child });
    const field = (key: string) => AstNode.readField({ node, key });

    const all = (key: string) => {
      const list = AstNode.readField({ node, key });

      return Array.isArray(list) && list.every((entry) => entry === null || pure(entry));
    };

    if (
      PURE_LEAVES.has(type) ||
      (type.startsWith('TS') &&
        ![
          AstNodeTypes.AS_EXPRESSION,
          AstNodeTypes.NON_NULL_EXPRESSION,
          AstNodeTypes.SATISFIES_EXPRESSION,
        ].includes(type))
    ) {
      return true;
    }

    const parts = new Map<string, () => boolean>([
      [AstNodeTypes.TEMPLATE_LITERAL, () => all('expressions')],
      [AstNodeTypes.MEMBER_EXPRESSION, () => pure(field('object')) && pure(field('property'))],
      [AstNodeTypes.ARRAY_EXPRESSION, () => all('elements')],
      [AstNodeTypes.OBJECT_EXPRESSION, () => all('properties')],
      [AstNodeTypes.PROPERTY, () => pure(field('key')) && pure(field('value'))],
      [AstNodeTypes.SPREAD_ELEMENT, () => pure(field('argument'))],
      [
        AstNodeTypes.UNARY_EXPRESSION,
        () => field('operator') !== 'delete' && pure(field('argument')),
      ],
      [AstNodeTypes.BINARY_EXPRESSION, () => pure(field('left')) && pure(field('right'))],
      [AstNodeTypes.LOGICAL_EXPRESSION, () => pure(field('left')) && pure(field('right'))],
      [
        AstNodeTypes.CONDITIONAL_EXPRESSION,
        () => ['test', 'consequent', 'alternate'].every((key) => pure(field(key))),
      ],
      [AstNodeTypes.AS_EXPRESSION, () => pure(field('expression'))],
      [AstNodeTypes.NON_NULL_EXPRESSION, () => pure(field('expression'))],
      [AstNodeTypes.SATISFIES_EXPRESSION, () => pure(field('expression'))],
    ]);

    return parts.get(type)?.() ?? false;
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
        const keys = opts.sourceCode.visitorKeys[AstNode.getType({ node }) ?? ''] ?? [];

        return keys.some((key) => {
          const value = AstNode.readField({ node, key });
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
  static scopeNodeOf(opts: { node: Rule.Node }): Rule.Node {
    let current: Rule.Node = opts.node;
    let parent = AwaitSupport.parentOf({ node: current });

    while (parent && !FUNCTION_TYPES.has(AstNode.getType({ node: parent }) ?? '')) {
      if (!AwaitSupport.isNode(parent)) {
        break;
      }

      current = parent;
      parent = AwaitSupport.parentOf({ node: current });
    }

    return AwaitSupport.isNode(parent) ? parent : current;
  }

  /**
   * The outermost function that holds `node` (the program when no function does): the one namespace a hoisted name
   * must be unique in. A name that is free in the nearest function only could still shadow, or be shadowed by, the
   * name another fix hoisted in a function around it or a block inside it.
   */
  static outermostScopeOf(opts: { node: Rule.Node }): Rule.Node {
    let outermost: Rule.Node | undefined;
    let current: unknown = opts.node;

    while (AwaitSupport.isNode(current)) {
      if (FUNCTION_TYPES.has(AstNode.getType({ node: current }) ?? '')) {
        outermost = current;
      }

      current = AwaitSupport.parentOf({ node: current });
    }

    return outermost ?? AwaitSupport.scopeNodeOf({ node: opts.node });
  }

  /**
   * The names handed out in this lint pass, per outermost scope. They are shared by every rule that hoists a name: the
   * rules run in the same pass over the same text and their fixes are applied together, so two rules that each
   * remembered their own names both handed out `result`. A `SourceCode` lasts for one pass of one file.
   */
  private static readonly PASS_NAMES = new WeakMap<SourceCode, Map<unknown, Set<string>>>();

  /**
   * `base`, or `base2`, `base3`... the first word that does not appear in the outermost function (or program) holding
   * `node` and that no rule has handed out already in this lint pass: no two fixes of one pass declare the same name,
   * and none declares a name that is in scope anywhere around or inside the place it is hoisted to.
   */
  static freshName(opts: { node: Rule.Node; base: string; sourceCode: SourceCode }): string {
    const scope = AwaitSupport.outermostScopeOf({ node: opts.node });
    const text = opts.sourceCode.getText(scope);
    const pass = AwaitSupport.PASS_NAMES.get(opts.sourceCode) ?? new Map<unknown, Set<string>>();
    const reserved = pass.get(scope) ?? new Set<string>();

    AwaitSupport.PASS_NAMES.set(opts.sourceCode, pass);

    for (let index = 1; ; index += 1) {
      const candidate = index === 1 ? opts.base : `${opts.base}${index}`;

      if (!reserved.has(candidate) && !new RegExp(`\\b${candidate}\\b`).test(text)) {
        reserved.add(candidate);
        pass.set(scope, reserved);

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
    const parentType = AstNode.getType({ node: AwaitSupport.parentOf({ node: awaitNode }) }) ?? '';
    const callee =
      parentType === AstNodeTypes.CALL_EXPRESSION &&
      AstNode.readField({ node: AwaitSupport.parentOf({ node: awaitNode }), key: 'callee' }) ===
        awaitNode;

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
