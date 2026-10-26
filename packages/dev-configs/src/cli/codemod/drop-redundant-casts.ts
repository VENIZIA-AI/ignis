import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type ts from 'typescript';
import type { TConstValue } from '../../linters/rules/common';
import { CodemodFiles } from './files';

type TTypeScript = typeof ts;

/** Why a cast is still there after the codemod ran. */
export class CastKeepReasons {
  /** Taking it out makes the package fail its typecheck. */
  static readonly NEEDED = 'needed';
  /** `as const` is a narrowing the codemod never touches. */
  static readonly AS_CONST = 'as-const';
  /** `x as unknown as T`: a deliberate escape that only a person can judge. */
  static readonly DOUBLE_CAST = 'double-cast';
  /** `x as unknown` widens on purpose. */
  static readonly UNKNOWN_TARGET = 'unknown-target';
  /** The expression is `any`: the cast is the only type it has, so it is not redundant. */
  static readonly ANY_EXPRESSION = 'any-expression';
  /** The expression is `unknown`: the cast is the only type it has. */
  static readonly UNKNOWN_EXPRESSION = 'unknown-expression';
  /** Test files are skipped unless `--include-tests` is given. */
  static readonly TEST_FILE = 'test-file';
  /** The file is not part of the package's tsconfig, so nothing can check it. */
  static readonly NOT_IN_PROJECT = 'not-in-project';

  static readonly SCHEME_SET = new Set<string>([
    this.NEEDED,
    this.AS_CONST,
    this.DOUBLE_CAST,
    this.UNKNOWN_TARGET,
    this.ANY_EXPRESSION,
    this.UNKNOWN_EXPRESSION,
    this.TEST_FILE,
    this.NOT_IN_PROJECT,
  ]);

  static isValid(value: string): value is TCastKeepReason {
    return this.SCHEME_SET.has(value);
  }
}

export type TCastKeepReason = TConstValue<typeof CastKeepReasons>;

export interface IKeptCast {
  /** Line and column in the output text (the file after the removals). */
  line: number;
  column: number;
  reason: TCastKeepReason;
}

export interface IFileCastResult {
  file: string;
  /** The file text after the removals and the imports they left unused. */
  output: string;
  changed: boolean;
  removed: number;
  importsRemoved: number;
  kept: IKeptCast[];
}

export interface IProjectCastResult {
  files: IFileCastResult[];
  /** How many times the package was typechecked (the baseline run included). */
  checks: number;
  /** Errors the package already had before any removal; they are not counted against a removal. */
  baselineErrors: number;
}

interface ICastCandidate {
  file: string;
  start: number;
  end: number;
  replacement: string;
  /** The cast as written, used to remember a rejected cast across rounds. */
  key: string;
}

