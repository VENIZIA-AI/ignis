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

  /** The name the file binds the import `name` to (`TNullable as N` answers `N`), or `undefined` when it does not import it. */
  static importedAs(opts: {
    context: Rule.RuleContext;
    name: string;
    asValue?: boolean;
  }): string | undefined {
    const { context, name, asValue = false } = opts;

    for (const statement of context.sourceCode.ast.body) {
      const specifiers: unknown = AstNode.readField({ node: statement, key: 'specifiers' });

      if (
        AstNode.getType({ node: statement }) !== AstNodeTypes.IMPORT_DECLARATION ||
        !Array.isArray(specifiers)
      ) {
        continue;
      }

      // A type-only import cannot stand where a value is written.
      const isTypeOnly = AstNode.readField({ node: statement, key: 'importKind' }) === 'type';

      for (const specifier of specifiers) {
        if (
          asValue &&
          (isTypeOnly || AstNode.readField({ node: specifier, key: 'importKind' }) === 'type')
        ) {
          continue;
        }

        const imported = AstNode.readField({
          node: AstNode.readField({ node: specifier, key: 'imported' }),
          key: 'name',
        });
        const local = AstNode.readField({
          node: AstNode.readField({ node: specifier, key: 'local' }),
          key: 'name',
        });

        if (imported === name && typeof local === 'string') {
          return local;
        }
      }
    }

    return undefined;
  }

  /** Whether `name` is imported (under its own name or an alias) or declared at the top level of the file. */
  static isInScope(opts: { context: Rule.RuleContext; name: string }): boolean {
    return (
      ImportSupport.isImported(opts) ||
      ImportSupport.importedAs(opts) !== undefined ||
      ImportSupport.isDeclared(opts)
    );
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

    if (
      isType
        ? ImportSupport.isInScope({ context, name })
        : ImportSupport.importedAs({ context, name, asValue: true }) !== undefined
    ) {
      return [];
    }

    // A value cannot be added next to a type-only import or a declaration that already holds its name.
    if (
      !isType &&
      (ImportSupport.isImported({ context, name }) || ImportSupport.isDeclared({ context, name }))
    ) {
      return undefined;
    }

    if (!ImportSupport.canAdd({ context })) {
      return undefined;
    }

    const merged = ImportSupport.mergeInto({ context, fixer, name, source, isType });

    if (merged) {
      return merged;
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

    if (!AstNode.isNode(first)) {
      return undefined;
    }

    // After a shebang or a directive the import is a new block: a blank line keeps it apart from the code below.
    const follows =
      first !== context.sourceCode.ast.body[0] || context.sourceCode.text.startsWith('#!');

    return [fixer.insertTextBefore(first, follows ? `${line}\n\n` : `${line}\n`)];
  }

  /**
   * The fix that adds `name` to an import the file already has from `source`, when that import is a plain named list: a
   * second `import { ... } from 'same-module'` line is what `no-duplicate-imports` reports. A type goes into an
   * `import type` list as it is, and into a value list as `type Name`; a value only goes into a value list.
   */
  private static mergeInto(opts: {
    context: Rule.RuleContext;
    fixer: Rule.RuleFixer;
    name: string;
    source: string;
    isType: boolean;
  }): Array<Rule.Fix> | undefined {
    const { context, fixer, name, source, isType } = opts;

    for (const statement of context.sourceCode.ast.body) {
      const specifiers: unknown = AstNode.readField({ node: statement, key: 'specifiers' });
      const importKind = AstNode.readField({ node: statement, key: 'importKind' });
      const from = AstNode.readField({
        node: AstNode.readField({ node: statement, key: 'source' }),
        key: 'value',
      });

      if (
        AstNode.getType({ node: statement }) !== AstNodeTypes.IMPORT_DECLARATION ||
        from !== source ||
        !Array.isArray(specifiers) ||
        specifiers.length === 0 ||
        !specifiers.every(
          (item) => AstNode.getType({ node: item }) === AstNodeTypes.IMPORT_SPECIFIER,
        )
      ) {
        continue;
      }

      const isTypeImport = importKind === 'type';

      if (!isType && isTypeImport) {
        continue;
      }

      const last = specifiers[specifiers.length - 1];
      const text = isType && !isTypeImport ? `type ${name}` : name;

      return [fixer.insertTextAfter(last, `, ${text}`)];
    }

    return undefined;
  }
}
