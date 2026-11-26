import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type ts from 'typescript';
import { CliOutput } from '../../common/cli-output';
import type { TConstValue } from '../../linters/rules/common';
import { CodemodFiles } from './files';

type TTypeScript = typeof ts;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** The options of the command. */
export class FunctionToArrowFlags {
  static readonly WRITE = '--write';
  static readonly DRY_RUN = '--dry-run';
  static readonly CHECK = '--check';
  static readonly ALL = '--all';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static isValid(flag: string): boolean {
    return Object.values(FunctionToArrowFlags).includes(flag);
  }
}

/** Why a `function` declaration is left as it is: rewriting it could change what the program does or its types. */
export class ArrowSkipReasons {
  static readonly HOISTED = 'used-before-declaration';
  static readonly OVERLOAD = 'overload-or-no-body';
  static readonly GENERATOR = 'generator';
  static readonly THIS = 'uses-this';
  static readonly ARGUMENTS = 'uses-arguments';
  static readonly NEW_TARGET = 'uses-new-target';
  static readonly EXPORT_DEFAULT = 'export-default';
  static readonly CONSTRUCTED = 'used-as-constructor';
  static readonly ASSERTION = 'assertion-signature';
  static readonly MERGED = 'merged-declaration';
  static readonly HEADER_COMMENT = 'comment-before-the-name';
}

export type TArrowSkipReason = TConstValue<typeof ArrowSkipReasons>;

/** A declaration the codemod listed and did not touch. */
export interface IArrowSkip {
  name: string;
  line: number;
  reason: TArrowSkipReason;
}

/** One file's rewrite. */
export interface IArrowRewrite {
  output: string;
  rewritten: number;
  skipped: Array<IArrowSkip>;
}

const USAGE = `devz codemod function-to-arrow [paths...] [--write [--all] | --check | --dry-run]

Rewrites a \`function\` declaration as \`const name = (...) => {...};\`, keeping export, async, type parameters,
the return type and comments. A declaration whose rewrite could change the program is listed with its reason and left
alone: used before it is declared, overloads, generators, this / arguments / new.target, export default, used with
new, assertion signatures and merged declarations. A function another module calls while an import cycle is still
loading is not detected: run your tests.

  --dry-run  the default: list the changes and the skips, write nothing
  --write    write the changed files (--write needs a path or --all)
  --check    dry run that exits 1 while a file would change
  --help     print this text and exit`;

/** The rewrite of one file's `function` declarations. */
export class FunctionToArrow {
  /** The reason the body cannot move into an arrow: it reads what only a `function` binds. */
  private static ownBinding(opts: {
    typescript: TTypeScript;
    declaration: ts.FunctionDeclaration;
  }): TArrowSkipReason | undefined {
    const { typescript, declaration } = opts;
    let found: TArrowSkipReason | undefined;

    const visit = (node: ts.Node): void => {
      // A nested `function` or class member binds its own; an arrow does not.
      if (
        typescript.isFunctionDeclaration(node) ||
        typescript.isFunctionExpression(node) ||
        typescript.isClassLike(node) ||
        typescript.isMethodDeclaration(node) ||
        typescript.isGetAccessorDeclaration(node) ||
        typescript.isSetAccessorDeclaration(node)
      ) {
        return;
      }

      if (node.kind === typescript.SyntaxKind.ThisKeyword) {
        found = ArrowSkipReasons.THIS;
      } else if (typescript.isIdentifier(node) && node.text === 'arguments') {
        found = ArrowSkipReasons.ARGUMENTS;
      } else if (
        typescript.isMetaProperty(node) &&
        node.keywordToken === typescript.SyntaxKind.NewKeyword
      ) {
        found = ArrowSkipReasons.NEW_TARGET;
      }

      typescript.forEachChild(node, visit);
    };

    declaration.parameters.forEach(visit);

    if (declaration.body) {
      typescript.forEachChild(declaration.body, visit);
    }

    return found;
  }

