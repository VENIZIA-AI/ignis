import { relative } from 'node:path';
import type TypeScript from 'typescript';

type TTypeScript = typeof TypeScript;

/** The type whose annotation loses the schemas of a route config. */
const CONFIG_TYPE = 'IAuthRouteConfig';
const RULE = 'typed-route-context';
/** How many times the projects are typechecked with candidates written, at most. */
const ROUND_LIMIT = 40;

/** Why a config declared wide is left as it is. */
class LeftReasons {
  static readonly LET = 'declared with let';
  static readonly VAR = 'declared with var';
  static readonly NO_INITIALIZER = 'no initializer';
  static readonly NOT_LITERAL = 'its value is not an object literal';
  static readonly OTHER_ASSERTION = 'its value is asserted to another type';
  static readonly PATTERN = 'a destructuring pattern';
  static readonly OPTIONAL = 'an optional or definite property';
  static readonly MUTABLE_PROPERTY = 'a property that is not readonly';
  static readonly DISABLED = 'the lint rule is turned off here';
  static readonly IMPORT_TYPE = 'typed through import()';
  static readonly OPEN_KEY = 'indexed with a key that is not a literal';
  static readonly ABSENT_KEY = 'indexed with a key the object does not hold';
}

/** The calls that write to their first argument. */
const WRITING_CALLS = new Set([
  'Object.assign',
  'Object.defineProperty',
  'Object.defineProperties',
  'Reflect.set',
  'Reflect.defineProperty',
  'Reflect.deleteProperty',
]);

export interface ITextEdit {
  start: number;
  end: number;
  text: string;
}

/** A config the codemod leaves declared wide, and why. */
export interface ILeftConfig {
  file: string;
  line: number;
  name: string;
  reason: string;
}

/** One annotation or assertion that can become `satisfies`, as far as its own file tells. */
export interface ISatisfiesCandidate {
  file: string;
  line: number;
  name: string;
  /** The span of the declaration (or of the assertion, outside one) in the source. */
  start: number;
  end: number;
  /** Where the name of the declared binding starts; `undefined` for an assertion that declares none. */
  binding: number | undefined;
  /** Whether code outside the file can reach the declaration. */
  isExported: boolean;
  /** For a `Record`: the keys its literal writes. */
  recordKeys: ReadonlySet<string> | undefined;
  edits: ITextEdit[];
}

export interface IScannedFile {
  candidates: ISatisfiesCandidate[];
  left: ILeftConfig[];
}

/** Applies edits to a text, and moves positions between the text before and after them. */
export class TextEdits {
  /** The text of each file once the candidates are written, and the edits that make it. */
  static writeAll(opts: {
    sources: ReadonlyMap<string, string>;
    candidates: ISatisfiesCandidate[];
  }): { edits: Map<string, ITextEdit[]>; contents: Map<string, string> } {
    const edits = new Map<string, ITextEdit[]>();

    for (const { file, edits: own } of opts.candidates) {
      edits.set(file, [...(edits.get(file) ?? []), ...own]);
    }

    const contents = new Map(
      [...edits].map(([file, own]) => [
        file,
        TextEdits.apply({ source: opts.sources.get(file) ?? '', edits: own }),
      ]),
    );

    return { edits, contents };
  }