const MAX_ROUNDS = 50;
/** A file that can hold a cast: `as`, or an angle-bracket assertion. */
const CAST_TEXT = /\bas\b|<[A-Za-z_$][^<>]*>\s*[A-Za-z_$(]/;
const TEST_FILE_PATTERN = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?tsx?$/;

/** The compiler's own view of a package, with the text of some files replaced in memory. */
class TypecheckSession {
  private readonly overrides = new Map<string, { text: string; sourceFile: ts.SourceFile }>();
  private program: ts.Program | undefined;
  checks = 0;

  constructor(
    private readonly typescript: TTypeScript,
    private readonly options: ts.CompilerOptions,
    private readonly rootNames: string[],
    private readonly root: string,
  ) {}

  /** Typechecks the package with `texts` replacing the files on disk; returns the errors as a count per message key. */
  check(texts: Map<string, string>): Map<string, number> {
    const { typescript, options, rootNames } = this;
    const host = typescript.createCompilerHost(options, true);
    const read = host.getSourceFile.bind(host);

    this.overrides.clear();
    host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreate) => {
      const text = texts.get(resolve(fileName));
      if (text === undefined) {
        return read(fileName, languageVersionOrOptions, onError, shouldCreate);
      }

      const cached = this.overrides.get(fileName);
      if (cached?.text === text) {
        return cached.sourceFile;
      }

      const sourceFile = typescript.createSourceFile(
        fileName,
        text,
        languageVersionOrOptions,
        true,
      );
      this.overrides.set(fileName, { text, sourceFile });
      return sourceFile;
    };

    this.program = typescript.createProgram({
      rootNames,
      options,
      host,
      oldProgram: this.program,
    });
    this.checks += 1;

    const counts = new Map<string, number>();
    for (const diagnostic of typescript.getPreEmitDiagnostics(this.program)) {
      if (diagnostic.category !== typescript.DiagnosticCategory.Error) {
        continue;
      }

      const where = diagnostic.file ? relative(this.root, diagnostic.file.fileName) : '';
      const message = typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      const key = `${where}|${diagnostic.code}|${message}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
  }

  getProgram(): ts.Program {
    if (!this.program) {
      throw new Error('[TypecheckSession][getProgram] check() has not run yet');
    }

    return this.program;
  }
}

/**
 * Removes the `as X` casts a package no longer needs. Every removal of a package is tried together
 * in memory and compared with the errors the package had before; when new errors appear, the
 * candidates are halved until the ones that break the typecheck are found, so the cost is a handful
 * of checks, not one per cast.
 */
export class RedundantCasts {
  /** The casts of one project: which are removed, which stay and why. */
  static run(opts: {
    typescript: TTypeScript;
    tsconfigPath: string;
    root: string;
    files: string[];
    includeTests?: boolean;
  }): IProjectCastResult {
    const { typescript, tsconfigPath, root, files, includeTests = false } = opts;
    const loaded = RedundantCasts.loadProject({ typescript, tsconfigPath });
    const session = new TypecheckSession(typescript, loaded.options, loaded.fileNames, root);
    const original = new Map<string, string>();
    const current = new Map<string, string>();
    const results = new Map<string, IFileCastResult>();
    const members = new Set(loaded.fileNames.map((name) => resolve(name)));

    for (const file of files.map((name) => resolve(name))) {
      if (!members.has(file)) {
        results.set(file, {
          file,
          output: readFileSync(file, 'utf8'),
          changed: false,
          removed: 0,
          importsRemoved: 0,
          kept: [{ line: 0, column: 0, reason: CastKeepReasons.NOT_IN_PROJECT }],
        });
        continue;
      }

      const text = readFileSync(file, 'utf8');
      original.set(file, text);
      current.set(file, text);
    }

    const baseline = session.check(new Map());
    const baselineErrors = [...baseline.values()].reduce((sum, count) => sum + count, 0);
    const rejected = new Set<string>();
    const removedPerFile = new Map<string, number>();

    const isBroken = (texts: Map<string, string>): boolean => {
      const counts = session.check(texts);
      for (const [key, count] of counts) {
        if (count > (baseline.get(key) ?? 0)) {
          return true;
        }
      }

      return false;
    };

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      session.check(current);
      const candidates = RedundantCasts.collectCandidates({
        typescript,
        program: session.getProgram(),
        texts: current,
        includeTests,
        rejected,
      });

      if (candidates.length === 0) {
        break;
      }

      const accepted = RedundantCasts.search({
        candidates,
        base: [],
        isBroken: (chosen) => isBroken(RedundantCasts.apply({ texts: current, chosen })),
      });
      const acceptedKeys = new Set(accepted);

      for (const candidate of candidates) {
        if (!acceptedKeys.has(candidate)) {
          rejected.add(`${candidate.file}|${candidate.key}`);
        }
      }

      for (const candidate of accepted) {
        removedPerFile.set(candidate.file, (removedPerFile.get(candidate.file) ?? 0) + 1);
      }

      const next = RedundantCasts.apply({ texts: current, chosen: accepted });
      for (const [file, text] of next) {
        current.set(file, text);
      }
    }

    const cleaned = RedundantCasts.dropUnusedImports({ typescript, original, current });
    const finalTexts = isBroken(cleaned.texts) ? current : cleaned.texts;
    const importsRemoved =
      finalTexts === cleaned.texts ? cleaned.removed : new Map<string, number>();

    session.check(finalTexts);
    const program = session.getProgram();
    for (const [file, text] of original) {
      const output = finalTexts.get(file) ?? text;
      const sourceFile = program.getSourceFile(file);
      const kept = sourceFile
        ? RedundantCasts.describeKept({
            typescript,
            sourceFile,
            checker: program.getTypeChecker(),
            includeTests,
            rejected,
          })
        : [];

      results.set(file, {
        file,
        output,
        changed: output !== text,
        removed: removedPerFile.get(file) ?? 0,
        importsRemoved: importsRemoved.get(file) ?? 0,
        kept,
      });
    }

    return { files: [...results.values()], checks: session.checks, baselineErrors };
  }

  private static loadProject(opts: { typescript: TTypeScript; tsconfigPath: string }) {
    const { typescript, tsconfigPath } = opts;
    const read = typescript.readConfigFile(tsconfigPath, typescript.sys.readFile);

    if (read.error) {
      throw new Error(
        `[loadProject] cannot read ${tsconfigPath} | ${typescript.flattenDiagnosticMessageText(read.error.messageText, '\n')}`,
      );
    }

    const parsed = typescript.parseJsonConfigFileContent(
      read.config,
      typescript.sys,
      dirname(tsconfigPath),
      undefined,
      tsconfigPath,
    );

    return {
      fileNames: parsed.fileNames,
      options: {
        ...parsed.options,
        noEmit: true,
        incremental: false,
        composite: false,
        emitDeclarationOnly: false,
        declaration: false,
        declarationMap: false,
        tsBuildInfoFile: undefined,
      } satisfies ts.CompilerOptions,
    };
  }

  /**
   * Finds the casts worth trying: not `as const`, not a double cast, not a cast of `any` or
   * `unknown`, and not one already rejected. A cast inside another candidate waits for the next
   * round, so the edits of one round never overlap.
   */
  private static collectCandidates(opts: {
    typescript: TTypeScript;
    program: ts.Program;
    texts: Map<string, string>;
    includeTests: boolean;
    rejected: Set<string>;
  }): ICastCandidate[] {
    const { typescript, program, texts, includeTests, rejected } = opts;
    const checker = program.getTypeChecker();
    const found: ICastCandidate[] = [];

    for (const [file, text] of texts) {
      if (!includeTests && TEST_FILE_PATTERN.test(file)) {
        continue;
      }

      const sourceFile = program.getSourceFile(file);
      if (!sourceFile) {
        continue;
      }

      RedundantCasts.walkCasts({
        typescript,
        sourceFile,
        visit: (node) => {
          if (RedundantCasts.classify({ typescript, node, checker }) !== undefined) {
            return;
          }

          const inner = node.expression;
          const key = text.slice(node.getStart(sourceFile), node.end);
          if (rejected.has(`${file}|${key}`)) {
            return;
          }

          found.push({
            file,
            start: node.getStart(sourceFile),
            end: node.end,
            replacement: text.slice(inner.getStart(sourceFile), inner.end),
            key,
          });
        },
      });
    }

    found.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start || b.end - a.end);

    const outermost: ICastCandidate[] = [];
    let last: ICastCandidate | undefined;
    for (const candidate of found) {
      const isInside =
        last !== undefined &&
        last.file === candidate.file &&
        candidate.start >= last.start &&
        candidate.end <= last.end;
      if (isInside) {
        continue;
      }

      outermost.push(candidate);
      last = candidate;
    }

    return outermost;
  }

  /** The reason a cast is never tried, or `undefined` when it is worth trying. */
  private static classify(opts: {
    typescript: TTypeScript;
    node: ts.AsExpression | ts.TypeAssertion;
    checker: ts.TypeChecker;
  }): TCastKeepReason | undefined {
    const { typescript, node, checker } = opts;
    const target = node.type;

    if (
      typescript.isTypeReferenceNode(target) &&
      typescript.isIdentifier(target.typeName) &&
      target.typeName.text === 'const'
    ) {
      return CastKeepReasons.AS_CONST;
    }

    if (target.kind === typescript.SyntaxKind.UnknownKeyword) {
      return CastKeepReasons.UNKNOWN_TARGET;
    }

    let inner: ts.Expression = node.expression;
    while (typescript.isParenthesizedExpression(inner)) {
      inner = inner.expression;
    }

    if (typescript.isAsExpression(inner) || typescript.isTypeAssertionExpression(inner)) {
      return CastKeepReasons.DOUBLE_CAST;
    }

    const flags = checker.getTypeAtLocation(node.expression).flags;
    if (flags & typescript.TypeFlags.Any) {
      return CastKeepReasons.ANY_EXPRESSION;
    }

    if (flags & typescript.TypeFlags.Unknown) {
      return CastKeepReasons.UNKNOWN_EXPRESSION;
    }

    return undefined;
  }

  private static walkCasts(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    visit: (node: ts.AsExpression | ts.TypeAssertion) => void;
  }): void {
    const { typescript, sourceFile, visit } = opts;
    const walk = (node: ts.Node): void => {
      if (typescript.isAsExpression(node) || typescript.isTypeAssertionExpression(node)) {
        visit(node);
      }

      typescript.forEachChild(node, walk);
    };

    walk(sourceFile);
  }

  /** The casts that remain in a file, each with the reason it stayed. */
  private static describeKept(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    checker: ts.TypeChecker;
    includeTests: boolean;
    rejected: Set<string>;
  }): IKeptCast[] {
    const { typescript, sourceFile, checker, includeTests, rejected } = opts;
    const kept: IKeptCast[] = [];
    const isTest = TEST_FILE_PATTERN.test(sourceFile.fileName);

    RedundantCasts.walkCasts({
      typescript,
      sourceFile,
      visit: (node) => {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        const text = sourceFile.text.slice(node.getStart(sourceFile), node.end);
        const reason =
          (isTest && !includeTests ? CastKeepReasons.TEST_FILE : undefined) ??
          RedundantCasts.classify({ typescript, node, checker }) ??
          (rejected.has(`${resolve(sourceFile.fileName)}|${text}`)
            ? CastKeepReasons.NEEDED
            : undefined);

        if (reason !== undefined) {
          kept.push({ line: line + 1, column: character + 1, reason });
        }
      },
    });

    return kept;
  }

  /** The candidates whose removal, together with `base`, adds no error. Halves the list until the breaking ones stand alone. */
  private static search(opts: {
    candidates: ICastCandidate[];
    base: ICastCandidate[];
    isBroken: (chosen: ICastCandidate[]) => boolean;
  }): ICastCandidate[] {
    const { candidates, base, isBroken } = opts;

    if (candidates.length === 0) {
      return [];
    }

    if (!isBroken([...base, ...candidates])) {
      return candidates;
    }

    if (candidates.length === 1) {
      return [];
    }

    const middle = Math.ceil(candidates.length / 2);
    const first = RedundantCasts.search({
      candidates: candidates.slice(0, middle),
      base,
      isBroken,
    });
    const second = RedundantCasts.search({
      candidates: candidates.slice(middle),
      base: [...base, ...first],
      isBroken,
    });

    return [...first, ...second];
  }

  /** The texts with `chosen` removed, each file edited from the end so earlier offsets stay valid. */
  private static apply(opts: {
    texts: Map<string, string>;
    chosen: ICastCandidate[];
  }): Map<string, string> {
    const { texts, chosen } = opts;
    const output = new Map(texts);
    const byFile = new Map<string, ICastCandidate[]>();

    for (const candidate of chosen) {
      byFile.set(candidate.file, [...(byFile.get(candidate.file) ?? []), candidate]);
    }

    for (const [file, edits] of byFile) {
      let text = output.get(file) ?? '';
      for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
        text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
      }

      output.set(file, text);
    }

    return output;
  }

  /** Removes a named import the removals left unused; an import that was already unused is left alone. */
  private static dropUnusedImports(opts: {
    typescript: TTypeScript;
    original: Map<string, string>;
    current: Map<string, string>;
  }): { texts: Map<string, string>; removed: Map<string, number> } {
    const { typescript, original, current } = opts;
    const texts = new Map(current);
    const removed = new Map<string, number>();

    for (const [file, after] of current) {
      const before = original.get(file);
      if (before === undefined || before === after) {
        continue;
      }

      const usedBefore = RedundantCasts.identifiersOutsideImports({
        typescript,
        text: before,
        file,
      });
      const usedAfter = RedundantCasts.identifiersOutsideImports({ typescript, text: after, file });
      const sourceFile = typescript.createSourceFile(
        file,
        after,
        typescript.ScriptTarget.Latest,
        true,
      );
      const edits: Array<{ start: number; end: number; text: string }> = [];
      let count = 0;

      for (const statement of sourceFile.statements) {
        if (!typescript.isImportDeclaration(statement)) {
          continue;
        }

        const clause = statement.importClause;
        const bindings = clause?.namedBindings;
        if (!clause || !bindings || !typescript.isNamedImports(bindings)) {
          continue;
        }

        const stale = bindings.elements.filter(
          (element) => usedBefore.has(element.name.text) && !usedAfter.has(element.name.text),
        );
        if (stale.length === 0) {
          continue;
        }

        count += stale.length;
        const remaining = bindings.elements.filter((element) => !stale.includes(element));
        const start = statement.getStart(sourceFile);

        if (remaining.length === 0 && !clause.name) {
          const lineEnd = after.indexOf('\n', statement.end);
          edits.push({ start, end: lineEnd === -1 ? statement.end : lineEnd + 1, text: '' });
          continue;
        }

        const typeKeyword = clause.isTypeOnly ? 'type ' : '';
        const names = remaining.map((element) =>
          after.slice(element.getStart(sourceFile), element.end),
        );
        const head = clause.name ? `${clause.name.text}${names.length > 0 ? ', ' : ''}` : '';
        const named = names.length > 0 ? `{ ${names.join(', ')} }` : '';
        const from = after.slice(statement.moduleSpecifier.getStart(sourceFile), statement.end);
        edits.push({
          start,
          end: statement.end,
          text: `import ${typeKeyword}${head}${named} from ${from}`,
        });
      }

      if (edits.length === 0) {
        continue;
      }

      let text = after;
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      }

      texts.set(file, text);
      removed.set(file, count);
    }

    return { texts, removed };
  }

  /** Every identifier text outside the import declarations: a name that appears here is in use. */
  private static identifiersOutsideImports(opts: {
    typescript: TTypeScript;
    text: string;
    file: string;
  }): Set<string> {
    const { typescript, text, file } = opts;
    const sourceFile = typescript.createSourceFile(
      file,
      text,
      typescript.ScriptTarget.Latest,
      true,
    );
    const names = new Set<string>();
    const walk = (node: ts.Node): void => {
      if (typescript.isImportDeclaration(node)) {
        return;
      }

      if (typescript.isIdentifier(node)) {
        names.add(node.text);
      }

      typescript.forEachChild(node, walk);
    };

    walk(sourceFile);
    return names;
  }

  /** The nearest `tsconfig.json` at or above `file`, stopping at `root`. */
  static findTsconfig(opts: { file: string; root: string }): string | undefined {
    const { root } = opts;
    let directory = dirname(resolve(opts.file));
    const top = resolve(root);

    for (;;) {
      const candidate = join(directory, 'tsconfig.json');
      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = dirname(directory);
      if (directory === top || parent === directory) {
        return undefined;
      }

      directory = parent;
    }
  }
}

const USAGE = `Usage: devz codemod drop-redundant-casts [paths...] [--write | --check] [--project <tsconfig>] [--include-tests]

Removes \`as X\` casts the compiler no longer needs. A removal is kept only if the package still
typechecks: all removals of a package are tried together in memory and the failing ones are found
by halving, so the package is checked a handful of times, not once per cast.

  --write            write the changed files (without it, nothing is written)
  --check            dry run that exits 1 while a removable cast remains (for CI)
  --project <file>   the tsconfig to check against (default: the nearest tsconfig.json of each file)
  --include-tests    also try casts in test files (skipped by default)
  --help             print this text and exit

A cast stays when its removal breaks the typecheck, and always for \`as const\`, \`as unknown\`,
\`x as unknown as T\` and a cast of an \`any\` or \`unknown\` expression: the cast is the only type
there. The report lists how many casts stayed and why. Run your own typecheck after --write.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

class CastFlags {
  static readonly WRITE = '--write';
  static readonly CHECK = '--check';
  static readonly PROJECT = '--project';
  static readonly INCLUDE_TESTS = '--include-tests';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.CHECK,
    this.PROJECT,
    this.INCLUDE_TESTS,
    this.HELP,
    this.HELP_SHORT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** `devz codemod drop-redundant-casts [paths...] [--write | --check]`. */
export class DropRedundantCastsCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (args.includes(CastFlags.HELP) || args.includes(CastFlags.HELP_SHORT)) {
      console.log(USAGE);
      return 0;
    }

    const flags: string[] = [];
    const paths: string[] = [];
    let project: string | undefined;

    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index] ?? '';

      if (argument === CastFlags.PROJECT) {
        project = args[index + 1];
        index += 1;
        if (!project || project.startsWith('-')) {
          console.error(`devz codemod: ${CastFlags.PROJECT} needs a tsconfig path\n${USAGE}`);
          return USAGE_ERROR_CODE;
        }
        continue;
      }

      if (argument.startsWith(`${CastFlags.PROJECT}=`)) {
        project = argument.slice(CastFlags.PROJECT.length + 1);
        continue;
      }

      if (argument.startsWith('-')) {
        flags.push(argument);
      } else {
        paths.push(argument);
      }
    }

    const unknown = flags.filter((flag) => !CastFlags.isValid(flag));
    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(CastFlags.WRITE);
    const isCheck = flags.includes(CastFlags.CHECK);
    const includeTests = flags.includes(CastFlags.INCLUDE_TESTS);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${CastFlags.WRITE} and ${CastFlags.CHECK} contradict each other\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    let typescript: TTypeScript;
    try {
      typescript = (await import('typescript')).default;
    } catch {
      console.error('devz codemod: the "typescript" package is required to check your sources');
      return 1;
    }

    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    const byProject = new Map<string, string[]>();

    for (const target of targets) {
      const collected = CodemodFiles.collect({ target });

      if (collected.length === 0 && paths.length > 0) {
        console.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of collected) {
        if (!CAST_TEXT.test(readFileSync(file, 'utf8'))) {
          continue;
        }

        const tsconfig = project
          ? resolve(root, project)
          : RedundantCasts.findTsconfig({ file, root });

        if (!tsconfig) {
          console.warn(`${relative(root, file)}  no tsconfig.json at or above this file; skipped`);
          continue;
        }

        byProject.set(tsconfig, [...(byProject.get(tsconfig) ?? []), file]);
      }
    }

    let removed = 0;
    let kept = 0;
    let importsRemoved = 0;
    let changedFiles = 0;
    const reasons = new Map<string, number>();
    const verb = isWrite ? 'removed' : 'would remove';

    for (const [tsconfig, files] of byProject) {
      let result: IProjectCastResult;
      try {
        result = RedundantCasts.run({
          typescript,
          tsconfigPath: tsconfig,
          root,
          files,
          includeTests,
        });
      } catch (error) {
        console.error(
          `devz codemod: ${relative(root, tsconfig)}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return 1;
      }

      console.log(
        `${relative(root, tsconfig)}: ${files.length} file(s) read, typechecked ${result.checks} time(s)` +
          (result.baselineErrors > 0
            ? `, ${result.baselineErrors} error(s) were there before and are ignored`
            : ''),
      );

      for (const file of result.files) {
        removed += file.removed;
        importsRemoved += file.importsRemoved;
        kept += file.kept.length;
        for (const entry of file.kept) {
          reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
        }

        if (file.removed === 0 && file.kept.length === 0) {
          continue;
        }

        const shown = relative(root, file.file);
        const detail = [...new Set(file.kept.map((entry) => entry.reason))]
          .map(
            (reason) => `${file.kept.filter((entry) => entry.reason === reason).length} ${reason}`,
          )
          .join(', ');
        console.log(
          `${file.removed > 0 ? verb : 'unchanged'}  ${shown}  (${file.removed} removed, ${file.kept.length} kept${detail ? `: ${detail}` : ''}${file.importsRemoved > 0 ? `, ${file.importsRemoved} import(s) dropped` : ''})`,
        );

        if (file.changed) {
          changedFiles += 1;
          if (isWrite) {
            writeFileSync(file.file, file.output);
          }
        }
      }
    }

    console.log(
      `devz codemod drop-redundant-casts: ${removed} cast(s) ${isWrite ? 'removed' : 'would be removed'} in ${changedFiles} file(s), ${kept} kept` +
        (reasons.size > 0
          ? ` (${[...reasons].map(([reason, count]) => `${count} ${reason}`).join(', ')})`
          : '') +
        (importsRemoved > 0 ? `, ${importsRemoved} unused import(s) dropped` : ''),
    );

    if (!isWrite && changedFiles > 0) {
      console.log(
        `Nothing was written. Run again with ${CastFlags.WRITE} to apply, then run your typecheck.`,
      );
    }

    return isCheck && removed > 0 ? 1 : 0;
  }
}
