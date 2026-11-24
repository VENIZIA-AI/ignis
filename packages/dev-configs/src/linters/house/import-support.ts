import type { Rule } from 'eslint';
import { AstNode, AstNodeTypes } from './common';

/** Adds the import a rule's autofix needs, once, and not at all when the name is already in scope. */
export class ImportSupport {
  /** The top-level declaration types that bring a name into the file. */
  private static readonly DECLARATIONS = new Set<string>([
    AstNodeTypes.TYPE_ALIAS_DECLARATION,
    AstNodeTypes.INTERFACE_DECLARATION,
    AstNodeTypes.FUNCTION_DECLARATION,
    AstNodeTypes.CLASS_DECLARATION,
  ]);

  /** The name a top-level statement declares, whether or not it is exported. */
  private static declaredName(opts: { statement: unknown }): string | undefined {
    const { statement } = opts;
    const inner =
      AstNode.getType({ node: statement }) === AstNodeTypes.EXPORT_NAMED_DECLARATION
        ? AstNode.readField({ node: statement, key: 'declaration' })
        : statement;
    const type = AstNode.getType({ node: inner });

    if (type !== undefined && ImportSupport.DECLARATIONS.has(type)) {
      const name = AstNode.readField({
        node: AstNode.readField({ node: inner, key: 'id' }),
        key: 'name',
      });

      return typeof name === 'string' ? name : undefined;
    }

    return undefined;
  }

  /** Whether the file imports `name`. */
  static isImported(opts: { context: Rule.RuleContext; name: string }): boolean {
    const { context, name } = opts;

    return context.sourceCode.ast.body.some((statement) => {
      if (AstNode.getType({ node: statement }) !== AstNodeTypes.IMPORT_DECLARATION) {
        return false;
      }

      const specifiers = AstNode.readField({ node: statement, key: 'specifiers' });

      return (
        Array.isArray(specifiers) &&
        specifiers.some(
          (specifier) =>
            AstNode.readField({
              node: AstNode.readField({ node: specifier, key: 'local' }),
              key: 'name',
            }) === name,
        )
      );
    });
  }

  /** Whether the file declares `name` itself at the top level (a copy or a stand-in, not an import). */
  static isDeclared(opts: { context: Rule.RuleContext; name: string }): boolean {
    const { context, name } = opts;

    return context.sourceCode.ast.body.some(
      (statement) => ImportSupport.declaredName({ statement }) === name,
    );
  }

  /** Whether `name` is imported or declared at the top level of the file. */
  static isInScope(opts: { context: Rule.RuleContext; name: string }): boolean {
    return ImportSupport.isImported(opts) || ImportSupport.isDeclared(opts);
  }

  /**
   * Whether an import can be added to this file: it is an ES module (it has an import or an export) and not a declaration
   * file. An import added to a script, or to an ambient `.d.ts`, would turn it into a module and change what it declares.
   */
  static canAdd(opts: { context: Rule.RuleContext }): boolean {
    const { context } = opts;

    if (/\.d\.[cm]?ts$/.test(context.filename)) {
      return false;
    }

    return context.sourceCode.ast.body.some((statement) => {
      const type = AstNode.getType({ node: statement });

      return (
        type === AstNodeTypes.IMPORT_DECLARATION ||
        type === AstNodeTypes.EXPORT_NAMED_DECLARATION ||
        type === AstNodeTypes.EXPORT_DEFAULT_DECLARATION ||
        type === AstNodeTypes.EXPORT_ALL_DECLARATION
      );
    });
  }

  /** The statement the new import goes before when the file has no import: the first one after the leading directives (`'use client'`). */
  private static firstAfterDirectives(opts: { context: Rule.RuleContext }): unknown {
    return opts.context.sourceCode.ast.body.find(
      (statement) =>
        AstNode.getType({ node: statement }) !== AstNodeTypes.EXPRESSION_STATEMENT ||
        typeof AstNode.readField({ node: statement, key: 'directive' }) !== 'string',
    );
  }

  /**
   * The fixes that import `name` from `source`: after the last import, or before the first statement that is not a
   * directive. None when the name is already in scope; `undefined` when an import cannot be added to this file.
   */
  static ensure(opts: {
    context: Rule.RuleContext;
    fixer: Rule.RuleFixer;
    name: string;
    source: string;
    isType: boolean;
  }): Array<Rule.Fix> | undefined {
    const { context, fixer, name, source, isType } = opts;

    if (ImportSupport.isInScope({ context, name })) {
      return [];
    }

    if (!ImportSupport.canAdd({ context })) {
      return undefined;
    }

    const line = `import ${isType ? 'type ' : ''}{ ${name} } from '${source}';`;
    const imports = context.sourceCode.ast.body.filter(
      (statement) => AstNode.getType({ node: statement }) === AstNodeTypes.IMPORT_DECLARATION,
    );
    const last = imports[imports.length - 1];

    if (last) {
      return [fixer.insertTextAfter(last, `\n${line}`)];
    }

    const first = ImportSupport.firstAfterDirectives({ context });

    return AstNode.isNode(first) ? [fixer.insertTextBefore(first, `${line}\n`)] : undefined;
  }
}
