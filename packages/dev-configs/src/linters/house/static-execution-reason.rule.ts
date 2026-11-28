import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';
import { ExecutionSupport } from './execution-support';

/**
 * `@venizia/static-execution-reason`. The reason of a system run is logged and names the place, so it is written in
 * the code and is not blank: a string, a template without expressions, a `const` of the file holding one, or a
 * `static readonly` field of a class of the file (`Reasons.REAPER`, `this.REASON` in a static method or field). A constant
 * imported from another file cannot be read here, so it is reported.
 *
 * Only `Execution.run` of the framework's packages is read, with an object literal whose `mode` is
 * `ExecutionModes.SYSTEM` or `'system'`. A missing `reason` is left to the type checker.
 */
export class StaticExecutionReasonRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/static-execution-reason`;

  /** The text of a string literal or of a template without expressions. */
  private static literalOf(opts: { node: Rule.Node | undefined }): string | undefined {
    const node = ExecutionSupport.unwrap(opts);

    if (node?.type === AstNodeTypes.LITERAL) {
      const value = AstNode.readField({ node, key: 'value' });

      return typeof value === 'string' ? value : undefined;
    }

    return ExecutionSupport.templateTextOf({ node });
  }

  /** The class `this` stands for at `node`: that of the static method or static field it is written in. */
  private static staticClassOf(opts: { node: Rule.Node }): Rule.Node | undefined {
    const parent = ExecutionSupport.child({ node: opts.node, key: 'parent' });

    if (!parent || parent.type === AstNodeTypes.FUNCTION_DECLARATION) {
      return undefined;
    }

    // An arrow in a static field reads `this` as the class.
    if (parent.type === AstNodeTypes.PROPERTY_DEFINITION) {
      const body = ExecutionSupport.child({ node: parent, key: 'parent' });

      return AstNode.readField({ node: parent, key: 'static' }) === true
        ? ExecutionSupport.child({ node: body, key: 'parent' })
        : undefined;
    }

    if (parent.type !== AstNodeTypes.FUNCTION_EXPRESSION) {
      return StaticExecutionReasonRule.staticClassOf({ node: parent });
    }

    const method = ExecutionSupport.child({ node: parent, key: 'parent' });

    if (
      method?.type !== AstNodeTypes.METHOD_DEFINITION ||
      AstNode.readField({ node: method, key: 'static' }) !== true
    ) {
      return undefined;
    }

    const body = ExecutionSupport.child({ node: method, key: 'parent' });

    return ExecutionSupport.child({ node: body, key: 'parent' });
  }

  /** The text of the `static readonly` field `member` reads, from a class of the file. */
  private static fieldOf(opts: {
    context: Rule.RuleContext;
    member: Rule.Node;
  }): string | undefined {
    const { context, member } = opts;
    const object = ExecutionSupport.child({ node: member, key: 'object' });
    const name = ExecutionSupport.keyOf({ node: member, key: 'property' });
    let owner: unknown;

    if (object?.type === AstNodeTypes.THIS_EXPRESSION) {
      owner = StaticExecutionReasonRule.staticClassOf({ node: member });
    } else if (object?.type === AstNodeTypes.IDENTIFIER) {
      const definition = ExecutionSupport.variableOf({ context, node: object })?.defs[0];

      owner = definition?.type === 'ClassName' ? definition.node : undefined;
    }

    const field = ExecutionSupport.list({
      node: AstNode.readField({ node: owner, key: 'body' }),
      key: 'body',
    }).find(
      (item) =>
        name !== undefined &&
        AstNode.getType({ node: item }) === AstNodeTypes.PROPERTY_DEFINITION &&
        AstNode.readField({ node: item, key: 'static' }) === true &&
        AstNode.readField({ node: item, key: 'readonly' }) === true &&
        ExecutionSupport.keyOf({ node: item, key: 'key' }) === name,
    );

    return StaticExecutionReasonRule.literalOf({
      node: ExecutionSupport.child({ node: field, key: 'value' }),
    });
  }

  /** The text of a reason written in the code, or `undefined` when it is built elsewhere. */
  private static reasonOf(opts: {
    context: Rule.RuleContext;
    node: Rule.Node;
  }): string | undefined {
    const { context } = opts;
    const node = ExecutionSupport.unwrap({ node: opts.node });

    if (node?.type === AstNodeTypes.MEMBER_EXPRESSION) {
      return StaticExecutionReasonRule.fieldOf({ context, member: node });
    }

    if (node?.type !== AstNodeTypes.IDENTIFIER) {
      return StaticExecutionReasonRule.literalOf({ node });
    }

    const definition: unknown = ExecutionSupport.variableOf({ context, node })?.defs[0];
    const declaration = AstNode.readField({ node: definition, key: 'parent' });

    if (AstNode.readField({ node: declaration, key: 'kind' }) !== 'const') {
      return undefined;
    }

    const declarator = AstNode.readField({ node: definition, key: 'node' });
    const id = ExecutionSupport.child({ node: declarator, key: 'id' });

    return id?.type === AstNodeTypes.IDENTIFIER
      ? StaticExecutionReasonRule.literalOf({
          node: ExecutionSupport.child({ node: declarator, key: 'init' }),
        })
      : undefined;
  }

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        notStatic:
          "Write the reason of a system run in the code, so the log names the place: `reason: 'draft order reaper'`, a `const` of the file, or a `static readonly` field of a class of the file.",
        blank: 'The reason of a system run is blank: name the work it does.',
      },
    },
    create: (context) => ({
      [AstNodeTypes.CALL_EXPRESSION]: (node: Rule.Node) => {
        const callee = ExecutionSupport.unwrap({
          node: ExecutionSupport.child({ node, key: 'callee' }),
        });

        if (
          callee?.type !== AstNodeTypes.MEMBER_EXPRESSION ||
          ExecutionSupport.keyOf({ node: callee, key: 'property' }) !== 'run' ||
          ExecutionSupport.exportOf({
            context,
            node: ExecutionSupport.child({ node: callee, key: 'object' }),
          }) !== 'Execution'
        ) {
          return;
        }

        const object = ExecutionSupport.unwrap({
          node: ExecutionSupport.list({ node, key: 'arguments' })[0],
        });

        if (
          object?.type !== AstNodeTypes.OBJECT_EXPRESSION ||
          !ExecutionSupport.isSystemRun({ context, object })
        ) {
          return;
        }

        const { value, isUnknown } = ExecutionSupport.optionOf({ object, name: 'reason' });

        // What a spread supplies or replaces is not written here.
        if (isUnknown) {
          context.report({ node, messageId: 'notStatic' });

          return;
        }

        if (value === undefined) {
          return;
        }

        const reason = StaticExecutionReasonRule.reasonOf({ context, node: value });

        if (reason === undefined) {
          context.report({ node: value, messageId: 'notStatic' });
        } else if (reason.trim() === '') {
          context.report({ node: value, messageId: 'blank' });
        }
      },
    }),
  };

  static build(opts: { severity?: TRuleSeverity } = {}): Linter.RuleEntry {
    const { severity = 'error' } = opts;

    return [severity];
  }
}
