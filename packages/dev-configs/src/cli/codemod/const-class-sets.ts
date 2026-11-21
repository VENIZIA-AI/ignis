import type ts from 'typescript';
import { ConstClasses } from './const-classes';

type TTypeScript = typeof ts;

interface IEdit {
  start: number;
  end: number;
  text: string;
}

export interface IConstClassSetsResult {
  output: string;
  changed: boolean;
  /** The classes of this file that moved to `extends ConstClass`. */
  classes: Array<{ name: string; line: number }>;
  /** The `SCHEME_SET.has(` and `[...SCHEME_SET]` sites rewritten. */
  calls: number;
  /** A `SCHEME_SET` use of a converted class the codemod cannot rewrite. */
  manual: Array<{ line: number; reason: string }>;
}

/**
 * Moves a standard-shape value class onto `ConstClass`, and the two ways callers read its `SCHEME_SET`.
 * Standard shape: no base class, string `static readonly` members only, a `SCHEME_SET` that lists exactly those
 * members, and either no `isValid` or one that is `return this.SCHEME_SET.has(x)`. Any other member keeps the
 * class as it is. Callers are found through the checker, so only a receiver that is such a class (or one that
 * already extends `ConstClass`, a library class that has moved) is rewritten.
 */
export class ConstClassSets {
  /** The key a converted class goes by across files: its file and its name. */
  static keyOf(opts: { fileName: string; name: string }): string {
    return `${opts.fileName}#${opts.name}`;
  }

