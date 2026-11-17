import type ts from 'typescript';
import type { INamespaceMapping } from './mapping';
import { type INamespaceFunctionsReport, NamespaceFunctions } from './rewriter';

type TTypeScript = typeof ts;

/** Passes a file takes at most: each one converts the calls that hold no other convertible call. */
const MAX_PASSES = 32;

export interface INamespaceFunctionsReverseResult {
  output: string;
  changed: boolean;
  /** How many calls went back to the old function. */
  rewritten: number;
  /** What was left for a person, with where. */
  reports: INamespaceFunctionsReport[];
}

interface IBinding {
  mapping: INamespaceMapping;
  /** The local name of the class. */
  local: string;
}

/**
 * The inverse of {@link NamespaceFunctions}: `ClassName.method({ first: a, second: b })` goes back to
 * `oldName(a, b)` by the same table, and the import follows. Syntactic, one file, text edits by position.
 *
 * It follows a named import of the class from a module the entry lists. It leaves, and reports, a call
 * whose argument is not one object literal of the entry's keys (a spread, a method, a computed key, a key
 * the entry does not know, a missing required key), and a file that already declares the old name.
 */
export class NamespaceFunctionsReverse {
  static rewrite(opts: {
    typescript: TTypeScript;
    fileName: string;
    source: string;
    mappings: ReadonlyArray<INamespaceMapping>;
  }): INamespaceFunctionsReverseResult {
    const { typescript, fileName, mappings } = opts;
    const needed = new Map<string, INamespaceMapping>();
    let source = opts.source;
    let rewritten = 0;
    let reports: INamespaceFunctionsReport[] = [];

    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const parsed = NamespaceFunctionsReverse.pass({ typescript, fileName, source, mappings });
      reports = parsed.reports;

      if (parsed.calls === 0) {
        break;
      }

      source = parsed.output;
      rewritten += parsed.calls;

      for (const mapping of parsed.used) {
        needed.set(mapping.oldName, mapping);
      }
    }

    if (rewritten === 0) {
      return { output: opts.source, changed: false, rewritten: 0, reports };
    }

    const imported = NamespaceFunctionsReverse.fixImports({
      typescript,
      fileName,
      source,
      mappings,
      needed: [...needed.values()],
    });