  /** Every reference to each `function` declaration of the file, itself and its name excluded. */
  private static references(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    checker: ts.TypeChecker;
  }): Map<ts.Symbol, Array<ts.Identifier>> {
    const { typescript, sourceFile, checker } = opts;
    const found = new Map<ts.Symbol, Array<ts.Identifier>>();

    const visit = (node: ts.Node): void => {
      if (typescript.isIdentifier(node)) {
        const parent = node.parent;
        const symbol = typescript.isExportSpecifier(parent)
          ? checker.getExportSpecifierLocalTargetSymbol(parent)
          : checker.getSymbolAtLocation(node);
        const isOwnName = typescript.isFunctionDeclaration(parent) && parent.name === node;

        if (symbol && !isOwnName) {
          found.set(symbol, [...(found.get(symbol) ?? []), node]);
        }
      }

      typescript.forEachChild(node, visit);
    };

    visit(sourceFile);

    return found;
  }

  /**
   * The earliest position of the file from which `node` can run: where it is written, or earlier when it sits in a
   * hoisted `function` that is itself used before that.
   */
  private static runsFrom(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    checker: ts.TypeChecker;
    references: Map<ts.Symbol, Array<ts.Identifier>>;
    node: ts.Node;
    seen: Set<ts.Node>;
  }): number {
    const { typescript, sourceFile, checker, references, node, seen } = opts;
    let earliest = node.getStart(sourceFile);

    for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
      if (!typescript.isFunctionDeclaration(parent) || !parent.name || seen.has(parent)) {
        continue;
      }

      seen.add(parent);
      const symbol = checker.getSymbolAtLocation(parent.name);

      for (const use of (symbol && references.get(symbol)) ?? []) {
        earliest = Math.min(earliest, FunctionToArrow.runsFrom({ ...opts, node: use, seen }));
      }
    }

    return earliest;
  }

  /** What the other references to the function forbid. */
  private static usage(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    checker: ts.TypeChecker;
    references: Map<ts.Symbol, Array<ts.Identifier>>;
    declaration: ts.FunctionDeclaration;
    symbol: ts.Symbol;
  }): TArrowSkipReason | undefined {
    const { typescript, sourceFile, references, declaration, symbol } = opts;
    const uses = references.get(symbol) ?? [];
    const isConstructed = uses.some(
      ({ parent }) =>
        (typescript.isNewExpression(parent) &&
          parent.expression.getText(sourceFile) === declaration.name?.text) ||
        (typescript.isPropertyAccessExpression(parent) && parent.name.text === 'prototype'),
    );

    if (isConstructed) {
      return ArrowSkipReasons.CONSTRUCTED;
    }

    const start = declaration.getStart(sourceFile);
    const isHoisted = uses.some(
      (node) =>
        FunctionToArrow.runsFrom({ ...opts, node, seen: new Set<ts.Node>([declaration]) }) < start,
    );

    return isHoisted ? ArrowSkipReasons.HOISTED : undefined;
  }

  private static skipReason(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    checker: ts.TypeChecker;
    references: Map<ts.Symbol, Array<ts.Identifier>>;
    declaration: ts.FunctionDeclaration;
    name: ts.Identifier;
  }): TArrowSkipReason | undefined {
    const { typescript, sourceFile, checker, references, declaration, name } = opts;
    const modifiers = typescript.getModifiers(declaration) ?? [];

    if (modifiers.some((modifier) => modifier.kind === typescript.SyntaxKind.DefaultKeyword)) {
      return ArrowSkipReasons.EXPORT_DEFAULT;
    }

    const symbol = checker.getSymbolAtLocation(name);
    const declarations = symbol?.declarations ?? [];

    if (!declaration.body || declarations.filter(typescript.isFunctionDeclaration).length > 1) {
      return ArrowSkipReasons.OVERLOAD;
    }

    if (declarations.length > 1) {
      return ArrowSkipReasons.MERGED;
    }

    if (declaration.asteriskToken) {
      return ArrowSkipReasons.GENERATOR;
    }

    if (
      declaration.type &&
      typescript.isTypePredicateNode(declaration.type) &&
      declaration.type.assertsModifier
    ) {
      return ArrowSkipReasons.ASSERTION;
    }

    const header = sourceFile.text.slice(
      declaration.getStart(sourceFile),
      name.getStart(sourceFile),
    );

    if (header.includes('//') || header.includes('/*')) {
      return ArrowSkipReasons.HEADER_COMMENT;
    }

    return (
      FunctionToArrow.ownBinding({ typescript, declaration }) ??
      (symbol
        ? FunctionToArrow.usage({
            typescript,
            sourceFile,
            checker,
            references,
            declaration,
            symbol,
          })
        : undefined)
    );
  }

  /** One pass over the file: the declarations that are safe, innermost ones included. */
  private static pass(opts: {
    typescript: TTypeScript;
    fileName: string;
    source: string;
  }): IArrowRewrite {
    const { typescript, fileName, source } = opts;
    const sourceFile = typescript.createSourceFile(
      fileName,
      source,
      typescript.ScriptTarget.Latest,
      true,
    );
    // One file, no library: enough to tell which names refer to which declaration.
    const host: ts.CompilerHost = {
      ...typescript.createCompilerHost({}),
      getSourceFile: (name) => (name === fileName ? sourceFile : undefined),
    };
    const checker = typescript
      .createProgram([fileName], { noLib: true, noResolve: true, allowJs: false }, host)
      .getTypeChecker();
    const references = FunctionToArrow.references({ typescript, sourceFile, checker });
    const isTsx = fileName.endsWith('.tsx');
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const skipped: Array<IArrowSkip> = [];

    const visit = (node: ts.Node): void => {
      typescript.forEachChild(node, visit);

      if (!typescript.isFunctionDeclaration(node) || !node.name) {
        if (
          typescript.isFunctionDeclaration(node) &&
          (typescript.getModifiers(node) ?? []).some(
            (modifier) => modifier.kind === typescript.SyntaxKind.DefaultKeyword,
          )
        ) {
          skipped.push({
            name: 'default',
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            reason: ArrowSkipReasons.EXPORT_DEFAULT,
          });
        }

        return;
      }

      const name = node.name;
      const reason = FunctionToArrow.skipReason({
        typescript,
        sourceFile,
        checker,
        references,
        declaration: node,
        name,
      });

      if (reason || !node.body) {
        skipped.push({
          name: name.text,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          reason: reason ?? ArrowSkipReasons.OVERLOAD,
        });

        return;
      }

      const modifiers = (typescript.getModifiers(node) ?? []).map((modifier) => modifier.kind);
      const isExported = modifiers.includes(typescript.SyntaxKind.ExportKeyword);
      const isAsync = modifiers.includes(typescript.SyntaxKind.AsyncKeyword);
      let signature = source.slice(name.end, node.body.getStart(sourceFile)).trimEnd();

      // In a .tsx file `<T>(` opens an element; the comma makes it a type parameter list.
      if (isTsx && node.typeParameters?.length === 1) {
        signature = signature.replace(/>(\s*\()/, ',>$1');
      }

      const head = `${isExported ? 'export ' : ''}const ${name.text} = ${isAsync ? 'async ' : ''}${signature} => `;
      const bodyStart = node.body.getStart(sourceFile);

      edits.push({ start: node.getStart(sourceFile), end: bodyStart, text: head });

      if (source[node.body.end] !== ';') {
        edits.push({ start: node.body.end, end: node.body.end, text: ';' });
      }
    };

    visit(sourceFile);

    let output = source;

    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return {
      output,
      rewritten: edits.filter((edit) => edit.end !== edit.start).length,
      skipped: skipped.sort((a, b) => a.line - b.line),
    };
  }

  /** The file with every safe declaration rewritten, and the ones left alone with their reasons. */
  static rewrite(opts: {
    typescript: TTypeScript;
    fileName: string;
    source: string;
  }): IArrowRewrite {
    return FunctionToArrow.pass(opts);
  }
}

