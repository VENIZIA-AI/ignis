import type { Linter, Rule, Scope } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { ImportSupport } from './import-support';

/**
 * `venizia/prefer-promise-sleep`. A sleep written by hand, `new Promise((resolve) => setTimeout(resolve, ms))`, is
 * `PromiseUtility.sleep({ ms })` (`@venizia/ignis-helpers/core`). Only that exact shape is reported: a callback that
 * does anything else is not a sleep.
 *
 * The fix replaces the expression and adds the import; `source` is where `PromiseUtility` comes from, `null` turns
 * the fix off.
 */
export class PreferPromiseSleepRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/prefer-promise-sleep`;

  static readonly DEFAULT_SOURCE = '@venizia/ignis-helpers/core';

  /** The `setTimeout(<resolve>, <delay>)` call a sleep callback consists of, or `undefined`. */
  private static delayOf(opts: { callback: unknown }): Rule.Node | undefined {
    const { callback } = opts;
    const type = AstNode.getType({ node: callback });

    if (
      type !== AstNodeTypes.ARROW_FUNCTION_EXPRESSION &&
      type !== AstNodeTypes.FUNCTION_EXPRESSION
    ) {
      return undefined;
    }

    const params: unknown = AstNode.readField({ node: callback, key: 'params' });
    const [param] = Array.isArray(params) ? params : [];

    if (
      !Array.isArray(params) ||
      params.length !== 1 ||
      AstNode.getType({ node: param }) !== AstNodeTypes.IDENTIFIER
    ) {
      return undefined;
    }

    let body: unknown = AstNode.readField({ node: callback, key: 'body' });

    if (AstNode.getType({ node: body }) === AstNodeTypes.BLOCK_STATEMENT) {
      const statements: unknown = AstNode.readField({ node: body, key: 'body' });
      const [only] = Array.isArray(statements) ? statements : [];

      if (!Array.isArray(statements) || statements.length !== 1) {
        return undefined;
      }

      body =
        AstNode.getType({ node: only }) === AstNodeTypes.EXPRESSION_STATEMENT
          ? AstNode.readField({ node: only, key: 'expression' })
          : undefined;
    }

    const callee = AstNode.readField({ node: body, key: 'callee' });
    const args: unknown = AstNode.readField({ node: body, key: 'arguments' });

    if (
      AstNode.getType({ node: body }) !== AstNodeTypes.CALL_EXPRESSION ||
      AstNode.readField({ node: callee, key: 'name' }) !== 'setTimeout' ||
      !Array.isArray(args) ||
      args.length !== 2
    ) {
      return undefined;
    }

    const [resolver, delay] = args;
    const isResolver =
      AstNode.getType({ node: resolver }) === AstNodeTypes.IDENTIFIER &&
      AstNode.readField({ node: resolver, key: 'name' }) ===
        AstNode.readField({ node: param, key: 'name' });

    return isResolver && AstNode.isNode(delay) ? delay : undefined;
  }

  /** `PromiseUtility.sleep({ ms })`, with the shorthand when the delay is a variable named `ms`. */
  private static call(opts: { context: Rule.RuleContext; delay: Rule.Node }): string {
    const { context, delay } = opts;
    const utility =
      ImportSupport.importedAs({ context, name: 'PromiseUtility', asValue: true }) ??
      'PromiseUtility';
    const text = context.sourceCode.getText(delay);

    return `${utility}.sleep({ ${text === 'ms' ? 'ms' : `ms: ${text}`} })`;
  }

  /** Whether `setTimeout` at `node` resolves to a binding of the file (not the global timer). */
  private static isRebound(opts: { context: Rule.RuleContext; node: Rule.Node }): boolean {
    const { context, node } = opts;
    let scope: Scope.Scope | null = context.sourceCode.getScope(node);

    while (scope) {
      const variable = scope.set.get('setTimeout');

      if (variable && variable.defs.length > 0) {
        return true;
      }

      scope = scope.upper;
    }

    return false;
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [
        {
          type: 'object',
          properties: { source: { type: ['string', 'null'] } },
          additionalProperties: false,
        },
      ],
      messages: {
        sleep:
          "Use `await PromiseUtility.sleep({ ms })`, not a hand-written `new Promise(resolve => setTimeout(resolve, ms))`: `import { PromiseUtility } from '{{source}}';`",
      },
    },
    create: (context) => {
      const options: unknown = context.options[0];
      const configured = AstNode.readField({ node: options, key: 'source' });
      const source =
        configured === null
          ? undefined
          : typeof configured === 'string'
            ? configured
            : PreferPromiseSleepRule.DEFAULT_SOURCE;

      return {
        [AstNodeTypes.NEW_EXPRESSION]: (node: Rule.Node) => {
          const callee = AstNode.readField({ node, key: 'callee' });
          const args: unknown = AstNode.readField({ node, key: 'arguments' });

          if (
            AstNode.readField({ node: callee, key: 'name' }) !== 'Promise' ||
            !Array.isArray(args) ||
            args.length !== 1
          ) {
            return;
          }

          const delay = PreferPromiseSleepRule.delayOf({ callback: args[0] });

          if (delay === undefined) {
            return;
          }

          // A `setTimeout` the file binds itself (a parameter, a local, an import) is not the timer, and a comma expression is
          // not one delay: neither is a sleep.
          if (
            PreferPromiseSleepRule.isRebound({ context, node }) ||
            AstNode.getType({ node: delay }) === AstNodeTypes.SEQUENCE_EXPRESSION
          ) {
            return;
          }

          context.report({
            node,
            messageId: 'sleep',
            data: { source: source ?? PreferPromiseSleepRule.DEFAULT_SOURCE },
            fix: (fixer) => {
              if (
                source === undefined &&
                !ImportSupport.isInScope({ context, name: 'PromiseUtility' })
              ) {
                return null;
              }

              const imports = ImportSupport.ensure({
                context,
                fixer,
                name: 'PromiseUtility',
                source: source ?? PreferPromiseSleepRule.DEFAULT_SOURCE,
                isType: false,
              });

              return imports
                ? [
                    fixer.replaceText(node, PreferPromiseSleepRule.call({ context, delay })),
                    ...imports,
                  ]
                : null;
            },
          });
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity; source?: string | null } = {}): Linter.RuleEntry {
    const { severity = 'error', source } = opts;

    return source === undefined ? [severity] : [severity, { source }];
  }
}
