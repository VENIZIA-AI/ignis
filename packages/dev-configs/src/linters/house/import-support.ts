import type { Rule } from 'eslint';
import { AstNode, AstNodeTypes } from './common';

/** Adds the import a rule's autofix needs, once, and not at all when the name is already in scope. */
export class ImportSupport {
  /** The top-level declaration types that bring a name into the file. */
  private static readonly DECLARATIONS = new Set<string>([
    AstNodeTypes.TYPE_ALIAS_DECLARATION,
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

  /** Whether `name` is imported or declared at the top level of the file. */
  static isInScope(opts: { context: Rule.RuleContext; name: string }): boolean {
    const { context, name } = opts;

    return context.sourceCode.ast.body.some((statement) => {
      if (AstNode.getType({ node: statement }) === AstNodeTypes.IMPORT_DECLARATION) {
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
      }

      return ImportSupport.declaredName({ statement }) === name;
    });
  }

  /** The fixes that import `name` from `source` (after the last import, or at the top), none when it is already in scope. */
  static ensure(opts: {
    context: Rule.RuleContext;
    fixer: Rule.RuleFixer;
    name: string;
    source: string;
    isType: boolean;
  }): Array<Rule.Fix> {
    const { context, fixer, name, source, isType } = opts;

    if (ImportSupport.isInScope({ context, name })) {
      return [];
    }

    const line = `import ${isType ? 'type ' : ''}{ ${name} } from '${source}';`;
    const imports = context.sourceCode.ast.body.filter(
      (statement) => AstNode.getType({ node: statement }) === AstNodeTypes.IMPORT_DECLARATION,
    );
    const last = imports[imports.length - 1];

    return last
      ? [fixer.insertTextAfter(last, `\n${line}`)]
      : [fixer.insertTextBeforeRange([0, 0], `${line}\n`)];
  }
}
