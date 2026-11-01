import type ts from 'typescript';
import type { INamespaceFunctionsReport, INamespaceFunctionsResult } from './rewriter';

type TTypeScript = typeof ts;

interface IEdit {
  start: number;
  end: number;
  text: string;
}

/**
 * The call-shape rule that goes with the table: `ApplicationLogger.get('scope')` is now
 * `ApplicationLogger.get({ scope: 'scope' })`. The call is on a class, not a function in a table, so the
 * table cannot carry it. It follows `ApplicationLogger` imported by name (aliased too) or reached through a
 * namespace import from `@venizia/ignis-helpers` or `@venizia/ignis`, and rewrites a single argument that is a
 * string literal, a template, an identifier or a property access. It leaves the object form alone, never
 * touches `Logger.get` or `HfLogger.get`, and lists a call it cannot decide with file and line.
 */
export class LoggerScopeRewriter {
  static readonly CLASS_NAME = 'ApplicationLogger';
  static readonly MODULES: ReadonlyArray<string> = ['@venizia/ignis-helpers', '@venizia/ignis'];

  /** Whether the file can hold such a call, so a file without it is not parsed. */
  static mentions(opts: { source: string }): boolean {
    return opts.source.includes(LoggerScopeRewriter.CLASS_NAME);
  }

  static rewrite(opts: {
    typescript: TTypeScript;
    fileName: string;
    source: string;
  }): INamespaceFunctionsResult {
    const { typescript, fileName, source } = opts;
    const reports: INamespaceFunctionsReport[] = [];

    if (!LoggerScopeRewriter.mentions({ source })) {
      return { output: source, changed: false, rewritten: 0, reports };
    }

    const sourceFile = typescript.createSourceFile(
      fileName,
      source,
      typescript.ScriptTarget.Latest,
      true,
    );

    const { classNames, namespaces } = LoggerScopeRewriter.findLocals({ typescript, sourceFile });
    if (classNames.size === 0 && namespaces.size === 0) {
      return { output: source, changed: false, rewritten: 0, reports };
    }

    const edits: IEdit[] = [];
    const report = (node: ts.Node, reason: string) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      reports.push({ line: line + 1, column: character + 1, reason });
    };

    const visit = (node: ts.Node): void => {
      if (
        typescript.isCallExpression(node) &&
        LoggerScopeRewriter.isLoggerGet({ typescript, call: node, classNames, namespaces })
      ) {
        LoggerScopeRewriter.plan({ typescript, sourceFile, call: node, edits, report });
      }

      typescript.forEachChild(node, visit);
    };
    visit(sourceFile);

    if (edits.length === 0) {
      return { output: source, changed: false, rewritten: 0, reports };
    }

    let output = source;
    for (const edit of [...edits].sort((first, second) => second.start - first.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: true, rewritten: edits.length, reports };
  }

  /** The local names that reach `ApplicationLogger`: the named imports, and the namespace imports of its modules. */
  private static findLocals(opts: { typescript: TTypeScript; sourceFile: ts.SourceFile }): {
    classNames: Set<string>;
    namespaces: Set<string>;
  } {
    const { typescript, sourceFile } = opts;
    const classNames = new Set<string>();
    const namespaces = new Set<string>();

    for (const statement of sourceFile.statements) {
      if (
        !typescript.isImportDeclaration(statement) ||
        !typescript.isStringLiteral(statement.moduleSpecifier) ||
        !LoggerScopeRewriter.MODULES.includes(statement.moduleSpecifier.text)
      ) {
        continue;
      }

      const bindings = statement.importClause?.namedBindings;
      if (!bindings || statement.importClause?.isTypeOnly) {
        continue;
      }

      if (typescript.isNamespaceImport(bindings)) {
        namespaces.add(bindings.name.text);
        continue;
      }

      for (const specifier of bindings.elements) {
        if (specifier.isTypeOnly) {
          continue;
        }

        if ((specifier.propertyName ?? specifier.name).text === LoggerScopeRewriter.CLASS_NAME) {
          classNames.add(specifier.name.text);
        }
      }
    }

    return { classNames, namespaces };
  }

  /** `<ApplicationLogger>.get(...)` or `<namespace>.ApplicationLogger.get(...)`. */
  private static isLoggerGet(opts: {
    typescript: TTypeScript;
    call: ts.CallExpression;
    classNames: Set<string>;
    namespaces: Set<string>;
  }): boolean {
    const { typescript, call, classNames, namespaces } = opts;
    const callee = call.expression;

    if (!typescript.isPropertyAccessExpression(callee) || callee.name.text !== 'get') {
      return false;
    }

    const owner = callee.expression;
    if (typescript.isIdentifier(owner)) {
      return classNames.has(owner.text);
    }

    return (
      typescript.isPropertyAccessExpression(owner) &&
      owner.name.text === LoggerScopeRewriter.CLASS_NAME &&
      typescript.isIdentifier(owner.expression) &&
      namespaces.has(owner.expression.text)
    );
  }

  /** One edit for a call that has a single scope argument, or a report when the call cannot be decided. */
  private static plan(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    call: ts.CallExpression;
    edits: IEdit[];
    report: (node: ts.Node, reason: string) => void;
  }): void {
    const { typescript, sourceFile, call, edits, report } = opts;
    const [argument] = call.arguments;

    if (call.arguments.length !== 1 || !argument) {
      report(
        call,
        '`ApplicationLogger.get` is called with no argument or more than one: rewrite it by hand as `ApplicationLogger.get({ scope })`',
      );
      return;
    }

    if (typescript.isObjectLiteralExpression(argument)) {
      return;
    }

    const isDecidable =
      typescript.isStringLiteral(argument) ||
      typescript.isNoSubstitutionTemplateLiteral(argument) ||
      typescript.isTemplateExpression(argument) ||
      typescript.isIdentifier(argument) ||
      typescript.isPropertyAccessExpression(argument);

    if (!isDecidable) {
      report(
        argument,
        '`ApplicationLogger.get` gets an argument whose type the codemod cannot tell (a call, a spread or another expression): rewrite it by hand as `ApplicationLogger.get({ scope: <argument> })`',
      );
      return;
    }

    const text = argument.getText(sourceFile);
    const isShort = typescript.isIdentifier(argument) && argument.text === 'scope';

    edits.push({
      start: argument.getStart(sourceFile),
      end: argument.getEnd(),
      text: isShort ? '{ scope }' : `{ scope: ${text} }`,
    });
  }
}