  static apply(opts: { source: string; edits: ITextEdit[] }): string {
    let output = opts.source;

    for (const edit of [...opts.edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return output;
  }

  static toSource(opts: { edits: ITextEdit[]; position: number }): number {
    let moved = 0;

    for (const edit of [...opts.edits].sort((a, b) => a.start - b.start || a.end - b.end)) {
      const start = edit.start + moved;

      if (opts.position < start) {
        break;
      }

      if (opts.position < start + edit.text.length) {
        return edit.start;
      }

      moved += edit.text.length - (edit.end - edit.start);
    }

    return opts.position - moved;
  }
}

/** The configs one file declares wide, in the forms `@venizia/typed-route-context` reports. */
class ConfigDeclarations {
  private readonly file: TypeScript.SourceFile;
  /** The type aliases of this file that stand for a wide config type. */
  private readonly aliases = new Map<string, TypeScript.TypeNode>();
  /** The assertions a declaration's own annotation already covers. */
  private readonly covered = new Set<TypeScript.Node>();
  private readonly result: IScannedFile = { candidates: [], left: [] };

  constructor(
    private readonly options: { typescript: TTypeScript; fileName: string; source: string },
  ) {
    const { typescript: ts, fileName, source } = options;
    const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    this.file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  }

  scan(): IScannedFile {
    const { typescript: ts } = this.options;

    for (const statement of this.file.statements) {
      if (ts.isTypeAliasDeclaration(statement) && !statement.typeParameters) {
        this.aliases.set(statement.name.text, statement.type);
      }
    }

    const visit = (node: TypeScript.Node): void => {
      if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
        this.readDeclaration(node);
      }

      if (ts.isAsExpression(node) && !this.covered.has(node)) {
        this.readAssertion(node);
      }

      ts.forEachChild(node, visit);
    };

    visit(this.file);

    return this.result;
  }

  /** Whether a type is `IAuthRouteConfig`, alone, in an `Omit` or `Readonly`, or as the value of a `Record`. */
  private isWide(type: TypeScript.TypeNode | undefined, seen = new Set<string>()): boolean {
    const { typescript: ts } = this.options;

    if (type && ts.isImportTypeNode(type)) {
      return type.qualifier?.getText(this.file) === CONFIG_TYPE;
    }

    if (!type || !ts.isTypeReferenceNode(type)) {
      return false;
    }

    const name = type.typeName.getText(this.file);
    const [first, second] = type.typeArguments ?? [];

    if (name === 'Record') {
      return this.isWide(second, seen);
    }

    if (name === 'Omit' || name === 'Readonly') {
      return this.isWide(first, seen);
    }

    const alias = this.aliases.get(name);

    if (alias && !seen.has(name)) {
      return this.isWide(alias, seen.add(name));
    }

    return name === CONFIG_TYPE;
  }

  private hasImportType(node: TypeScript.Node): boolean {
    return (
      this.options.typescript.isImportTypeNode(node) ||
      this.options.typescript.forEachChild(node, (child) =>
        this.hasImportType(child) ? true : undefined,
      ) === true
    );
  }

  private isRecord(type: TypeScript.TypeNode, seen = new Set<string>()): boolean {
    const { typescript: ts } = this.options;

    if (!ts.isTypeReferenceNode(type)) {
      return false;
    }

    const name = type.typeName.getText(this.file);
    const [first] = type.typeArguments ?? [];

    if (name === 'Readonly' && first) {
      return this.isRecord(first, seen);
    }

    const alias = this.aliases.get(name);

    if (alias && !seen.has(name)) {
      return this.isRecord(alias, seen.add(name));
    }

    return name === 'Record';
  }

  private unwrapped(expression: TypeScript.Expression): TypeScript.Expression {
    return this.options.typescript.isParenthesizedExpression(expression)
      ? this.unwrapped(expression.expression)
      : expression;
  }

  /** An empty object is a collection filled later, which the lint rule does not report. */
  private isFilledObject(expression: TypeScript.Expression): boolean {
    const value = this.unwrapped(expression);

    return this.options.typescript.isObjectLiteralExpression(value) && value.properties.length > 0;
  }

  private isConstAssertion(type: TypeScript.TypeNode): boolean {
    return type.getText(this.file) === 'const';
  }

  private readDeclaration(
    declaration: TypeScript.VariableDeclaration | TypeScript.PropertyDeclaration,
  ) {
    const { typescript: ts } = this.options;
    const { type, initializer } = declaration;

    if (!type || !this.isWide(type)) {
      return;
    }

    const value = initializer ? this.unwrapped(initializer) : undefined;
    const asserted = value && ts.isAsExpression(value) ? value : undefined;

    if (asserted) {
      this.covered.add(asserted);
    }

    const literal = asserted ? asserted.expression : value;

    // `for (const x of list)` takes its value from the list, and an empty object is filled later.
    const isEmpty =
      literal !== undefined &&
      ts.isObjectLiteralExpression(this.unwrapped(literal)) &&
      !this.isFilledObject(literal);

    if (isEmpty || ts.isForOfStatement(declaration.parent.parent)) {
      return;
    }

    const name = declaration.name.getText(this.file);
    const refusal = this.hasImportType(type)
      ? LeftReasons.IMPORT_TYPE
      : this.refusalOf(declaration);

    if (refusal) {
      this.leave({ node: declaration, name, reason: refusal });

      return;
    }

    if (!initializer || !literal || !this.isFilledObject(literal)) {
      this.leave({ node: declaration, name, reason: LeftReasons.NOT_LITERAL });

      return;
    }

    const typeText = type.getText(this.file);
    const edits = this.removeAnnotation({ declaration, type });

    if (!asserted || this.isConstAssertion(asserted.type)) {
      const end = initializer.getEnd();
      edits.push({ start: end, end, text: ` satisfies ${typeText}` });
    } else if (asserted.type.getText(this.file) === typeText) {
      edits.push(this.assertionToSatisfies(asserted));
    } else {
      this.leave({ node: declaration, name, reason: LeftReasons.OTHER_ASSERTION });

      return;
    }

    this.add({ node: declaration, declaration, name, type, literal, edits });
  }

  private isDeclaration(
    node: TypeScript.Node,
  ): node is TypeScript.VariableDeclaration | TypeScript.PropertyDeclaration {
    const { typescript: ts } = this.options;

    return ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node);
  }

