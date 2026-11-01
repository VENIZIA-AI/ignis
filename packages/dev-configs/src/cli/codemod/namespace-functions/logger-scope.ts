import type ts from 'typescript';
import type { INamespaceFunctionsReport, INamespaceFunctionsResult } from './rewriter';

type TTypeScript = typeof ts;

interface IEdit {
  start: number;
  end: number;
  text: string;
}

/** How a file reaches `ApplicationLogger`: by a named import (aliased too), or through a namespace import. */
interface ILocals {
  /** Local name -> the import specifier that declares it. */
  named: Map<string, ts.ImportSpecifier>;
  /** Local name of `import * as name`. */
  namespaces: Set<string>;
  /** The import declarations of the listed modules, in order. */
  declarations: ts.ImportDeclaration[];
}

/**
 * The call-shape rule that goes with the table. `ApplicationLogger` is removed: every form of it becomes
 * `LoggerFactory.getLogger([scope])`, so `ApplicationLogger.get('scope')`, `ApplicationLogger.get(NAME)` and
 * `ApplicationLogger.get({ scope: NAME })` all become `LoggerFactory.getLogger(['scope'])`, `...([NAME])`. The call is on a
 * class, not a function in a table, so the table cannot carry it.
 *
 * It follows `ApplicationLogger` imported by name (aliased too) or reached through a namespace import from
 * `@venizia/ignis-helpers` or `@venizia/ignis`, adds `LoggerFactory` to that import and drops `ApplicationLogger` once
 * nothing else uses it. The argument may be a string literal, a template, an identifier, a property access, or an
 * object literal that holds only `scope`. It never touches `Logger.get` or `HfLogger.get`, and it lists a call it cannot
 * decide with file and line.
 */
export class LoggerScopeRewriter {
  static readonly CLASS_NAME = 'ApplicationLogger';
  static readonly TARGET_NAME = 'LoggerFactory';
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
    const unchanged = { output: source, changed: false, rewritten: 0, reports };

    if (!LoggerScopeRewriter.mentions({ source })) {
      return unchanged;
    }

    const sourceFile = typescript.createSourceFile(
      fileName,
      source,
      typescript.ScriptTarget.Latest,
      true,
    );

    const locals = LoggerScopeRewriter.findLocals({ typescript, sourceFile });
    if (locals.named.size === 0 && locals.namespaces.size === 0) {
      return unchanged;
    }

