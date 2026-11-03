import type { Rule, Scope, SourceCode } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AwaitSupport } from './await-support';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { PromiseChainSupport } from './promise-chain-support';

const STATEMENT_LISTS = new Set(['BlockStatement', 'Program', 'StaticBlock', 'SwitchCase']);
/** The catch variable the fix writes when the handler has no parameter. */
const CATCH_NAME = 'error';

/** What the fix needs, read once from a `const x = await f().catch(h)` that passed every check. */
interface IFixPlan {
  declaration: Rule.Node;
  kind: string;
  name: string;
  annotation: string;
  receiverText: string;
  catchName: string;
  isErrorRead: boolean;
  valueText: string;
}

/** The identifiers a fallback value reads, and whether every node of it is a value the fix may move. */
const collectValue = (opts: {
  node: unknown;
  parameter: string | undefined;
  identifiers: unknown[];
}): boolean => {
  const { node, parameter, identifiers } = opts;
  const type = AstNode.getType({ node }) ?? '';
  const value = (child: unknown) => collectValue({ node: child, parameter, identifiers });

  switch (type) {
    case 'Literal': {
      return true;
    }
    case 'Identifier': {
      identifiers.push(node);
      return true;
    }
    case 'TemplateLiteral': {
      return PromiseChainSupport.isConstant({ node });
    }
    case 'UnaryExpression': {
      return PromiseChainSupport.isConstant({ node });
    }
    case 'ChainExpression': {
      return value(AstNode.readField({ node, key: 'expression' }));
    }
    case 'MemberExpression': {
      // Only a read of the error itself: `error.message`, `error?.response.status`.
      const object = AstNode.readField({ node, key: 'object' });
      const isRead =
        AstNode.readField({ node, key: 'computed' }) !== true ||
        AstNode.getType({ node: AstNode.readField({ node, key: 'property' }) }) === 'Literal';
      const isRooted =
        AstNode.getType({ node: object }) === 'MemberExpression' ||
        (AstNode.getType({ node: object }) === 'Identifier' &&
          AstNode.readField({ node: object, key: 'name' }) === parameter);

      return isRead && isRooted && parameter !== undefined && value(object);
    }
    case 'ArrayExpression': {
      const elements = AstNode.readField({ node, key: 'elements' });
      return (
        Array.isArray(elements) && elements.every((element) => element === null || value(element))
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
            value(AstNode.readField({ node: property, key: 'value' })),
        )
      );
    }
    default: {
      return false;
    }
  }
};

/** Whether `name` is declared in `scope` or any scope around it: a catch variable of that name would shadow it. */
const isDeclaredAround = (opts: { scope: Scope.Scope | null; name: string }): boolean => {
  for (let scope = opts.scope; scope; scope = scope.upper) {
    if (scope.set.has(opts.name)) {
      return true;
    }
  }

  return false;
};

/**
 * The plan of the fix for `awaitNode`, or `undefined` when the strict safe shape does not hold:
 * `const|let x[: T] = await f().catch(() => <value>)` or `.catch((error) => <value>)`, alone in its declaration,
 * in a statement list; `x` never written again and, without a type annotation, read only in its own function;
 * the handler an expression-bodied, non-async arrow with at most one plain parameter; `<value>` a literal, an
 * identifier, a read of the error (`error.message`) or an array or object literal of those; `f()` with no
 * `.then`, `.catch` or `.finally` before and no `await` inside; no comment the fix would drop.
 */