  private readAssertion(assertion: TypeScript.AsExpression) {
    const { typescript: ts } = this.options;

    if (!this.isWide(assertion.type) || !this.isFilledObject(assertion.expression)) {
      return;
    }

    let node: TypeScript.Node = assertion.parent;

    // The declaration the assertion is part of the value of; one inside a function belongs to no outer declaration.
    while (!ts.isSourceFile(node) && !ts.isFunctionLike(node) && !this.isDeclaration(node)) {
      node = node.parent;
    }

    const current = this.isDeclaration(node) ? node : undefined;
    const name = current ? current.name.getText(this.file) : 'an assertion';
    const refusal = this.hasImportType(assertion.type)
      ? LeftReasons.IMPORT_TYPE
      : current
        ? this.refusalOf(current)
        : this.disabledAt(assertion);

    if (refusal) {
      this.leave({ node: assertion, name, reason: refusal });

      return;
    }

    // Only a whole value is the `Record` itself; a member's assertion types that member.
    const isWhole = current?.initializer === assertion;
    this.add({
      node: current ?? assertion,
      declaration: current,
      name,
      type: isWhole ? assertion.type : undefined,
      literal: assertion.expression,
      edits: [this.assertionToSatisfies(assertion)],
    });
  }

  /** What about the declaration itself forbids the rewrite. */
  private refusalOf(
    declaration: TypeScript.VariableDeclaration | TypeScript.PropertyDeclaration,
  ): string | undefined {
    const { typescript: ts } = this.options;
    const disabled = this.disabledAt(declaration);

    if (disabled) {
      return disabled;
    }

    if (ts.isPropertyDeclaration(declaration)) {
      const isReadonly = declaration.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
      );

      if (!declaration.initializer) {
        return LeftReasons.NO_INITIALIZER;
      }

      if (declaration.questionToken || declaration.exclamationToken) {
        return LeftReasons.OPTIONAL;
      }

      return isReadonly ? undefined : LeftReasons.MUTABLE_PROPERTY;
    }

    const flags = ts.getCombinedNodeFlags(declaration);

    if (!declaration.initializer) {
      return LeftReasons.NO_INITIALIZER;
    }

    if (!(flags & ts.NodeFlags.Const)) {
      return flags & ts.NodeFlags.Let ? LeftReasons.LET : LeftReasons.VAR;
    }