    const edits: IEdit[] = [];
    /** Identifiers of the old class that a rewritten call replaced: what is left after them keeps the import. */
    const rewrittenOwners = new Set<ts.Node>();
    const report = (node: ts.Node, reason: string) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      reports.push({ line: line + 1, column: character + 1, reason });
    };

    const visit = (node: ts.Node): void => {
      if (typescript.isCallExpression(node)) {
        const owner = LoggerScopeRewriter.loggerOwnerOf({ typescript, call: node, locals });

        if (owner) {
          LoggerScopeRewriter.plan({
            typescript,
            sourceFile,
            call: node,
            owner,
            edits,
            rewrittenOwners,
            report,
          });
        }
      }

      typescript.forEachChild(node, visit);
    };
    visit(sourceFile);

    if (edits.length === 0) {
      return unchanged;
    }

    LoggerScopeRewriter.planImports({ typescript, sourceFile, locals, rewrittenOwners, edits });

    let output = source;
    for (const edit of [...edits].sort((first, second) => second.start - first.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: true, rewritten: rewrittenOwners.size, reports };
  }

  private static findLocals(opts: { typescript: TTypeScript; sourceFile: ts.SourceFile }): ILocals {
    const { typescript, sourceFile } = opts;
    const locals: ILocals = { named: new Map(), namespaces: new Set(), declarations: [] };

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

      locals.declarations.push(statement);

      if (typescript.isNamespaceImport(bindings)) {
        locals.namespaces.add(bindings.name.text);
        continue;
      }

      for (const specifier of bindings.elements) {
        if (specifier.isTypeOnly) {
          continue;
        }

        if ((specifier.propertyName ?? specifier.name).text === LoggerScopeRewriter.CLASS_NAME) {
          locals.named.set(specifier.name.text, specifier);
        }
      }
    }

    return locals;
  }

  /** The node that names the class in `<ApplicationLogger>.get(...)` or `<namespace>.ApplicationLogger.get(...)`, else undefined. */
  private static loggerOwnerOf(opts: {
    typescript: TTypeScript;
    call: ts.CallExpression;
    locals: ILocals;
  }): ts.Identifier | ts.PropertyAccessExpression | undefined {
    const { typescript, call, locals } = opts;
    const callee = call.expression;

    if (!typescript.isPropertyAccessExpression(callee) || callee.name.text !== 'get') {
      return undefined;
    }

    const owner = callee.expression;
    if (typescript.isIdentifier(owner) && locals.named.has(owner.text)) {
      return owner;
    }

    if (
      typescript.isPropertyAccessExpression(owner) &&
      owner.name.text === LoggerScopeRewriter.CLASS_NAME &&
      typescript.isIdentifier(owner.expression) &&
      locals.namespaces.has(owner.expression.text)
    ) {
      return owner;
    }

    return undefined;
  }

  /** The scope expression of the call, as text, or a reason it cannot be decided. */
  private static scopeOf(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    call: ts.CallExpression;
  }): { text: string } | { reason: string } {
    const { typescript, sourceFile, call } = opts;
    const [argument] = call.arguments;

    if (call.arguments.length !== 1 || !argument) {
      return {
        reason:
          '`ApplicationLogger.get` is called with no argument or more than one: rewrite it by hand as `LoggerFactory.getLogger([scope])`',
      };
    }

    if (typescript.isObjectLiteralExpression(argument)) {
      const [property, ...rest] = argument.properties;
      const isOnlyScope =
        rest.length === 0 &&
        property !== undefined &&
        (typescript.isShorthandPropertyAssignment(property) ||
          typescript.isPropertyAssignment(property)) &&
        typescript.isIdentifier(property.name) &&
        property.name.text === 'scope';

      if (!isOnlyScope) {
        return {
          reason:
            '`ApplicationLogger.get` gets an object that is not `{ scope: <expression> }`: rewrite it by hand as `LoggerFactory.getLogger([scope])`',
        };
      }

      return {
        text: typescript.isShorthandPropertyAssignment(property)
          ? property.name.text
          : property.initializer.getText(sourceFile),
      };
    }

    const isDecidable =
      typescript.isStringLiteral(argument) ||
      typescript.isNoSubstitutionTemplateLiteral(argument) ||
      typescript.isTemplateExpression(argument) ||
      typescript.isIdentifier(argument) ||
      typescript.isPropertyAccessExpression(argument);

    if (!isDecidable) {
      return {
        reason:
          '`ApplicationLogger.get` gets an argument whose type the codemod cannot tell (a call, a spread or another expression): rewrite it by hand as `LoggerFactory.getLogger([<argument>])`',
      };
    }

    return { text: argument.getText(sourceFile) };
  }

  /** One edit for a call whose scope is decided: the whole call text becomes `<owner replaced>.getLogger([scope])`. */
  private static plan(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    call: ts.CallExpression;
    owner: ts.Identifier | ts.PropertyAccessExpression;
    edits: IEdit[];
    rewrittenOwners: Set<ts.Node>;
    report: (node: ts.Node, reason: string) => void;
  }): void {
    const { typescript, sourceFile, call, owner, edits, rewrittenOwners, report } = opts;
    const scope = LoggerScopeRewriter.scopeOf({ typescript, sourceFile, call });

    if ('reason' in scope) {
      report(call, scope.reason);
      return;
    }

    // `<namespace>.ApplicationLogger` keeps its namespace: `helpers.LoggerFactory.getLogger([...])`.
    const ownerText = typescript.isIdentifier(owner)
      ? LoggerScopeRewriter.TARGET_NAME
      : `${owner.expression.getText(sourceFile)}.${LoggerScopeRewriter.TARGET_NAME}`;

    edits.push({
      start: call.getStart(sourceFile),
      end: call.getEnd(),
      text: `${ownerText}.getLogger([${scope.text}])`,
    });
    rewrittenOwners.add(owner);
  }

  /**
   * `LoggerFactory` is added to the import that carried `ApplicationLogger`, and `ApplicationLogger` leaves it when no
   * other use of it remains.
   */
  private static planImports(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    locals: ILocals;
    rewrittenOwners: Set<ts.Node>;
    edits: IEdit[];
  }): void {
    const { typescript, sourceFile, locals, rewrittenOwners, edits } = opts;

    for (const [local, specifier] of locals.named) {
      const used = LoggerScopeRewriter.countReferences({ typescript, sourceFile, name: local });
      const replaced = [...rewrittenOwners].filter(
        (owner) => typescript.isIdentifier(owner) && owner.text === local,
      ).length;
      const declaration = specifier.parent.parent.parent;
      const imported = declaration.importClause?.namedBindings;

      if (!imported || !typescript.isNamedImports(imported)) {
        continue;
      }

      const hasTarget = imported.elements.some(
        (element) =>
          (element.propertyName ?? element.name).text === LoggerScopeRewriter.TARGET_NAME,
      );
      const isLeft = used - replaced > 1; // the import specifier itself is one reference

      if (isLeft) {
        if (!hasTarget) {
          edits.push({
            start: specifier.getEnd(),
            end: specifier.getEnd(),
            text: `, ${LoggerScopeRewriter.TARGET_NAME}`,
          });
        }
        continue;
      }

      if (hasTarget) {
        LoggerScopeRewriter.dropSpecifier({
          sourceFile,
          specifier,
          elements: imported.elements,
          edits,
        });
      } else {
        edits.push({
          start: specifier.getStart(sourceFile),
          end: specifier.getEnd(),
          text: LoggerScopeRewriter.TARGET_NAME,
        });
      }
    }
  }

  /** How many identifiers named `name` the file holds, the import specifier included. */
  private static countReferences(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    name: string;
  }): number {
    const { typescript, sourceFile, name } = opts;
    let count = 0;

    const visit = (node: ts.Node): void => {
      if (typescript.isIdentifier(node) && node.text === name) {
        // A property name (`x.name`) is not a reference to the import.
        const parent = node.parent;
        const isProperty = typescript.isPropertyAccessExpression(parent) && parent.name === node;
        if (!isProperty) {
          count += 1;
        }
      }
      typescript.forEachChild(node, visit);
    };
    visit(sourceFile);

    return count;
  }

  /** Removes one specifier from a named import together with its comma. */
  private static dropSpecifier(opts: {
    sourceFile: ts.SourceFile;
    specifier: ts.ImportSpecifier;
    elements: ts.NodeArray<ts.ImportSpecifier>;
    edits: IEdit[];
  }): void {
    const { sourceFile, specifier, elements, edits } = opts;
    const index = elements.indexOf(specifier);
    const next = elements[index + 1];
    const previous = elements[index - 1];

    if (next) {
      edits.push({
        start: specifier.getStart(sourceFile),
        end: next.getStart(sourceFile),
        text: '',
      });
    } else if (previous) {
      edits.push({ start: previous.getEnd(), end: specifier.getEnd(), text: '' });
    } else {
      edits.push({ start: specifier.getStart(sourceFile), end: specifier.getEnd(), text: '' });
    }
  }
}
