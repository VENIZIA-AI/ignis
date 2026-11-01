import type ts from 'typescript';
import type { INamespaceMapping } from './mapping';

type TTypeScript = typeof ts;

export interface INamespaceFunctionsReport {
  line: number;
  column: number;
  reason: string;
}

export interface INamespaceFunctionsResult {
  output: string;
  changed: boolean;
  /** How many calls were rewritten. */
  rewritten: number;
  /** What the codemod found and left for a person, with where. */
  reports: INamespaceFunctionsReport[];
}

interface IEdit {
  start: number;
  end: number;
  text: string;
}

/** One way the file reaches an old name: a named import of it, or a namespace import of its module. */
interface IBinding {
  mapping: INamespaceMapping;
  declaration: ts.ImportDeclaration;
  module: string;
  /** The local name: of the imported function, or of the namespace. */
  local: string;
  /** The identifier that declares `local`. */
  declarationName: ts.Identifier;
  /** The named import; `undefined` for `import * as name`. */
  specifier?: ts.ImportSpecifier;
}

/** A matched use of an old name: a call to rewrite, or any other use, which is reported. */
interface IUses {
  calls: ts.CallExpression[];
  values: ts.Node[];
}

/**
 * Rewrites the calls of functions that moved into a class, `oldName(a, b)` to
 * `ClassName.method({ first: a, second: b })`, from a mapping table. Syntactic: it reads one file and
 * needs no type checker, so it only follows names imported from a module the table lists. Every edit
 * is a text edit by position: the argument text, its comments and the untouched code stay as they are.
 */