    return ts.isIdentifier(declaration.name) ? undefined : LeftReasons.PATTERN;
  }

  /** Whether an `eslint-disable` comment turns the rule off for this node. */
  private disabledAt(node: TypeScript.Node): string | undefined {
    const lines = this.options.source.split('\n');
    const line = this.lineOf(node) - 1;
    const near = [lines[line - 1] ?? '', lines[line] ?? ''].join('\n');
    const isNear = /eslint-disable(?:-next-line|-line)?\s/.test(near) && near.includes(RULE);
    const isWholeFile = new RegExp(`/\\*\\s*eslint-disable\\s[^*]*${RULE}`).test(
      this.options.source,
    );

    return isNear || isWholeFile ? LeftReasons.DISABLED : undefined;
  }

  /** Removes `: Type`; a comment between the colon and the type stays. */
  private removeAnnotation(opts: {
    declaration: TypeScript.VariableDeclaration | TypeScript.PropertyDeclaration;
    type: TypeScript.TypeNode;
  }): ITextEdit[] {
    const { declaration, type } = opts;
    const { source } = this.options;
    const colon = declaration
      .getChildren(this.file)
      .find((child) => child.kind === this.options.typescript.SyntaxKind.ColonToken);
    const start = colon?.getStart(this.file) ?? type.getStart(this.file);
    const typeStart = type.getStart(this.file);
    const end = type.getEnd();

    if (source.slice(start + 1, typeStart).trim() === '') {
      return [{ start, end, text: '' }];
    }

    // The space before the type goes with it, so no double space stays before `=`.
    const blank = source.slice(0, typeStart).trimEnd().length;

    return [
      { start, end: start + 1, text: '' },
      { start: blank, end, text: '' },
    ];
  }

  private assertionToSatisfies(assertion: TypeScript.AsExpression): ITextEdit {
    const { typescript: ts, source } = this.options;
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true);
    scanner.setText(source, assertion.expression.getEnd());
    scanner.scan();
    const start = scanner.getTokenStart();

    return { start, end: scanner.getTokenEnd(), text: 'satisfies' };
  }

  private add(opts: {
    node: TypeScript.Node;
    declaration: TypeScript.VariableDeclaration | TypeScript.PropertyDeclaration | undefined;
    name: string;
    type: TypeScript.TypeNode | undefined;
    literal: TypeScript.Expression;
    edits: ITextEdit[];
  }) {
    const { typescript: ts } = this.options;
    const { node, declaration, name, type, literal, edits } = opts;
    const value = this.unwrapped(literal);
    const keys =
      type && this.isRecord(type) && ts.isObjectLiteralExpression(value)
        ? value.properties.flatMap((property) => {
            const { name: written } = property;
            // `['/a']: ...` writes the same key as `'/a': ...`.
            const key =
              written && ts.isComputedPropertyName(written) ? written.expression : written;

            // A bare identifier in brackets names a variable, not the key.
            if (key && ts.isIdentifier(key)) {
              return key === written ? [key.text] : [];
            }

            return key && (ts.isStringLiteralLike(key) || ts.isNumericLiteral(key))
              ? [key.text]
              : [];
          })
        : undefined;

    this.result.candidates.push({
      file: this.options.fileName,
      line: this.lineOf(node),
      name,
      start: node.getStart(this.file),
      end: node.getEnd(),
      binding: declaration?.name.getStart(this.file),
      isExported: this.isExported(node),
      recordKeys: keys ? new Set(keys) : undefined,
      edits,
    });
  }

  /** Exported where it stands, or named by an `export` of its file; nothing declared in a function is. */
  private isExported(node: TypeScript.Node): boolean {
    const { typescript: ts } = this.options;
    let statement = node;

    while (!ts.isSourceFile(statement.parent)) {
      statement = statement.parent;

      if (ts.isFunctionLike(statement)) {
        return false;
      }
    }

    const isModified =
      ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

    if (isModified || ts.isExportAssignment(statement)) {
      return true;
    }

    const names = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.map((item) => item.name.getText(this.file))
      : ts.isClassDeclaration(statement) && statement.name
        ? [statement.name.text]
        : [];

    return this.file.statements.some((item) => {
      if (ts.isExportAssignment(item)) {
        return names.includes(item.expression.getText(this.file));
      }

      return (
        ts.isExportDeclaration(item) &&
        !item.moduleSpecifier &&
        item.exportClause !== undefined &&
        ts.isNamedExports(item.exportClause) &&
        item.exportClause.elements.some((element) =>
          names.includes((element.propertyName ?? element.name).text),
        )
      );
    });
  }

  private leave(opts: { node: TypeScript.Node; name: string; reason: string }) {
    const { node, name, reason } = opts;
    this.result.left.push({ file: this.options.fileName, line: this.lineOf(node), name, reason });
  }

  private lineOf(node: TypeScript.Node): number {
    return this.file.getLineAndCharacterOfPosition(node.getStart(this.file)).line + 1;
  }
}

/** One type error of a check, at its place in the source as it was. */
interface IFoundError {
  file: string;
  /** In the checked text. */
  position: number;
  line: number;
  code: number;
  key: string;
}

/**
 * Which of the candidates can be written: those whose binding is never written to and, if a `Record`, never indexed
 * by a key the literal may not hold, and whose rewrite adds no type error to any project of the run.
 */
class SatisfiesProof {
  private readonly accepted: Set<ISatisfiesCandidate>;
  private readonly left: ILeftConfig[] = [];
  /** How many times the projects were typechecked with candidates written. */
  private rounds = 0;

  constructor(
    private readonly options: {
      typescript: TTypeScript;
      root: string;
      sources: ReadonlyMap<string, string>;
      candidates: ISatisfiesCandidate[];
      /** The program of each project of the run, with `contents` read in place of the files. */
      programs: (contents: ReadonlyMap<string, string>) => TypeScript.Program[];
      roundLimit?: number;
    },
  ) {
    this.accepted = new Set(options.candidates);
  }