const planFix = (opts: { awaitNode: Rule.Node; sourceCode: SourceCode }): IFixPlan | undefined => {
  const { awaitNode, sourceCode } = opts;
  const call = AstNode.readField({ node: awaitNode, key: 'argument' });
  const callee = AstNode.readField({ node: call, key: 'callee' });
  const args = AstNode.readField({ node: call, key: 'arguments' });

  if (
    AstNode.getType({ node: call }) !== 'CallExpression' ||
    AstNode.readField({ node: call, key: 'optional' }) === true ||
    AstNode.getType({ node: callee }) !== 'MemberExpression' ||
    AstNode.readField({ node: callee, key: 'computed' }) === true ||
    AstNode.readField({ node: callee, key: 'optional' }) === true ||
    PromiseChainSupport.memberName({ member: callee }) !== 'catch' ||
    !Array.isArray(args) ||
    args.length !== 1
  ) {
    return undefined;
  }

  const handler: unknown = args[0];
  const params = AstNode.readField({ node: handler, key: 'params' });
  const body = AstNode.readField({ node: handler, key: 'body' });
  const parameter: unknown = Array.isArray(params) ? params[0] : undefined;

  if (
    AstNode.getType({ node: handler }) !== 'ArrowFunctionExpression' ||
    AstNode.readField({ node: handler, key: 'async' }) === true ||
    AstNode.getType({ node: body }) === 'BlockStatement' ||
    AstNode.readField({ node: handler, key: 'returnType' }) ||
    AstNode.readField({ node: handler, key: 'typeParameters' }) ||
    !Array.isArray(params) ||
    params.length > 1 ||
    (parameter !== undefined &&
      (AstNode.getType({ node: parameter }) !== 'Identifier' ||
        AstNode.readField({ node: parameter, key: 'typeAnnotation' }) ||
        AstNode.readField({ node: parameter, key: 'optional' }) === true))
  ) {
    return undefined;
  }

  const receiver = AstNode.readField({ node: callee, key: 'object' });
  if (
    !AwaitSupport.isNode(receiver) ||
    !AwaitSupport.isNode(body) ||
    !AwaitSupport.isNode(handler) ||
    PromiseChainSupport.hasChainOnSpine({ node: receiver }) ||
    /\b(await|yield)\b/.test(sourceCode.getText(receiver))
  ) {
    return undefined;
  }

  const declarator = AwaitSupport.parentOf({ node: awaitNode });
  const declaration = AwaitSupport.parentOf({ node: declarator });
  const id = AstNode.readField({ node: declarator, key: 'id' });
  const declarations = AstNode.readField({ node: declaration, key: 'declarations' });
  const kind = String(AstNode.readField({ node: declaration, key: 'kind' }));

  if (
    AstNode.getType({ node: declarator }) !== 'VariableDeclarator' ||
    AstNode.readField({ node: declarator, key: 'init' }) !== awaitNode ||
    AstNode.readField({ node: declarator, key: 'definite' }) === true ||
    AstNode.getType({ node: id }) !== 'Identifier' ||
    !AwaitSupport.isNode(declarator) ||
    !AwaitSupport.isNode(declaration) ||
    !Array.isArray(declarations) ||
    declarations.length !== 1 ||
    !['const', 'let'].includes(kind) ||
    !STATEMENT_LISTS.has(
      AstNode.getType({ node: AwaitSupport.parentOf({ node: declaration }) }) ?? '',
    )
  ) {
    return undefined;
  }

  const name = String(AstNode.readField({ node: id, key: 'name' }));
  const typeAnnotation = AstNode.readField({ node: id, key: 'typeAnnotation' });
  const annotation = AwaitSupport.isNode(typeAnnotation) ? sourceCode.getText(typeAnnotation) : '';

  // `let x;` with no annotation takes its type from the assignments that follow, so TypeScript must see every
  // read in the same function: a read from a nested function, an export or a `typeof` makes it an implicit any.
  const variable = sourceCode.getDeclaredVariables(declarator).find((entry) => entry.name === name);
  if (!variable) {
    return undefined;
  }
  for (const reference of variable.references) {
    if (reference.identifier === id) {
      continue;
    }
    const parentType = AstNode.getType({
      node: AwaitSupport.parentOf({ node: reference.identifier }),
    });
    if (
      reference.isWrite() ||
      (annotation === '' &&
        (reference.from.variableScope !== variable.scope.variableScope ||
          parentType === 'ExportSpecifier' ||
          parentType === 'TSTypeQuery'))
    ) {
      return undefined;
    }
  }

  const parameterName =
    parameter === undefined
      ? undefined
      : String(AstNode.readField({ node: parameter, key: 'name' }));
  const identifiers: unknown[] = [];
  if (!collectValue({ node: body, parameter: parameterName, identifiers })) {
    return undefined;
  }

  // `x = []` on a `let x;` with no annotation makes an evolving `any[]`, looser than the `never[]` it was.
  const elements = AstNode.readField({ node: body, key: 'elements' });
  if (
    annotation === '' &&
    AstNode.getType({ node: body }) === 'ArrayExpression' &&
    Array.isArray(elements) &&
    elements.length === 0
  ) {
    return undefined;
  }

  const parameterVariable = sourceCode
    .getDeclaredVariables(handler)
    .find((entry) => entry.name === parameterName);
  const errorReads = new Set<unknown>(
    parameterVariable?.references.map((reference) => reference.identifier) ?? [],
  );
  const freeNames = new Set(
    identifiers
      .filter((identifier) => !errorReads.has(identifier))
      .map((identifier) => String(AstNode.readField({ node: identifier, key: 'name' }))),
  );

  // The fallback is evaluated after the `let`: reading the declared name there would read `undefined`.
  if (freeNames.has(name)) {
    return undefined;
  }

  const scope = sourceCode.getScope(declaration);
  const isTaken = (candidate: string) =>
    candidate === name ||
    freeNames.has(candidate) ||
    (candidate !== parameterName && isDeclaredAround({ scope, name: candidate }));
  const base = parameterName ?? CATCH_NAME;
  let catchName = base;
  for (let index = 2; isTaken(catchName); index += 1) {
    catchName = `${base}${index}`;
  }

  const comments = sourceCode.getCommentsInside(declaration);
  const isInside = (range: [number, number] | undefined, inner: [number, number] | undefined) =>
    range !== undefined && inner !== undefined && range[0] <= inner[0] && inner[1] <= range[1];
  if (
    comments.some(
      (comment) => !isInside(receiver.range, comment.range) && !isInside(body.range, comment.range),
    )
  ) {
    return undefined;
  }

  const bodyStart = body.range?.[0] ?? 0;
  let valueText = sourceCode.getText(body);
  if (catchName !== parameterName && errorReads.size > 0) {
    const edits = [...errorReads]
      .filter(AwaitSupport.isNode)
      .map((identifier) => {
        const parent = AwaitSupport.parentOf({ node: identifier });
        const isShorthand =
          AstNode.getType({ node: parent }) === 'Property' &&
          AstNode.readField({ node: parent, key: 'shorthand' }) === true;

        return {
          range: identifier.range ?? [0, 0],
          text: isShorthand ? `${parameterName}: ${catchName}` : catchName,
        };
      })
      .sort((left, right) => right.range[0] - left.range[0]);

    for (const edit of edits) {
      valueText =
        valueText.slice(0, edit.range[0] - bodyStart) +
        edit.text +
        valueText.slice(edit.range[1] - bodyStart);
    }
  }

  return {
    declaration,
    kind,
    name,
    annotation,
    receiverText: sourceCode.getText(receiver),
    catchName,
    isErrorRead: errorReads.size > 0,
    valueText,
  };
};

