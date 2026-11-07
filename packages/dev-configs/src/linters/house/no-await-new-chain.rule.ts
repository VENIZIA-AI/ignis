import type { Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AwaitSupport } from './await-support';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/** Wrappers that carry no meaning of their own around the call or the instance: `(await new X().m()) as Y`, `new X()!.m()`, `new X()?.m()`. */
const TRANSPARENT_TYPES = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
]);

/** The classes whose `new` is awaited on its own account: `await new Promise(...)` calls no method, and `.then` on it is `no-await-promise-chain`'s. */
const EXEMPT_CLASSES = new Set(['Promise']);

/**
 * `venizia/no-await-new-chain`. A method is never called on a fresh instance inside an `await`:
 * `await new Runner({ ... }).run(...)` and `const text = await new Response(body).text()` declare the instance first,
 * then await on its own line (`const runner = new Runner({ ... }); await runner.run(...);`). A builder chain
 * (`await new SignJWT(claims).setIssuer(iss).sign(key)`) declares the builder, then awaits its last call.
 *
 * `await new Promise(...)` calls no method and is allowed. `await new X().prop` is not a call and is allowed.
 *
 * The fix moves the instance, or the chain up to the last call, into a `const` in front of the statement. It is made
 * only when nothing that does more than read a value runs before the `await` inside the statement; otherwise the
 * finding is reported and left alone.
 */
export class NoAwaitNewChainRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/no-await-new-chain`;

  /** The expression under any transparent wrapper. */
  private static unwrap(opts: { node: unknown }): unknown {
    let current = opts.node;

    while (TRANSPARENT_TYPES.has(AstNode.getType({ node: current }) ?? '')) {
      current = AstNode.readField({ node: current, key: 'expression' });
    }

    return current;
  }

  /**
   * The receiver of the last call when the awaited value is a method call on a `new` (directly or through a chain of
   * calls and member reads), else `undefined`.
   */
  private static receiverOf(opts: { awaitNode: unknown }): Rule.Node | undefined {
    const operand = NoAwaitNewChainRule.unwrap({
      node: AstNode.readField({ node: opts.awaitNode, key: 'argument' }),
    });

    if (AstNode.getType({ node: operand }) !== AstNodeTypes.CALL_EXPRESSION) {
      return undefined;
    }

    const callee = NoAwaitNewChainRule.unwrap({
      node: AstNode.readField({ node: operand, key: 'callee' }),
    });

    if (AstNode.getType({ node: callee }) !== 'MemberExpression') {
      return undefined;
    }

    const receiver = AstNode.readField({ node: callee, key: 'object' });
    let current = NoAwaitNewChainRule.unwrap({ node: receiver });

    // Down the chain: `new X().a().b` is a call of a member of a call of a member of the `new`.
    for (;;) {
      const type = AstNode.getType({ node: current });

      if (type === AstNodeTypes.CALL_EXPRESSION) {
        current = NoAwaitNewChainRule.unwrap({
          node: AstNode.readField({ node: current, key: 'callee' }),
        });
      } else if (type === 'MemberExpression') {
        current = NoAwaitNewChainRule.unwrap({
          node: AstNode.readField({ node: current, key: 'object' }),
        });
      } else {
        break;
      }
    }

    if (AstNode.getType({ node: current }) !== AstNodeTypes.NEW_EXPRESSION) {
      return undefined;
    }

    const constructed = AstNode.readField({ node: current, key: 'callee' });

    if (
      AstNode.getType({ node: constructed }) === 'Identifier' &&
      EXEMPT_CLASSES.has(String(AstNode.readField({ node: constructed, key: 'name' })))
    ) {
      return undefined;
    }

    return AwaitSupport.isNode(receiver) ? receiver : undefined;
  }

  /**
   * Whether the `await` is the whole statement (`await f();`) or the whole initializer of a declaration with one
   * declarator (`const { a } = await f();`). Nothing runs before it there: a binding pattern and its defaults are
   * evaluated after the initializer.
   */
  private static isFirstToRun(opts: { awaitNode: unknown; statement: unknown }): boolean {
    const { awaitNode, statement } = opts;
    const type = AstNode.getType({ node: statement });

    if (type === 'ExpressionStatement') {
      return AstNode.readField({ node: statement, key: 'expression' }) === awaitNode;
    }

    if (type !== 'VariableDeclaration') {
      return false;
    }

    const declarations = AstNode.readField({ node: statement, key: 'declarations' });

    return (
      Array.isArray(declarations) &&
      declarations.length === 1 &&
      AstNode.readField({ node: declarations[0], key: 'init' }) === awaitNode
    );
  }

  /** `Response` becomes `response`, `ns.SignJWT` becomes `signJWT`; anything else is `instance`. */
  private static nameOf(opts: { receiver: unknown }): string {
    let current = NoAwaitNewChainRule.unwrap({ node: opts.receiver });

    while (
      AstNode.getType({ node: current }) === AstNodeTypes.CALL_EXPRESSION ||
      AstNode.getType({ node: current }) === 'MemberExpression'
    ) {
      current = NoAwaitNewChainRule.unwrap({
        node: AstNode.readField({
          node: current,
          key: AstNode.getType({ node: current }) === 'MemberExpression' ? 'object' : 'callee',
        }),
      });
    }

    const constructed = AstNode.readField({ node: current, key: 'callee' });
    const word =
      AstNode.getType({ node: constructed }) === 'Identifier'
        ? AstNode.readField({ node: constructed, key: 'name' })
        : AstNode.getType({ node: constructed }) === 'MemberExpression'
          ? AstNode.readField({
              node: AstNode.readField({ node: constructed, key: 'property' }),
              key: 'name',
            })
          : undefined;

    return typeof word === 'string' && /^[A-Za-z_$][\w$]*$/.test(word)
      ? `${word[0]?.toLowerCase()}${word.slice(1)}`
      : 'instance';
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [],
      messages: {
        chain:
          'Do not call a method on a new instance inside an `await`: declare the instance first (`const runner = new Runner(options);`), then `await runner.run();` on its own line.',
      },
    },
    create: (context) => {
      const { sourceCode } = context;

      return {
        [AstNodeTypes.AWAIT_EXPRESSION]: (node: Rule.Node) => {
          const receiver = NoAwaitNewChainRule.receiverOf({ awaitNode: node });

          if (receiver === undefined) {
            return;
          }

          const statement = AwaitSupport.hoistTarget({ awaitNode: node });
          const range = AwaitSupport.rangeOf({ node: receiver });
          const canFix =
            statement !== undefined &&
            range !== undefined &&
            (NoAwaitNewChainRule.isFirstToRun({ awaitNode: node, statement }) ||
              !AwaitSupport.hasEffectBefore({ statement, awaitNode: node, sourceCode }));

          context.report({
            node,
            messageId: 'chain',
            fix:
              canFix && range !== undefined
                ? (fixer) => {
                    const name = AwaitSupport.freshName({
                      node,
                      base: NoAwaitNewChainRule.nameOf({ receiver }),
                      sourceCode,
                    });
                    const indent = AwaitSupport.indentOf({ node: statement, sourceCode });

                    return [
                      fixer.insertTextBefore(
                        statement,
                        `const ${name} = ${sourceCode.getText(receiver)};\n${indent}`,
                      ),
                      fixer.replaceTextRange(range, name),
                    ];
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