  run(): { accepted: ISatisfiesCandidate[]; left: ILeftConfig[] } {
    if (this.accepted.size === 0) {
      return { accepted: [], left: [] };
    }

    const programs = this.holding(this.options.programs(new Map()));
    this.dropWritten(programs);

    if (this.accepted.size > 0) {
      this.dropBreaking(new Set(this.errorsOf(programs, new Map()).map((error) => error.key)));
    }

    return { accepted: [...this.accepted], left: this.left };
  }

  /** The programs that read a file with a candidate: no other can be broken by a rewrite. */
  private holding(programs: TypeScript.Program[]): TypeScript.Program[] {
    const files = this.options.candidates.map((candidate) => candidate.file);

    return programs.filter((program) => files.some((file) => program.getSourceFile(file)));
  }

  private reject(opts: { candidate: ISatisfiesCandidate; reason: string }) {
    const { candidate, reason } = opts;

    if (this.accepted.delete(candidate)) {
      const { file, line, name } = candidate;
      this.left.push({ file, line, name, reason });
    }
  }

  private shown(file: string): string {
    return relative(this.options.root, file).split('\\').join('/');
  }

  private ownFiles(program: TypeScript.Program): TypeScript.SourceFile[] {
    return program
      .getSourceFiles()
      .filter((file) => !file.isDeclarationFile && !file.fileName.includes('/node_modules/'));
  }

  /** The candidates by their binding: the file and the position of its name in the source. */
  private bindings(): Map<string, ISatisfiesCandidate[]> {
    const found = new Map<string, ISatisfiesCandidate[]>();

    for (const candidate of this.accepted) {
      if (candidate.binding !== undefined) {
        const key = `${candidate.file}:${candidate.binding}`;
        found.set(key, [...(found.get(key) ?? []), candidate]);
      }
    }

    return found;
  }

  /** What an identifier stands for, through an import and a shorthand property. */
  private symbolOf(opts: { checker: TypeScript.TypeChecker; name: TypeScript.Identifier }) {
    const { typescript: ts } = this.options;
    const { checker, name } = opts;
    const { parent } = name;
    const symbol =
      ts.isShorthandPropertyAssignment(parent) && parent.name === name
        ? checker.getShorthandAssignmentValueSymbol(parent)
        : checker.getSymbolAtLocation(name);

    return symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  }

  /** The declaration of the value a member of an object literal holds, through any number of such members. */
  private heldBy(opts: {
    checker: TypeScript.TypeChecker;
    declaration: TypeScript.Declaration | undefined;
  }): TypeScript.Declaration | undefined {
    const { typescript: ts } = this.options;
    const { checker } = opts;
    const seen = new Set<TypeScript.Declaration>();
    let { declaration } = opts;

    while (declaration && !seen.has(declaration)) {
      seen.add(declaration);
      let held: TypeScript.Symbol | undefined;

      if (ts.isShorthandPropertyAssignment(declaration)) {
        held = checker.getShorthandAssignmentValueSymbol(declaration);
      } else if (ts.isPropertyAssignment(declaration) && ts.isIdentifier(declaration.initializer)) {
        held = checker.getSymbolAtLocation(declaration.initializer);
      } else {
        return declaration;
      }

      declaration =
        held && held.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(held).valueDeclaration
          : held?.valueDeclaration;
    }

    return declaration;
  }

  /** Calls `found` for each identifier under `node` that reads the binding of a candidate. */
  private forEachReference(opts: {
    program: TypeScript.Program;
    node: TypeScript.Node;
    edits: ReadonlyMap<string, ITextEdit[]>;
    bindings: ReadonlyMap<string, ISatisfiesCandidate[]>;
    /** Also reads a member of an object literal (`ALL.A`) as the binding it holds. */
    isThroughMembers?: boolean;
    found: (reference: TypeScript.Identifier, candidates: ISatisfiesCandidate[]) => void;
  }) {
    const { typescript: ts } = this.options;
    const { program, node, edits, bindings, isThroughMembers = false, found } = opts;
    const checker = program.getTypeChecker();
    const names = new Set([...bindings.values()].flat().map((candidate) => candidate.name));

    const visit = (current: TypeScript.Node): void => {
      ts.forEachChild(current, visit);

      if (!ts.isIdentifier(current)) {
        return;
      }

      const read = this.symbolOf({ checker, name: current })?.valueDeclaration;
      const declaration = isThroughMembers ? this.heldBy({ checker, declaration: read }) : read;

      if (
        !declaration ||
        !(ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) ||
        !names.has(declaration.name.getText()) ||
        declaration.name === current
      ) {
        return;
      }

      const file = declaration.getSourceFile().fileName;
      const position = TextEdits.toSource({
        edits: edits.get(file) ?? [],
        position: declaration.name.getStart(),
      });
      const candidates = bindings.get(`${file}:${position}`);

      if (candidates) {
        found(current, candidates);
      }
    };

    visit(node);
  }