    return {
      output: imported.output,
      changed: imported.output !== opts.source,
      rewritten,
      reports: [...reports, ...imported.reports],
    };
  }

  /** One pass: converts every convertible call that holds no other convertible call. */
  private static pass(opts: {
    typescript: TTypeScript;
    fileName: string;
    source: string;
    mappings: ReadonlyArray<INamespaceMapping>;
  }): {
    output: string;
    calls: number;
    used: INamespaceMapping[];
    reports: INamespaceFunctionsReport[];
  } {
    const { typescript: t, fileName, source, mappings } = opts;
    const sourceFile = t.createSourceFile(fileName, source, t.ScriptTarget.Latest, true);
    const reports: INamespaceFunctionsReport[] = [];
    const bindings = NamespaceFunctionsReverse.findBindings({
      typescript: t,
      sourceFile,
      mappings,
    });
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const used: INamespaceMapping[] = [];

    const report = (node: ts.Node, reason: string) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      reports.push({ line: line + 1, column: character + 1, reason });
    };

    const target = (call: ts.CallExpression): IBinding | undefined => {
      const callee = call.expression;

      if (!t.isPropertyAccessExpression(callee) || !t.isIdentifier(callee.expression)) {
        return undefined;
      }

      const binding = bindings.get(`${callee.expression.text}.${callee.name.text}`);

      return binding;
    };

    const holdsTarget = (node: ts.Node): boolean => {
      let isFound = false;

      const walk = (child: ts.Node) => {
        if (isFound) {
          return;
        }

        if (t.isCallExpression(child) && target(child)) {
          isFound = true;

          return;
        }

        t.forEachChild(child, walk);
      };

      t.forEachChild(node, walk);

      return isFound;
    };

    const visit = (node: ts.Node): void => {
      if (t.isCallExpression(node)) {
        const binding = target(node);

        if (binding && !node.arguments.some(holdsTarget)) {
          const text = NamespaceFunctionsReverse.convert({
            typescript: t,
            sourceFile,
            call: node,
            mapping: binding.mapping,
            report,
          });

          if (text !== undefined) {
            edits.push({ start: node.getStart(sourceFile), end: node.end, text });
            used.push(binding.mapping);
          }

          return;
        }
      }

      t.forEachChild(node, visit);
    };

    visit(sourceFile);

    let output = source;

    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, calls: edits.length, used, reports };
  }

  /** `Local.method` to the entry, for every named import of a class an entry moved to. */
  private static findBindings(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    mappings: ReadonlyArray<INamespaceMapping>;
  }): Map<string, IBinding> {
    const { typescript: t, sourceFile, mappings } = opts;
    const bindings = new Map<string, IBinding>();

    for (const statement of sourceFile.statements) {
      const named = t.isImportDeclaration(statement)
        ? statement.importClause?.namedBindings
        : undefined;

      if (
        !t.isImportDeclaration(statement) ||
        !t.isStringLiteral(statement.moduleSpecifier) ||
        statement.importClause?.isTypeOnly ||
        !named ||
        !t.isNamedImports(named)
      ) {
        continue;
      }

      const module = statement.moduleSpecifier.text;

      for (const element of named.elements) {
        if (element.isTypeOnly) {
          continue;
        }

        const className = (element.propertyName ?? element.name).text;

        for (const mapping of mappings) {
          if (
            mapping.className !== className ||
            !(mapping.newModules ?? mapping.modules).includes(module)
          ) {
            continue;
          }

          const key = `${element.name.text}.${mapping.method}`;

          if (!bindings.has(key)) {
            bindings.set(key, { mapping, local: element.name.text });
          }
        }
      }
    }

    return bindings;
  }

  /** The text of the old call, or `undefined` (reported) when the argument is not what the entry wrote. */
  private static convert(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    call: ts.CallExpression;
    mapping: INamespaceMapping;
    report: (node: ts.Node, reason: string) => void;
  }): string | undefined {
    const { typescript: t, sourceFile, call, mapping, report } = opts;
    const text = (node: ts.Node) => node.getText(sourceFile);
    const callee = `${mapping.oldName}${call.questionDotToken ? '?.' : ''}`;

    if (mapping.keepsOptions) {
      return `${callee}(${call.arguments.map(text).join(', ')})`;
    }

    const [argument] = call.arguments;
    const label = `${mapping.className}.${mapping.method}`;

    const isBare = call.arguments.length === 0;

    if (
      !isBare &&
      (call.arguments.length !== 1 || !argument || !t.isObjectLiteralExpression(argument))
    ) {
      report(
        call,
        `\`${label}\` is not called with one object literal, so it stays; rewrite it by hand`,
      );

      return undefined;
    }

    const values = new Map<string, string>();

    const properties = argument && t.isObjectLiteralExpression(argument) ? argument.properties : [];

    for (const property of properties) {
      const key = property.name && t.isIdentifier(property.name) ? property.name.text : undefined;

      if (t.isShorthandPropertyAssignment(property)) {
        values.set(property.name.text, property.name.text);
      } else if (t.isPropertyAssignment(property) && key !== undefined) {
        values.set(key, text(property.initializer));
      } else {
        report(
          property,
          `\`${label}\` has an argument it cannot read (a spread, a method or a computed key), so it stays`,
        );

        return undefined;
      }
    }

    const known = new Set([
      ...mapping.params.map((parameter) => parameter.key),
      ...(mapping.restKey ? [mapping.restKey] : []),
    ]);
    const unknown = [...values.keys()].filter((key) => !known.has(key));

    if (unknown.length > 0) {
      report(
        call,
        `\`${label}\` has the key ${unknown.map((key) => `"${key}"`).join(', ')} that the entry does not know, so it stays`,
      );

      return undefined;
    }

    const positional: Array<string | undefined> = [];

    for (const parameter of mapping.params) {
      const value = values.get(parameter.key);

      if (value === undefined && !parameter.optional) {
        report(call, `\`${label}\` lacks the required key "${parameter.key}", so it stays`);

        return undefined;
      }

      positional.push(value);
    }

    const rest =
      mapping.restKey === undefined
        ? undefined
        : NamespaceFunctionsReverse.restValues({
            typescript: t,
            sourceFile,
            properties,
            key: mapping.restKey,
          });

    while (positional.length > 0 && positional[positional.length - 1] === undefined) {
      positional.pop();
    }

    const list = [...positional.map((value) => value ?? 'undefined'), ...(rest ?? [])];

    return `${callee}(${list.join(', ')})`;
  }

  /** The rest arguments: an array literal's elements, or `...expression` for any other value. */
  private static restValues(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    properties: ReadonlyArray<ts.ObjectLiteralElementLike>;
    key: string;
  }): string[] {
    const { typescript: t, sourceFile, properties, key } = opts;

    for (const property of properties) {
      const name = property.name && t.isIdentifier(property.name) ? property.name.text : undefined;

      if (name !== key) {
        continue;
      }

      if (t.isShorthandPropertyAssignment(property)) {
        return [`...${key}`];
      }

      if (t.isPropertyAssignment(property)) {
        return t.isArrayLiteralExpression(property.initializer)
          ? property.initializer.elements.map((element) => element.getText(sourceFile))
          : [`...${property.initializer.getText(sourceFile)}`];
      }
    }

    return [];
  }

  /** Imports the old names the converted calls use and drops a class nothing uses any more. */
  private static fixImports(opts: {
    typescript: TTypeScript;
    fileName: string;
    source: string;
    mappings: ReadonlyArray<INamespaceMapping>;
    needed: INamespaceMapping[];
  }): { output: string; reports: INamespaceFunctionsReport[] } {
    const { typescript: t, fileName, source, needed } = opts;
    const sourceFile = t.createSourceFile(fileName, source, t.ScriptTarget.Latest, true);
    const reports: INamespaceFunctionsReport[] = [];

    const report = (reportOpts: { node: ts.Node; reason: string }) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        reportOpts.node.getStart(sourceFile),
      );
      reports.push({ line: line + 1, column: character + 1, reason: reportOpts.reason });
    };

    const counts = new Map<string, number>();
    const declared = new Set<string>();

    const count = (node: ts.Node): void => {
      if (t.isIdentifier(node)) {
        counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
      }

      const isDeclaration =
        t.isVariableDeclaration(node) ||
        t.isFunctionDeclaration(node) ||
        t.isClassDeclaration(node) ||
        t.isParameter(node) ||
        t.isBindingElement(node) ||
        t.isImportSpecifier(node) ||
        t.isImportClause(node);

      if (isDeclaration && node.name && t.isIdentifier(node.name)) {
        declared.add(node.name.text);
      }

      t.forEachChild(node, count);
    };

    count(sourceFile);

    const edits: Array<{ start: number; end: number; text: string }> = [];
    const additions = new Map<ts.ImportDeclaration, string[]>();
    const removals = new Map<ts.ImportDeclaration, Set<ts.ImportSpecifier>>();
    const orphans: string[] = [];

    // A class nothing but its import mentions: the import goes, and the old name takes its place in it.
    const home = new Map<string, ts.ImportDeclaration>();

    for (const statement of sourceFile.statements) {
      const named = t.isImportDeclaration(statement)
        ? statement.importClause?.namedBindings
        : undefined;

      if (
        !t.isImportDeclaration(statement) ||
        !named ||
        !t.isNamedImports(named) ||
        statement.importClause?.isTypeOnly
      ) {
        continue;
      }

      for (const element of named.elements) {
        const className = (element.propertyName ?? element.name).text;
        const moved = needed.filter((candidate) => candidate.className === className);

        if (moved.length > 0 && !element.isTypeOnly && (counts.get(element.name.text) ?? 0) === 1) {
          removals.set(statement, (removals.get(statement) ?? new Set()).add(element));

          for (const mapping of moved) {
            home.set(mapping.oldName, statement);
          }
        }
      }
    }

    for (const mapping of needed) {
      const isDeclared = declared.has(mapping.oldName);
      const existing = NamespaceFunctions.findNamedImport({
        typescript: t,
        sourceFile,
        modules: mapping.modules,
      });
      const alreadyImported =
        existing?.importClause?.namedBindings &&
        t.isNamedImports(existing.importClause.namedBindings) &&
        existing.importClause.namedBindings.elements.some(
          (element) => element.name.text === mapping.oldName,
        );

      if (alreadyImported) {
        continue;
      }

      if (isDeclared) {
        report({
          node: sourceFile,
          reason: `\`${mapping.oldName}\` is already declared in this file, so its import was not added; check the calls just converted`,
        });
        continue;
      }

      const homeDeclaration = home.get(mapping.oldName);
      const homeModule =
        homeDeclaration && t.isStringLiteral(homeDeclaration.moduleSpecifier)
          ? homeDeclaration.moduleSpecifier.text
          : '';
      const target =
        homeDeclaration && mapping.modules.includes(homeModule) ? homeDeclaration : existing;

      if (target) {
        additions.set(target, [...(additions.get(target) ?? []), mapping.oldName]);
        continue;
      }

      orphans.push(`import { ${mapping.oldName} } from '${mapping.modules[0]}';`);
    }

    for (const declaration of new Set([...additions.keys(), ...removals.keys()])) {
      edits.push(
        ...NamespaceFunctions.planImport({
          typescript: t,
          sourceFile,
          declaration,
          removals: removals.get(declaration) ?? new Set(),
          additions: additions.get(declaration) ?? [],
          report,
        }),
      );
    }

    if (orphans.length > 0) {
      const imports = sourceFile.statements.filter((statement) => t.isImportDeclaration(statement));
      const last = imports[imports.length - 1];
      const at = last ? last.end : 0;
      edits.push({
        start: at,
        end: at,
        text: `${last ? '\n' : ''}${orphans.join('\n')}${last ? '' : '\n'}`,
      });
    }

    let output = source;

    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, reports };
  }
}