/**
 * `devz codemod function-to-arrow [paths...] [--write [--all] | --check | --dry-run]`: a dry run unless `--write`
 * is given. `--check` is the same dry run, and exits 1 while a file would change.
 */
export class FunctionToArrowCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (
      args.includes(FunctionToArrowFlags.HELP) ||
      args.includes(FunctionToArrowFlags.HELP_SHORT)
    ) {
      CliOutput.log(USAGE);

      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));
    const unknown = flags.filter((flag) => !FunctionToArrowFlags.isValid(flag));
    const isWrite = flags.includes(FunctionToArrowFlags.WRITE);
    const isCheck = flags.includes(FunctionToArrowFlags.CHECK);
    const isDryRun = flags.includes(FunctionToArrowFlags.DRY_RUN);

    if (unknown.length > 0 || (isWrite && (isCheck || isDryRun))) {
      const problem =
        unknown.length > 0
          ? `unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}`
          : `${FunctionToArrowFlags.WRITE} contradicts a dry run`;
      CliOutput.error(`devz codemod: ${problem}\n${USAGE}`);

      return USAGE_ERROR_CODE;
    }

    const refusal = CodemodFiles.refusal({
      command: 'function-to-arrow',
      isWrite,
      isAll: flags.includes(FunctionToArrowFlags.ALL),
      paths,
    });

    if (refusal) {
      CliOutput.error(`${refusal}\n${USAGE}`);

      return USAGE_ERROR_CODE;
    }

    let typescript: TTypeScript;

    try {
      const loaded = await import('typescript');
      typescript = loaded.default;
    } catch {
      CliOutput.error('devz codemod: the "typescript" package is required to read your sources');

      return 1;
    }

    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    let changedCount = 0;
    let rewrittenCount = 0;
    let refusedCount = 0;
    const skips: Array<string> = [];

    for (const target of targets) {
      const files = CodemodFiles.collect({ target });
      const dirty = isWrite ? CodemodFiles.dirty({ target }) : undefined;

      if (files.length === 0 && paths.length > 0) {
        CliOutput.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of files) {
        const source = readFileSync(file, 'utf8');

        if (!source.includes('function')) {
          continue;
        }

        const result = FunctionToArrow.rewrite({ typescript, fileName: file, source });
        const shown = relative(root, file).split('\\').join('/') || file;
        skips.push(
          ...result.skipped.map((skip) => `  ${shown}:${skip.line}  ${skip.name}  ${skip.reason}`),
        );

        if (result.rewritten === 0) {
          continue;
        }

        if (dirty?.has(file)) {
          refusedCount += 1;
          CliOutput.warn(
            `refused  ${shown}  has local changes (commit, stash or "git add" them, then run again)`,
          );
          continue;
        }

        changedCount += 1;
        rewrittenCount += result.rewritten;
        CliOutput.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} function(s))`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    if (skips.length > 0) {
      CliOutput.log(`left as they are (${skips.length}):\n${skips.join('\n')}`);
    }

    CliOutput.log(
      `devz codemod function-to-arrow: ${rewrittenCount} function(s) ${isWrite ? 'rewritten' : 'would be rewritten'} in ${changedCount} file(s), ${skips.length} left` +
        (refusedCount > 0 ? `, ${refusedCount} file(s) refused` : ''),
    );

    if (!isWrite && changedCount > 0) {
      CliOutput.log(
        `Nothing was written. Run again with ${FunctionToArrowFlags.WRITE} to apply, then run your typecheck, formatter and tests.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && changedCount > 0 ? 1 : 0;
  }
}