  private dropWritten(programs: TypeScript.Program[]) {
    const bindings = this.bindings();

    for (const program of programs) {
      const { noImplicitAny, strict } = program.getCompilerOptions();
      const isImplicitAnyRefused = noImplicitAny ?? strict ?? false;

      for (const file of this.ownFiles(program)) {
        this.forEachReference({
          program,
          node: file,
          edits: new Map(),
          bindings,
          found: (reference, candidates) => {
            const line = file.getLineAndCharacterOfPosition(reference.getStart()).line + 1;
            const where = `${this.shown(file.fileName)}:${line}`;

            for (const candidate of candidates) {
              const { isWritten, openIndex } = this.useOf({
                program,
                reference,
                keys: candidate.recordKeys,
                isImplicitAnyRefused,
              });

              if (isWritten) {
                this.reject({ candidate, reason: `written at ${where}` });
              }

              if (openIndex) {
                this.reject({ candidate, reason: `${openIndex} at ${where}` });
              }
            }
          },
        });
      }
    }
  }

  /**
   * How one reference uses its binding. An index is open when its key is not a literal; without `noImplicitAny` also
   * when the literal does not hold it, because the read then turns into `any` with no error.
   */
  private useOf(opts: {
    program: TypeScript.Program;
    reference: TypeScript.Identifier;
    keys: ReadonlySet<string> | undefined;
    isImplicitAnyRefused: boolean;
  }): { isWritten: boolean; openIndex: string | undefined } {
    const { typescript: ts } = this.options;
    const { program, reference, keys, isImplicitAnyRefused } = opts;
    const { parent } = reference;
    let current: TypeScript.Expression =
      ts.isPropertyAccessExpression(parent) && parent.name === reference ? parent : reference;
    const base = current;
    let openIndex: string | undefined;

    while (true) {
      const next: TypeScript.Node = current.parent;

      if (ts.isElementAccessExpression(next) && next.expression === current) {
        if (keys && this.unwrappedUse(current) === base) {
          const type = program.getTypeChecker().getTypeAtLocation(next.argumentExpression);
          const parts = type.isUnion() ? type.types : [type];
          const literals = parts.flatMap((part) =>
            part.isStringLiteral() || part.isNumberLiteral() ? [String(part.value)] : [],
          );

          if (literals.length !== parts.length) {
            openIndex = LeftReasons.OPEN_KEY;
          } else if (!isImplicitAnyRefused && !literals.every((key) => keys.has(key))) {
            openIndex = LeftReasons.ABSENT_KEY;
          }
        }

        current = next;
        continue;
      }

      if (
        (ts.isPropertyAccessExpression(next) ||
          ts.isParenthesizedExpression(next) ||
          ts.isNonNullExpression(next) ||
          ts.isAsExpression(next) ||
          ts.isSatisfiesExpression(next)) &&
        next.expression === current
      ) {
        current = next;
        continue;
      }

      return { isWritten: this.isWriteTarget(current), openIndex };
    }
  }