export class NamespaceFunctions {
  static rewrite(opts: {
    typescript: TTypeScript;
    fileName: string;
    source: string;
    mappings: ReadonlyArray<INamespaceMapping>;
  }): INamespaceFunctionsResult {
    const { typescript, fileName, source, mappings } = opts;
    const sourceFile = typescript.createSourceFile(
      fileName,
      source,
      typescript.ScriptTarget.Latest,
      true,
    );
    const reports: INamespaceFunctionsReport[] = [];

    const report = (reportOpts: { node: ts.Node; reason: string }) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        reportOpts.node.getStart(sourceFile),
      );
      reports.push({ line: line + 1, column: character + 1, reason: reportOpts.reason });
    };

    const lineOf = (node: ts.Node) =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const byModule = new Map<string, INamespaceMapping[]>();
    for (const mapping of mappings) {
      for (const module of mapping.modules) {
        byModule.set(module, [...(byModule.get(module) ?? []), mapping]);
      }
    }

    const bindings = NamespaceFunctions.findBindings({
      typescript,
      sourceFile,
      byModule,
      report,
    });
    if (bindings.length === 0) {
      return { output: source, changed: false, rewritten: 0, reports };
    }

    const identifiers = NamespaceFunctions.collectIdentifiers({ typescript, sourceFile });
    const declarationsOf = (name: string) =>
      (identifiers.get(name) ?? []).filter((identifier) =>
        NamespaceFunctions.isDeclarationName({ typescript, identifier }),
      );

    const edits: IEdit[] = [];
    const removals = new Set<ts.ImportSpecifier>();
    /** The imports that lose an old name. */
    const trimmed = new Set<ts.ImportDeclaration>();
    const additions = new Map<ts.ImportDeclaration, Set<string>>();
    const newImports = new Map<string, { anchor: ts.ImportDeclaration; names: Set<string> }>();
    /** The class names this run imports, and from which module. */
    const planned = new Map<string, string>();
    let rewritten = 0;

    for (const binding of bindings) {
      const { mapping } = binding;
      const uses = NamespaceFunctions.findUses({ typescript, binding, identifiers });
      if (uses.calls.length === 0 && uses.values.length === 0) {
        continue;
      }

      const target = NamespaceFunctions.describeTarget({ mapping });

      for (const value of uses.values) {
        report({
          node: value,
          reason: `\`${mapping.oldName}\` is used as a value (passed, stored, exported or in typeof), so its import stays; change it by hand to ${mapping.className}.${mapping.method}`,
        });
      }

      if (uses.calls.length === 0) {
        continue;
      }

      const shadow = declarationsOf(binding.local).find(
        (identifier) => identifier !== binding.declarationName,
      );
      if (shadow) {
        report({
          node: shadow,
          reason: `\`${binding.local}\` is declared again in this file, so a call cannot be told apart from the import; rewrite the calls of \`${mapping.oldName}\` by hand as ${target}`,
        });
        continue;
      }

      const classModules = mapping.newModules ?? [binding.module];
      const isNamespaceReach = !binding.specifier && classModules.includes(binding.module);
      let classReference = `${binding.local}.${mapping.className}`;
      let needsImport = false;

      if (!isNamespaceReach) {
        const existing = NamespaceFunctions.findClassImport({
          typescript,
          sourceFile,
          className: mapping.className,
          modules: classModules,
        });
        const plannedModule = planned.get(mapping.className);
        const conflict = existing
          ? declarationsOf(existing.text).find((identifier) => identifier !== existing)
          : plannedModule === undefined
            ? declarationsOf(mapping.className)[0]
            : undefined;

        if (conflict) {
          report({
            node: uses.calls[0] ?? conflict,
            reason: `the name \`${conflict.text}\` is already declared in this file (line ${lineOf(conflict)}), so \`${mapping.oldName}\` is left; rewrite its calls by hand as ${target}`,
          });
          continue;
        }

        if (!existing && plannedModule !== undefined && !classModules.includes(plannedModule)) {
          report({
            node: uses.calls[0] ?? binding.declaration,
            reason: `\`${mapping.className}\` would be imported from both ${plannedModule} and ${classModules[0]}; rewrite the calls of \`${mapping.oldName}\` by hand as ${target}`,
          });
          continue;
        }

        classReference = existing?.text ?? mapping.className;
        needsImport = !existing && plannedModule === undefined;
      }

      let count = 0;
      let left = uses.values.length;

      for (const call of uses.calls) {
        const problem = NamespaceFunctions.checkCall({ typescript, call, mapping });
        if (problem) {
          left += 1;
          report({ node: call, reason: `${problem}; rewrite it by hand as ${target}` });
          continue;
        }

        edits.push(
          ...NamespaceFunctions.planCall({
            typescript,
            sourceFile,
            call,
            mapping,
            callee: `${classReference}.${mapping.method}`,
          }),
        );
        count += 1;
      }

      rewritten += count;
      if (count === 0) {
        continue;
      }

      if (needsImport) {
        const sameDeclaration =
          binding.specifier && classModules.includes(binding.module)
            ? binding.declaration
            : undefined;
        const declaration =
          sameDeclaration ??
          NamespaceFunctions.findNamedImport({ typescript, sourceFile, modules: classModules });

        if (declaration) {
          additions.set(
            declaration,
            new Set([...(additions.get(declaration) ?? []), mapping.className]),
          );
          planned.set(
            mapping.className,
            sameDeclaration ? binding.module : NamespaceFunctions.moduleOf({ declaration }),
          );
        } else {
          const module = classModules[0] ?? binding.module;
          const entry = newImports.get(module) ?? {
            anchor: binding.declaration,
            names: new Set<string>(),
          };
          entry.names.add(mapping.className);
          newImports.set(module, entry);
          planned.set(mapping.className, module);
        }
      }

      if (binding.specifier && left === 0) {
        removals.add(binding.specifier);
        trimmed.add(binding.declaration);
      }
    }

    if (rewritten === 0) {
      return { output: source, changed: false, rewritten: 0, reports };
    }

    for (const declaration of new Set([...additions.keys(), ...trimmed])) {
      edits.push(
        ...NamespaceFunctions.planImport({
          typescript,
          sourceFile,
          declaration,
          removals,
          additions: [...(additions.get(declaration) ?? [])],
          report,
        }),
      );
    }

    for (const [module, { anchor, names }] of newImports) {
      const quote = source.charAt(anchor.moduleSpecifier.getStart(sourceFile));
      edits.push({
        start: anchor.getStart(sourceFile),
        end: anchor.getStart(sourceFile),
        text: `import { ${[...names].join(', ')} } from ${quote}${module}${quote};\n`,
      });
    }

    // At one position a replacement (the longer range) is applied before an insertion, so the
    // inserted key of an outer call lands in front of the rewritten callee of an inner one.
    let output = source;
    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, rewritten, reports };
  }

  /** The named and namespace imports of an old name; reports the type-only imports and the re-exports. */
  private static findBindings(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    byModule: Map<string, INamespaceMapping[]>;
    report: (reportOpts: { node: ts.Node; reason: string }) => void;
  }): IBinding[] {
    const { typescript, sourceFile, byModule, report } = opts;
    const bindings: IBinding[] = [];

    for (const statement of sourceFile.statements) {
      if (
        typescript.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        typescript.isStringLiteral(statement.moduleSpecifier) &&
        statement.exportClause &&
        typescript.isNamedExports(statement.exportClause)
      ) {
        const candidates = byModule.get(statement.moduleSpecifier.text) ?? [];
        for (const element of statement.exportClause.elements) {
          const name = (element.propertyName ?? element.name).text;
          const mapping = candidates.find((candidate) => candidate.oldName === name);
          if (mapping) {
            report({
              node: element,
              reason: `re-exports \`${name}\`; re-export ${mapping.className} as well, by hand (the old name goes away in 0.5)`,
            });
          }
        }
        continue;
      }

      if (
        !typescript.isImportDeclaration(statement) ||
        !typescript.isStringLiteral(statement.moduleSpecifier) ||
        !statement.importClause
      ) {
        continue;
      }

      const module = statement.moduleSpecifier.text;
      const candidates = byModule.get(module);
      const clause = statement.importClause;
      const named = clause.namedBindings;
      if (!candidates || !named) {
        continue;
      }

      if (typescript.isNamespaceImport(named)) {
        if (clause.isTypeOnly) {
          continue;
        }

        for (const mapping of candidates) {
          bindings.push({
            mapping,
            declaration: statement,
            module,
            local: named.name.text,
            declarationName: named.name,
          });
        }
        continue;
      }

      for (const element of named.elements) {
        const imported = (element.propertyName ?? element.name).text;
        const mapping = candidates.find((candidate) => candidate.oldName === imported);
        if (!mapping) {
          continue;
        }

        if (clause.isTypeOnly || element.isTypeOnly) {
          report({
            node: element,
            reason: `\`${imported}\` is imported as a type only; change it by hand to \`typeof ${mapping.className}.${mapping.method}\``,
          });
          continue;
        }

        bindings.push({
          mapping,
          declaration: statement,
          module,
          local: element.name.text,
          declarationName: element.name,
          specifier: element,
        });
      }
    }

    return bindings;
  }

  /** Every identifier of the file by its text; JSDoc is not walked, so a `{@link name}` never counts. */
  private static collectIdentifiers(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
  }): Map<string, ts.Identifier[]> {
    const { typescript, sourceFile } = opts;
    const identifiers = new Map<string, ts.Identifier[]>();

    const walk = (node: ts.Node): void => {
      if (typescript.isIdentifier(node)) {
        identifiers.set(node.text, [...(identifiers.get(node.text) ?? []), node]);
      }

      typescript.forEachChild(node, walk);
    };

    walk(sourceFile);
    return identifiers;
  }

  /** The calls of the old name, and every other use of it. */
  private static findUses(opts: {
    typescript: TTypeScript;
    binding: IBinding;
    identifiers: Map<string, ts.Identifier[]>;
  }): IUses {
    const { typescript, binding, identifiers } = opts;
    const uses: IUses = { calls: [], values: [] };

    for (const identifier of identifiers.get(binding.local) ?? []) {
      if (
        identifier === binding.declarationName ||
        !NamespaceFunctions.isReference({ typescript, identifier })
      ) {
        continue;
      }

      if (!binding.specifier) {
        const parent = identifier.parent;
        const isMember =
          typescript.isPropertyAccessExpression(parent) &&
          parent.expression === identifier &&
          parent.name.text === binding.mapping.oldName;

        if (isMember) {
          const call = parent.parent;
          if (typescript.isCallExpression(call) && call.expression === parent) {
            uses.calls.push(call);
          } else {
            uses.values.push(parent);
          }
          continue;
        }

        if (
          typescript.isQualifiedName(parent) &&
          parent.left === identifier &&
          parent.right.text === binding.mapping.oldName
        ) {
          uses.values.push(parent);
        }
        continue;
      }

      const parent = identifier.parent;
      if (typescript.isCallExpression(parent) && parent.expression === identifier) {
        uses.calls.push(parent);
        continue;
      }

      uses.values.push(identifier);
    }

    return uses;
  }

  /** The identifier names a declaration: a variable, a parameter, a function, a class, an import, a type. */
  private static isDeclarationName(opts: {
    typescript: TTypeScript;
    identifier: ts.Identifier;
  }): boolean {
    const { typescript, identifier } = opts;
    const parent = identifier.parent;

    if (
      typescript.isVariableDeclaration(parent) ||
      typescript.isParameter(parent) ||
      typescript.isBindingElement(parent) ||
      typescript.isFunctionDeclaration(parent) ||
      typescript.isFunctionExpression(parent) ||
      typescript.isClassDeclaration(parent) ||
      typescript.isClassExpression(parent) ||
      typescript.isEnumDeclaration(parent) ||
      typescript.isInterfaceDeclaration(parent) ||
      typescript.isTypeAliasDeclaration(parent) ||
      typescript.isModuleDeclaration(parent) ||
      typescript.isImportSpecifier(parent) ||
      typescript.isImportClause(parent) ||
      typescript.isNamespaceImport(parent) ||
      typescript.isImportEqualsDeclaration(parent) ||
      typescript.isTypeParameterDeclaration(parent)
    ) {
      return parent.name === identifier;
    }

    return false;
  }

  /** The identifier reads a binding: not a property name, a label, a declaration or a lowercase JSX tag. */
  private static isReference(opts: {
    typescript: TTypeScript;
    identifier: ts.Identifier;
  }): boolean {
    const { typescript, identifier } = opts;
    const parent = identifier.parent;

    if (NamespaceFunctions.isDeclarationName({ typescript, identifier })) {
      return false;
    }

    if (typescript.isPropertyAccessExpression(parent) || typescript.isQualifiedName(parent)) {
      return typescript.isPropertyAccessExpression(parent)
        ? parent.name !== identifier
        : parent.right !== identifier;
    }

    if (
      typescript.isPropertyAssignment(parent) ||
      typescript.isPropertyDeclaration(parent) ||
      typescript.isPropertySignature(parent) ||
      typescript.isMethodDeclaration(parent) ||
      typescript.isMethodSignature(parent) ||
      typescript.isGetAccessorDeclaration(parent) ||
      typescript.isSetAccessorDeclaration(parent) ||
      typescript.isEnumMember(parent) ||
      typescript.isJsxAttribute(parent)
    ) {
      return parent.name !== identifier;
    }

    if (typescript.isBindingElement(parent)) {
      return parent.propertyName !== identifier;
    }

    if (typescript.isExportSpecifier(parent)) {
      return (
        !parent.parent.parent.moduleSpecifier && (parent.propertyName ?? parent.name) === identifier
      );
    }

    if (
      typescript.isLabeledStatement(parent) ||
      typescript.isBreakOrContinueStatement(parent) ||
      typescript.isMetaProperty(parent)
    ) {
      return false;
    }

    if (
      (typescript.isJsxOpeningElement(parent) ||
        typescript.isJsxSelfClosingElement(parent) ||
        typescript.isJsxClosingElement(parent)) &&
      parent.tagName === identifier
    ) {
      return !/^[a-z]/.test(identifier.text);
    }

    return true;
  }

  /** Why a call cannot be rewritten, or `undefined` when it can. */
  private static checkCall(opts: {
    typescript: TTypeScript;
    call: ts.CallExpression;
    mapping: INamespaceMapping;
  }): string | undefined {
    const { typescript, call, mapping } = opts;
    const { params, restKey, oldName } = mapping;
    const count = call.arguments.length;

    if (mapping.keepsOptions) {
      return undefined;
    }

    if (call.arguments.some((argument) => typescript.isSpreadElement(argument))) {
      return `this call of \`${oldName}\` has a spread argument`;
    }

    const required = params.reduce(
      (last, parameter, index) => (parameter.optional ? last : index + 1),
      0,
    );
    if (count < required) {
      return `this call of \`${oldName}\` passes ${count} argument(s), fewer than the ${required} it needs`;
    }

    if (restKey === undefined && count > params.length) {
      return `this call of \`${oldName}\` passes ${count} argument(s), more than its ${params.length} parameter(s)`;
    }

    return undefined;
  }

  /** The edits that turn one call into the class form; the arguments keep their text and comments. */
  private static planCall(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    call: ts.CallExpression;
    mapping: INamespaceMapping;
    callee: string;
  }): IEdit[] {
    const { typescript, sourceFile, call, mapping, callee } = opts;
    const { params, restKey } = mapping;
    const edits: IEdit[] = [
      { start: call.expression.getStart(sourceFile), end: call.expression.end, text: callee },
    ];

    if (call.questionDotToken) {
      edits.push({
        start: call.questionDotToken.getStart(sourceFile),
        end: call.questionDotToken.end,
        text: '',
      });
    }

    if (mapping.keepsOptions) {
      return edits;
    }

    const argumentList = [...call.arguments];
    if (argumentList.length === 0) {
      if (params.length > 0 || restKey !== undefined) {
        const text = restKey === undefined ? '{}' : `{ ${restKey}: [] }`;
        edits.push({ start: call.arguments.pos, end: call.arguments.pos, text });
      }
      return edits;
    }

    const insert = (insertOpts: { at: number; text: string }) => {
      if (insertOpts.text !== '') {
        edits.push({ start: insertOpts.at, end: insertOpts.at, text: insertOpts.text });
      }
    };

    const positional = argumentList.slice(0, params.length);
    const rest = argumentList.slice(params.length);

    positional.forEach((argument, index) => {
      const key = params[index]?.key ?? '';
      const isShorthand = typescript.isIdentifier(argument) && argument.text === key;
      insert({
        at: argument.getStart(sourceFile),
        text: `${index === 0 ? '{ ' : ''}${isShorthand ? '' : `${key}: `}`,
      });
    });

    const first = rest[0];
    const last = argumentList[argumentList.length - 1];
    let suffix = ' }';

    if (first && restKey !== undefined) {
      insert({
        at: first.getStart(sourceFile),
        text: `${positional.length === 0 ? '{ ' : ''}${restKey}: [`,
      });
      suffix = '] }';
    } else if (restKey !== undefined) {
      suffix = `, ${restKey}: [] }`;
    }

    insert({ at: last?.end ?? call.arguments.end, text: suffix });
    return edits;
  }

  /** The local name of a value import of the class from one of `modules`. */
  private static findClassImport(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    className: string;
    modules: string[];
  }): ts.Identifier | undefined {
    const { typescript, sourceFile, className, modules } = opts;

    for (const statement of sourceFile.statements) {
      const declaration = NamespaceFunctions.asValueImport({ typescript, statement, modules });
      const named = declaration?.importClause?.namedBindings;
      if (!named || !typescript.isNamedImports(named)) {
        continue;
      }

      const element = named.elements.find(
        (candidate) =>
          !candidate.isTypeOnly && (candidate.propertyName ?? candidate.name).text === className,
      );
      if (element) {
        return element.name;
      }
    }

    return undefined;
  }

  /** The first value import with braces from one of `modules`, to add a class to. */
  private static findNamedImport(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    modules: string[];
  }): ts.ImportDeclaration | undefined {
    const { typescript, sourceFile, modules } = opts;

    for (const statement of sourceFile.statements) {
      const declaration = NamespaceFunctions.asValueImport({ typescript, statement, modules });
      const named = declaration?.importClause?.namedBindings;
      if (declaration && named && typescript.isNamedImports(named)) {
        return declaration;
      }
    }

    return undefined;
  }

  /** `statement` as an import that is not `import type`, from one of `modules`. */
  private static asValueImport(opts: {
    typescript: TTypeScript;
    statement: ts.Statement;
    modules: string[];
  }): ts.ImportDeclaration | undefined {
    const { typescript, statement, modules } = opts;

    if (
      typescript.isImportDeclaration(statement) &&
      typescript.isStringLiteral(statement.moduleSpecifier) &&
      modules.includes(statement.moduleSpecifier.text) &&
      statement.importClause &&
      !statement.importClause.isTypeOnly
    ) {
      return statement;
    }

    return undefined;
  }

  private static moduleOf(opts: { declaration: ts.ImportDeclaration }): string {
    const specifier = opts.declaration.moduleSpecifier;
    return 'text' in specifier && typeof specifier.text === 'string' ? specifier.text : '';
  }

  /**
   * The edit of one import's braces: the removed old names go, the added classes take the place of
   * the first removed one. Braces that hold a comment are not rewritten: the classes are appended
   * and the old names stay, reported. An import left with nothing is removed.
   */
  private static planImport(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    declaration: ts.ImportDeclaration;
    removals: Set<ts.ImportSpecifier>;
    additions: string[];
    report: (reportOpts: { node: ts.Node; reason: string }) => void;
  }): IEdit[] {
    const { typescript, sourceFile, declaration, removals, additions, report } = opts;
    const clause = declaration.importClause;
    const named = clause?.namedBindings;
    if (!clause || !named || !typescript.isNamedImports(named)) {
      return [];
    }

    const source = sourceFile.text;
    const elements = [...named.elements];
    const braces = source.slice(named.getStart(sourceFile), named.end);

    if (/\/\*|\/\//.test(braces)) {
      for (const element of elements.filter((candidate) => removals.has(candidate))) {
        report({
          node: element,
          reason: `the braces of this import hold a comment, so \`${element.name.text}\` stays imported; remove it by hand`,
        });
      }

      const last = elements[elements.length - 1];
      if (!last || additions.length === 0) {
        return [];
      }

      return [{ start: last.end, end: last.end, text: `, ${additions.join(', ')}` }];
    }

    const items: string[] = [];
    let isPlaced = false;
    for (const element of elements) {
      if (!removals.has(element)) {
        items.push(element.getText(sourceFile));
        continue;
      }

      if (!isPlaced) {
        items.push(...additions);
        isPlaced = true;
      }
    }

    if (!isPlaced) {
      items.push(...additions);
    }

    if (items.length > 0) {
      const start = named.getStart(sourceFile);
      const lineStart = source.lastIndexOf('\n', declaration.getStart(sourceFile)) + 1;
      const indent = /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? '';
      const text = braces.includes('\n')
        ? `{\n${indent}  ${items.join(`,\n${indent}  `)},\n${indent}}`
        : `{ ${items.join(', ')} }`;

      return [{ start, end: named.end, text }];
    }

    if (clause.name) {
      return [{ start: clause.name.end, end: named.end, text: '' }];
    }

    const start = declaration.getStart(sourceFile);
    const newline = /^\r?\n/.exec(source.slice(declaration.end))?.[0] ?? '';
    return [{ start, end: declaration.end + newline.length, text: '' }];
  }

  /** The call the old one becomes, for a report: `ParseUtility.toFloat({ input, digit })`. */
  private static describeTarget(opts: { mapping: INamespaceMapping }): string {
    const { className, method, params, restKey } = opts.mapping;
    const keys = [...params.map((parameter) => parameter.key), ...(restKey ? [restKey] : [])];
    return keys.length === 0
      ? `${className}.${method}()`
      : `${className}.${method}({ ${keys.join(', ')} })`;
  }
}