  /** The classes of a file that have the standard shape. */
  static standardClasses(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
  }): ts.ClassDeclaration[] {
    const { typescript, sourceFile } = opts;

    return sourceFile.statements.filter(
      (statement): statement is ts.ClassDeclaration =>
        typescript.isClassDeclaration(statement) &&
        statement.name !== undefined &&
        statement.heritageClauses === undefined &&
        ConstClassSets.isStandard({ typescript, node: statement }),
    );
  }

  private static isStandard(opts: { typescript: TTypeScript; node: ts.ClassDeclaration }): boolean {
    const { typescript, node } = opts;
    const values: string[] = [];
    let listed: string[] | undefined;

    for (const member of node.members) {
      const isStatic =
        typescript.canHaveModifiers(member) &&
        typescript
          .getModifiers(member)
          ?.some((modifier) => modifier.kind === typescript.SyntaxKind.StaticKeyword) === true;

      if (!isStatic || member.name === undefined) {
        return false;
      }

      const name = member.name.getText();

      if (typescript.isMethodDeclaration(member) && name === 'isValid') {
        const body = member.body?.getText().replace(/\s+/g, ' ') ?? '';

        if (!/^\{ return this\.SCHEME_SET\.has\(\w+\); \}$/.test(body)) {
          return false;
        }

        continue;
      }

      if (!typescript.isPropertyDeclaration(member) || member.initializer === undefined) {
        return false;
      }

      const { initializer } = member;

      if (name === 'SCHEME_SET') {
        listed = ConstClassSets.listedMembers({ typescript, initializer });

        if (listed === undefined) {
          return false;
        }

        continue;
      }

      if (
        !typescript.isStringLiteral(initializer) &&
        !typescript.isNoSubstitutionTemplateLiteral(initializer)
      ) {
        return false;
      }

      values.push(name);
    }

    return (
      listed !== undefined &&
      values.length > 0 &&
      [...listed].sort().join() === [...values].sort().join()
    );
  }

  /** The member names of `new Set([this.A, this.B])`; `undefined` for any other expression. */
  private static listedMembers(opts: {
    typescript: TTypeScript;
    initializer: ts.Expression;
  }): string[] | undefined {
    const { typescript, initializer } = opts;

    if (
      !typescript.isNewExpression(initializer) ||
      initializer.expression.getText() !== 'Set' ||
      initializer.arguments?.length !== 1
    ) {
      return undefined;
    }

    const list = initializer.arguments[0];

    if (list === undefined || !typescript.isArrayLiteralExpression(list)) {
      return undefined;
    }

    const names: string[] = [];

    for (const element of list.elements) {
      if (
        !typescript.isPropertyAccessExpression(element) ||
        element.expression.kind !== typescript.SyntaxKind.ThisKeyword
      ) {
        return undefined;
      }

      names.push(element.name.text);
    }

    return names;
  }

  /**
   * One file: its standard classes move onto `ConstClass` (when `convertHere`), and every caller of a class in
   * `converted` is rewritten. `converted` holds the `keyOf` of the classes of the whole run.
   */
  static rewrite(opts: {
    typescript: TTypeScript;
    source: string;
    sourceFile: ts.SourceFile;
    checker: ts.TypeChecker;
    converted: Set<string>;
    convertHere: boolean;
    importFrom: string;
  }): IConstClassSetsResult {
    const { typescript, source, sourceFile, checker, converted, importFrom } = opts;
    const edits: IEdit[] = [];
    const classes: IConstClassSetsResult['classes'] = [];
    const manual: IConstClassSetsResult['manual'] = [];
    let calls = 0;

    const lineOf = (node: ts.Node) =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    if (opts.convertHere) {
      for (const node of ConstClassSets.standardClasses({ typescript, sourceFile })) {
        if (node.name === undefined) {
          continue;
        }

        classes.push({ name: node.name.text, line: lineOf(node) });
        edits.push({ start: node.name.end, end: node.name.end, text: ' extends ConstClass' });

        for (const member of node.members) {
          const name = member.name?.getText();

          if (name === 'SCHEME_SET' || name === 'isValid') {
            // From the end of the previous member, so the member's comment and the blank line above it go with it.
            edits.push({ start: member.getFullStart(), end: member.end, text: '' });
          }
        }
      }
    }

    const isConverted = (expression: ts.Expression): boolean => {
      let symbol = checker.getSymbolAtLocation(expression);

      if (symbol !== undefined && symbol.flags & typescript.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
      }

      const declaration = symbol?.declarations?.find(typescript.isClassDeclaration);

      if (declaration?.name === undefined) {
        return false;
      }

      // Converted in this run, or already on ConstClass (a class from a library that has moved).
      return (
        converted.has(
          ConstClassSets.keyOf({
            fileName: declaration.getSourceFile().fileName,
            name: declaration.name.text,
          }),
        ) ||
        declaration.heritageClauses?.some((clause) =>
          clause.types.some((type) => type.expression.getText() === 'ConstClass'),
        ) === true
      );
    };

    const removed = (node: ts.Node) =>
      edits.some(
        (edit) =>
          edit.text === '' && node.getStart(sourceFile) >= edit.start && node.end <= edit.end,
      );

    const walk = (node: ts.Node): void => {
      if (
        typescript.isPropertyAccessExpression(node) &&
        node.name.text === 'SCHEME_SET' &&
        !removed(node) &&
        isConverted(node.expression)
      ) {
        const receiver = node.expression.getText(sourceFile);
        const parent = node.parent;

        if (
          typescript.isPropertyAccessExpression(parent) &&
          parent.expression === node &&
          parent.name.text === 'has' &&
          typescript.isCallExpression(parent.parent) &&
          parent.parent.expression === parent &&
          parent.parent.arguments.length === 1
        ) {
          edits.push({
            start: parent.getStart(sourceFile),
            end: parent.end,
            text: `${receiver}.isValid`,
          });
          calls += 1;
        } else if (
          typescript.isSpreadElement(parent) &&
          typescript.isArrayLiteralExpression(parent.parent) &&
          parent.parent.elements.length === 1
        ) {
          edits.push({
            start: parent.parent.getStart(sourceFile),
            end: parent.parent.end,
            text: `${receiver}.values()`,
          });
          calls += 1;
        } else if (typescript.isSpreadElement(parent)) {
          edits.push({
            start: parent.getStart(sourceFile),
            end: parent.end,
            text: `...${receiver}.values()`,
          });
          calls += 1;
        } else {
          manual.push({
            line: lineOf(node),
            reason: `${receiver}.SCHEME_SET is gone: use ${receiver}.isValid(value) or ${receiver}.values()`,
          });
        }

        return;
      }

      typescript.forEachChild(node, walk);
    };

    walk(sourceFile);

    if (classes.length > 0) {
      const importEdit = ConstClasses.planImports({
        typescript,
        sourceFile,
        importFrom,
        names: [{ name: 'ConstClass', isType: false }],
      });

      if (importEdit) {
        edits.push(importEdit);
      }
    }

    let output = source;

    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, classes, calls, manual };
  }
}