  private unwrappedUse(expression: TypeScript.Expression): TypeScript.Expression {
    const { typescript: ts } = this.options;

    return ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)
      ? this.unwrappedUse(expression.expression)
      : expression;
  }

  private isWriteTarget(node: TypeScript.Node): boolean {
    const { typescript: ts } = this.options;
    const { parent } = node;

    if (ts.isBinaryExpression(parent)) {
      const operator = parent.operatorToken.kind;

      return (
        parent.left === node &&
        operator >= ts.SyntaxKind.FirstAssignment &&
        operator <= ts.SyntaxKind.LastAssignment
      );
    }

    if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) {
      return (
        parent.operator === ts.SyntaxKind.PlusPlusToken ||
        parent.operator === ts.SyntaxKind.MinusMinusToken
      );
    }

    if (ts.isDeleteExpression(parent)) {
      return true;
    }

    if (ts.isCallExpression(parent)) {
      return parent.arguments[0] === node && WRITING_CALLS.has(parent.expression.getText());
    }

    if (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) {
      return parent.initializer === node;
    }

    // A destructuring assignment: `[a.x] = list`, `({ y: a.x } = value)`.
    if (ts.isArrayLiteralExpression(parent)) {
      return this.isWriteTarget(parent);
    }

    return (
      ts.isPropertyAssignment(parent) &&
      parent.initializer === node &&
      this.isWriteTarget(parent.parent)
    );
  }

  private errorsOf(
    programs: TypeScript.Program[],
    edits: ReadonlyMap<string, ITextEdit[]>,
  ): IFoundError[] {
    const { typescript: ts, sources } = this.options;

    return programs.flatMap((program) => {
      const { declaration } = program.getCompilerOptions();

      return this.ownFiles(program).flatMap((file) => {
        const diagnostics = [
          ...program.getSemanticDiagnostics(file),
          ...(declaration ? program.getDeclarationDiagnostics(file) : []),
        ];

        return diagnostics
          .filter((item) => item.category === ts.DiagnosticCategory.Error)
          .map((item) => {
            const position = item.start ?? 0;
            const own = edits.get(file.fileName) ?? [];
            const before = TextEdits.toSource({ edits: own, position });
            const source = sources.get(file.fileName) ?? file.text;
            const line = source.slice(0, before).split('\n').length;

            return {
              file: file.fileName,
              position,
              line,
              code: item.code,
              key: `${file.fileName}|${before}|${item.code}`,
            };
          });
      });
    });
  }

  /**
   * The candidates a new error leads to: those it points into, else those its statement reads, else those read by the
   * variables and types that statement names, one step further at a time.
   */
  private blamed(opts: {
    programs: TypeScript.Program[];
    error: IFoundError;
    edits: ReadonlyMap<string, ITextEdit[]>;
  }): ISatisfiesCandidate[] {
    const { typescript: ts } = this.options;
    const { programs, error, edits } = opts;
    const own = edits.get(error.file) ?? [];
    const position = TextEdits.toSource({ edits: own, position: error.position });
    const around = [...this.accepted].filter(
      (candidate) =>
        candidate.file === error.file && candidate.start <= position && position <= candidate.end,
    );

    if (around.length > 0) {
      return around;
    }

    const program = programs.find((item) => item.getSourceFile(error.file));
    const file = program?.getSourceFile(error.file);

    if (!program || !file) {
      return [];
    }

    let statement: TypeScript.Node = file;

    const descend = (node: TypeScript.Node): void => {
      if (node.getStart(file) > error.position || node.getEnd() <= error.position) {
        return;
      }

      if (ts.isStatement(node) || ts.isClassElement(node)) {
        statement = node;
      }

      ts.forEachChild(node, descend);
    };

    ts.forEachChild(file, descend);
    const bindings = this.bindings();
    const seen = new Set<TypeScript.Node>();
    let nodes: TypeScript.Node[] = [statement];

    while (nodes.length > 0) {
      const read: ISatisfiesCandidate[] = [];

      for (const node of nodes) {
        this.forEachReference({
          program,
          node,
          edits,
          bindings,
          isThroughMembers: true,
          found: (_reference, candidates) => {
            read.push(...candidates);
          },
        });
      }

      if (read.length > 0) {
        return [...new Set(read)];
      }

      nodes = nodes
        .flatMap((node) => this.namedBy({ program, node }))
        .filter((node) => !seen.has(node) && seen.add(node));
    }

    return [];
  }

  /** The values and types of the variables, properties and type declarations that `node` names. */
  private namedBy(opts: { program: TypeScript.Program; node: TypeScript.Node }): TypeScript.Node[] {
    const { typescript: ts } = this.options;
    const { program, node } = opts;
    const checker = program.getTypeChecker();
    const own = new Set(this.ownFiles(program));
    const found: TypeScript.Node[] = [];

    const visit = (current: TypeScript.Node): void => {
      ts.forEachChild(current, visit);

      if (!ts.isIdentifier(current)) {
        return;
      }

      for (const declaration of this.symbolOf({ checker, name: current })?.declarations ?? []) {
        if (!own.has(declaration.getSourceFile())) {
          continue;
        }

        if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) {
          const { initializer, type } = declaration;
          found.push(...[initializer, type].filter((part) => part !== undefined));
        }

        if (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) {
          found.push(declaration);
        }
      }
    };

    visit(node);

    return found;
  }

  /** Typechecks the projects with `candidates` written, and answers the errors that adds. */
  private check(opts: { candidates: ISatisfiesCandidate[]; baseline: ReadonlySet<string> }) {
    const { candidates, baseline } = opts;
    this.rounds += 1;
    const { edits, contents } = TextEdits.writeAll({ sources: this.options.sources, candidates });
    const programs = this.holding(this.options.programs(contents));
    const added = this.errorsOf(programs, edits).filter((error) => !baseline.has(error.key));

    return { edits, programs, added };
  }

  private whereOf(error: IFoundError): string {
    return `${this.shown(error.file)}:${error.line} TS${error.code}`;
  }

  private rejectBroken(opts: { candidate: ISatisfiesCandidate; error: IFoundError }) {
    const reason = `the typecheck fails with it: ${this.whereOf(opts.error)}`;
    this.reject({ candidate: opts.candidate, reason });
  }

  private rejectUntried(candidates: ISatisfiesCandidate[]) {
    const reason = `not tried: the codemod stops after ${this.roundLimit} typecheck rounds; run it again after writing the others`;

    for (const candidate of candidates) {
      this.reject({ candidate, reason });
    }
  }

  private get roundLimit(): number {
    return this.options.roundLimit ?? ROUND_LIMIT;
  }

  /** Leaves candidates out until the rest add no error to what the projects already had. */
  private dropBreaking(baseline: ReadonlySet<string>) {
    while (this.accepted.size > 0) {
      if (this.rounds >= this.roundLimit) {
        this.rejectUntried([...this.accepted]);

        return;
      }

      const { edits, programs, added } = this.check({ candidates: [...this.accepted], baseline });

      if (added.length === 0) {
        return;
      }

      const blames = added.map((error) => ({
        error,
        candidates: this.blamed({ programs, error, edits }),
      }));
      const certain = blames.filter((blame) => blame.candidates.length === 1);

      if (certain.length > 0) {
        for (const { error, candidates } of certain) {
          for (const candidate of candidates) {
            this.rejectBroken({ candidate, error });
          }
        }

        continue;
      }

      // Several suspects, or none: which of them it takes is for the typecheck to say.
      const suspects = new Set(blames.flatMap((blame) => blame.candidates));
      const others = [...this.accepted].filter((candidate) => !suspects.has(candidate));
      const first =
        suspects.size === 0 ? this.halves(others) : [others, ...this.halves([...suspects])];
      this.bisect({ baseline, groups: first.filter((group) => group.length > 0) });

      return;
    }
  }

  private halves(group: ISatisfiesCandidate[]): ISatisfiesCandidate[][] {
    const middle = Math.ceil(group.length / 2);

    return [group.slice(0, middle), group.slice(middle)].filter((half) => half.length > 0);
  }

  /**
   * For errors no single candidate answers for, with all of them known to fail together: adds `groups` to those already
   * proved, halving a group that fails, and leaves each candidate that fails alone on top of them. Which of two that
   * only fail together stays follows the order of the groups.
   */
  private bisect(opts: { baseline: ReadonlySet<string>; groups: ISatisfiesCandidate[][] }) {
    const { baseline } = opts;
    const all = [...this.accepted];
    const proved: ISatisfiesCandidate[] = [];
    const queue = [...opts.groups];

    // The one group that is everything is known to fail: halve it without asking.
    if (queue.length === 1 && queue[0]?.length === all.length && all.length > 1) {
      queue.splice(0, 1, ...this.halves(all));
    }

    while (this.rounds < this.roundLimit) {
      const group = queue.shift();

      if (!group) {
        break;
      }

      const [only, ...others] = group;
      const { added } = this.check({ candidates: [...proved, ...group], baseline });
      const [error] = added;

      if (!error) {
        proved.push(...group);
      } else if (only && others.length === 0) {
        this.rejectBroken({ candidate: only, error });
      } else {
        queue.unshift(...this.halves(group));
      }
    }

    this.rejectUntried(all.filter((candidate) => !proved.includes(candidate)));
  }
}

/** Writes a config declared as `IAuthRouteConfig` (or a `Record` of it) with `satisfies`, which keeps its schemas. */
export class SatisfiesRewrite {
  static scan(opts: { typescript: TTypeScript; fileName: string; source: string }): IScannedFile {
    return opts.source.includes(CONFIG_TYPE)
      ? new ConfigDeclarations(opts).scan()
      : { candidates: [], left: [] };
  }

  static prove(opts: {
    typescript: TTypeScript;
    root: string;
    sources: ReadonlyMap<string, string>;
    candidates: ISatisfiesCandidate[];
    programs: (contents: ReadonlyMap<string, string>) => TypeScript.Program[];
    roundLimit?: number;
  }): { accepted: ISatisfiesCandidate[]; left: ILeftConfig[] } {
    return new SatisfiesProof(opts).run();
  }
}