/**
 * `venizia/no-await-promise-chain`. One expression uses one async style: `await` (in a try/catch when it can
 * fail), or a promise chain that is not awaited. An `await` whose operand - after parentheses, `!`, `as`,
 * `satisfies` and an optional chain - is a call of `.then`, `.catch` or `.finally` (`?.then(`, `['then'](`, a
 * thenable such as a query builder) is reported once, however long the chain. A chain that is returned or stands
 * as a statement is not awaited and is not reported, nor is `await Promise.all(xs.map(f))`, `await new Promise(...)`,
 * `await x.then` (no call), or an `await` inside a callback of a chain.
 *
 * The fix is made for one shape only, `const|let x = await f().catch(() => <value>)` (see `planFix` for every
 * condition), and writes `let x; try { x = await f(); } catch (error) { x = <value>; }` (`catch { ... }` when the value does not read the error): the `const` becomes a
 * `let`, a type annotation stays, the catch variable takes the handler's parameter name (`error` without one,
 * renamed when the name is taken), and is typed `any` when the value reads it, as the handler's parameter was.
 * The try also catches a synchronous throw of `f()`, which the chain let through. Everything else is reported.
 */
export class NoAwaitPromiseChainRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-await-promise-chain`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [],
      messages: {
        mixed:
          'Do not `await` a promise chain (`.{{method}}(...)`): wrap `await f()` in try/catch, or drop the `await` and keep the chain.',
        mixedConst:
          'Do not `await` a promise chain (`.{{method}}(...)`): wrap `await f()` in try/catch, or drop the `await` and keep the chain. The fix writes the try/catch and turns the `const` into a `let`.',
      },
    },
    create: (context) => {
      const { sourceCode } = context;

      return {
        [AstNodeTypes.AWAIT_EXPRESSION]: (node: Rule.Node) => {
          const method = PromiseChainSupport.chainMethodOf({
            node: AstNode.readField({ node, key: 'argument' }),
          });
          if (method === undefined) {
            return;
          }

          const plan = planFix({ awaitNode: node, sourceCode });

          context.report({
            node,
            messageId: plan?.kind === 'const' ? 'mixedConst' : 'mixed',
            data: { method },
            fix: plan
              ? (fixer) => {
                  const indent = AwaitSupport.indentOf({ node: plan.declaration, sourceCode });
                  const inner = `${indent}  `;
                  // The optional catch binding when nothing reads the error: a named one would be an unused variable.
                  const head = plan.isErrorRead ? `catch (${plan.catchName}: any)` : 'catch';

                  return fixer.replaceText(
                    plan.declaration,
                    [
                      `let ${plan.name}${plan.annotation};`,
                      `${indent}try {`,
                      `${inner}${plan.name} = await ${plan.receiverText};`,
                      `${indent}} ${head} {`,
                      `${inner}${plan.name} = ${plan.valueText};`,
                      `${indent}}`,
                    ].join('\n'),
                  );
                }
              : null,
          });
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity } = {}): TRuleSeverity {
    return opts.severity ?? 'error';
  }
}
