import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod any-aliases [paths...] [--strict] [--write [--all] | --check]

Replaces the AnyType and AnyObject aliases the @venizia/ignis-helpers and @venizia/ignis-inversion
releases deleted, by what they stood for, so a bump changes no type in your code:

  AnyType      becomes  any
  AnyObject    becomes  Record<string | symbol | number, any>

in every file that imports them from @venizia/ignis, @venizia/ignis-helpers, @venizia/ignis-inversion,
@venizia/ardor or @venizia/ardor-kernel (ARDOR re-exported the same two names; a sub-path such as
@venizia/ignis-helpers/common too), whatever local name the import gives them
(import { AnyType as Loose } ...). The names leave the import, and an import left empty is dropped.

With --strict it writes the tighter types instead of the default ones, for code that wants to stop using any:

  AnyType      becomes  unknown
  AnyObject    becomes  Record<string, unknown>

--strict surfaces errors that any hid: an unknown value cannot be read, or passed as a narrower type, without a
check; an interface-typed value is not assignable to Record<string, unknown> (an interface has no implicit
index signature); and a symbol or number key on a former AnyObject fails (TS2538). Declare the shape as a type
alias, spread the value, or narrow it; run your typecheck after it.
--strict acts only on the alias names: a file already rewritten to any is left alone, so run it instead of
the default run, on a path at a time, and tighten the rest by hand.

It lists, and leaves alone:
  manual  a re-export (export { AnyType }, export type { AnyObject } from ...), an import("...").AnyType
          type, and AnyType in a heritage clause (extends any and extends unknown are not valid)
  local   a same-named type the file declares (in any scope: a namespace, a function, a block, a type
          parameter) or imports from somewhere else; a use that such a declaration shadows is left alone

A name used in a heritage clause keeps its import, and so keeps all its other uses in that file: once you
replace the heritage use by hand, run the codemod again and the other uses are rewritten.

It reads TypeScript files (.ts, .tsx, .mts, .cts) and is idempotent: a second run changes nothing.

  --strict   write unknown and Record<string, unknown> instead of any
  --write    write the changed files (without it, nothing is written); it needs a path, or --all
  --all      with --write and no path: rewrite every source file under the working directory
  --check    dry run that exits 1 while a file would change or a manual case is left (for CI)
  --help     print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the files
git knows, and --write refuses a file with local changes: commit or stash it first, so git can undo it.
There is no --reverse: a downgrade restores the files from git.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/**
 * The packages the aliases were exported from, each with or without a sub-path: the IGNIS root package, helpers and
 * inversion, and the ARDOR packages that re-exported the same two names (same names, same meaning).
 */
const ALIAS_PACKAGES = [
  '@venizia/ignis',
  '@venizia/ignis-helpers',
  '@venizia/ignis-inversion',
  '@venizia/ardor',
  '@venizia/ardor-kernel',
];

const ALIAS_MODULE = new RegExp(
  `^(?:${ALIAS_PACKAGES.map((name) => name.replace(/[/.-]/g, '\\$&')).join('|')})(?:/.*)?$`,
);

/** The deleted aliases and what each becomes by default: what they stood for, so the types of the code do not change. */
const REPLACEMENTS = new Map<string, string>([
  ['AnyType', 'any'],
  ['AnyObject', 'Record<string | symbol | number, any>'],
]);

/** With `--strict`: the tighter types, for code that wants to stop using `any`. */
const STRICT_REPLACEMENTS = new Map<string, string>([
  ['AnyType', 'unknown'],
  ['AnyObject', 'Record<string, unknown>'],
]);

/** What `AnyType` becomes in either mode: neither `extends any` nor `extends unknown` is valid, so a heritage use is left. */
const HERITAGE_BLOCKED = new Set(['any', 'unknown']);

class AnyAliasesFlags {
  static readonly WRITE = '--write';
  static readonly ALL = '--all';
  static readonly CHECK = '--check';
  static readonly STRICT = '--strict';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.ALL,
    this.CHECK,
    this.STRICT,
    this.HELP,
    this.HELP_SHORT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export interface IAnyAliasesResult {
  output: string;
  changed: boolean;
  /** How many type references were rewritten. */
  rewritten: number;
  /** What the codemod cannot place: file line (1-based) and why. */
  manual: Array<{ line: number; reason: string }>;
  /** Same-named types that are not the IGNIS aliases: file line (1-based) and the name. */
  local: Array<{ line: number; name: string }>;
}

/** Replaces the deleted `AnyType` and `AnyObject` aliases by what they stood for (`any`), or with `isStrict` by the tighter types. */
export class AnyAliases {
  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
    /** Write `unknown` and `Record<string, unknown>` instead of `any`. */
    isStrict?: boolean;
  }): IAnyAliasesResult {
    const { typescript: ts, fileName, source, isStrict = false } = opts;
    const replacements = isStrict ? STRICT_REPLACEMENTS : REPLACEMENTS;
    const language = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, language);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const manual: Array<{ line: number; reason: string }> = [];
    const local: Array<{ line: number; name: string }> = [];
    let rewritten = 0;

    const lineOf = (node: import('typescript').Node): number =>
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

    const addReplacement = (node: import('typescript').Node, replacement: string): void => {
      edits.push({ start: node.getStart(file), end: node.getEnd(), text: replacement });
      rewritten += 1;
    };

    // The local names bound to an alias (name -> replacement), the namespace imports of a module that held them
    // and the names the file exports.
    const aliasNames = new Map<string, string>();
    const namespaces = new Set<string>();
    const exportedNames = new Set<string>();

    /**
     * Whether a declaration in a scope that encloses `node` (below the file: a namespace, a function, a block, a
     * type parameter) binds `name`, so the name there is not the file-level import. `isNamespace` is what the use needs:
     * a namespace (the left side of `H.AnyType`) rather than a type.
     */
    const isShadowed = (
      node: import('typescript').Node,
      name: string,
      isNamespace: boolean,
    ): boolean => {
      const hasInfer = (type: import('typescript').Node): boolean =>
        (ts.isInferTypeNode(type) && type.typeParameter.name.text === name) ||
        ts.forEachChild(type, (child) => (hasInfer(child) ? true : undefined)) === true;

      // `child` is the node the walk came from: an `infer` name is bound in the true branch of its conditional type only.
      let child: import('typescript').Node = node;

      for (let scope: import('typescript').Node | undefined = node.parent; scope !== undefined;) {
        if (ts.isSourceFile(scope)) {
          return false;
        }

        if (!isNamespace) {
          if (
            (ts.isFunctionLike(scope) ||
              ts.isClassLike(scope) ||
              ts.isInterfaceDeclaration(scope) ||
              ts.isTypeAliasDeclaration(scope)) &&
            scope.typeParameters?.some((parameter) => parameter.name.text === name)
          ) {
            return true;
          }

          if (ts.isMappedTypeNode(scope) && scope.typeParameter.name.text === name) {
            return true;
          }

          if (
            ts.isConditionalTypeNode(scope) &&
            child === scope.trueType &&
            hasInfer(scope.extendsType)
          ) {
            return true;
          }
        }

        if (
          ts.isBlock(scope) ||
          ts.isModuleBlock(scope) ||
          ts.isCaseClause(scope) ||
          ts.isDefaultClause(scope)
        ) {
          for (const statement of scope.statements) {
            let declared: import('typescript').Node | undefined;

            if (
              ts.isTypeAliasDeclaration(statement) ||
              ts.isInterfaceDeclaration(statement) ||
              ts.isClassDeclaration(statement)
            ) {
              declared = !isNamespace ? statement.name : undefined;
            } else if (ts.isEnumDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
              declared = statement.name;
            } else if (ts.isModuleDeclaration(statement)) {
              declared = isNamespace ? statement.name : undefined;
            }

            if (declared !== undefined && ts.isIdentifier(declared) && declared.text === name) {
              return true;
            }
          }
        }

        child = scope;
        scope = scope.parent;
      }

      return false;
    };

    // `export { AnyType }` keeps the import alive: that name is left to the user (reported below).
    for (const statement of file.statements) {
      if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier === undefined &&
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause)
      ) {
        for (const element of statement.exportClause.elements) {
          exportedNames.add((element.propertyName ?? element.name).text);
        }
      }
    }

    // `extends any`, `extends unknown` and `implements` of either are not valid TypeScript: an alias used in a heritage
    // clause whose replacement is `any` or `unknown` is left (import and references) and reported where it is used.
    const heritageBlocked = new Set<string>();
    const importedReplacement = new Map<string, string>();

    for (const statement of file.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        ALIAS_MODULE.test(statement.moduleSpecifier.text) &&
        statement.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const element of statement.importClause.namedBindings.elements) {
          const replacement = replacements.get((element.propertyName ?? element.name).text);

          if (replacement !== undefined) {
            importedReplacement.set(element.name.text, replacement);
          }
        }
      }
    }

    const scanHeritage = (node: import('typescript').Node): void => {
      if (
        ts.isExpressionWithTypeArguments(node) &&
        ts.isIdentifier(node.expression) &&
        HERITAGE_BLOCKED.has(importedReplacement.get(node.expression.text) ?? '') &&
        !isShadowed(node, node.expression.text, false)
      ) {
        heritageBlocked.add(node.expression.text);
      }

      ts.forEachChild(node, scanHeritage);
    };

    scanHeritage(file);

    const removedRanges: Array<{ start: number; end: number }> = [];

    // Imports: which local names are the aliases, and how each import is rewritten.
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }

      const clause = statement.importClause;
      const isAliasSource = ALIAS_MODULE.test(statement.moduleSpecifier.text);

      if (clause === undefined) {
        continue;
      }

      if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
        if (isAliasSource) {
          namespaces.add(clause.namedBindings.name.text);
        }

        continue;
      }

      if (clause.namedBindings === undefined || !ts.isNamedImports(clause.namedBindings)) {
        if (clause.name !== undefined && replacements.has(clause.name.text) && !isAliasSource) {
          local.push({ line: lineOf(clause.name), name: clause.name.text });
        }

        continue;
      }

      const named = clause.namedBindings;
      const kept: Array<{ text: string; trailing: string }> = [];

      // A comment that follows an element on its line (after its comma) belongs to that element: it goes with it
      // when the element is removed, and it is not part of the next element's leading comments.
      const trailings = named.elements.map((element) => {
        const match = /^[ \t]*,?[ \t]*(\/\/[^\r\n]*|\/\*[^\r\n]*?\*\/)/.exec(
          source.slice(element.getEnd()),
        );

        return { comment: match?.[1] ?? '', end: element.getEnd() + (match?.[0].length ?? 0) };
      });

      /** An element as it is kept: its text with its own leading comments, and the comment that follows it on its line. */
      const keep = (element: import('typescript').ImportSpecifier, index: number) => {
        const previous = trailings[index - 1];
        const from =
          previous === undefined || previous.comment === ''
            ? element.getFullStart()
            : Math.max(element.getFullStart(), previous.end);

        kept.push({
          text: source.slice(from, element.getEnd()).trim(),
          trailing: trailings[index]?.comment ?? '',
        });
      };

      let removed = 0;

      for (const [index, element] of named.elements.entries()) {
        const imported = (element.propertyName ?? element.name).text;
        const localName = element.name.text;
        const replacement = replacements.get(imported);

        if (replacement === undefined) {
          keep(element, index);

          continue;
        }

        if (!isAliasSource) {
          keep(element, index);
          local.push({ line: lineOf(element), name: localName });

          continue;
        }

        if (exportedNames.has(localName)) {
          keep(element, index);
          manual.push({
            line: lineOf(element),
            reason: `${localName}${localName === imported ? '' : ` (the alias ${imported})`} is re-exported by this file: the alias is gone, export the type you meant`,
          });

          continue;
        }

        if (heritageBlocked.has(localName)) {
          keep(element, index);

          continue;
        }

        aliasNames.set(localName, replacement);
        removed += 1;
      }

      if (removed === 0) {
        continue;
      }

      if (kept.length === 0 && clause.name === undefined) {
        const start = statement.getStart(file);
        let end = statement.getEnd();

        if (source.startsWith('\r\n', end)) {
          end += 2;
        } else if (source[end] === '\n') {
          end += 1;
        }

        // A blank line that only separated this import from the next code (or from the top of the file) goes with it.
        // The imports removed before this one are not there any more: a file that starts with a removed import
        // must not start with a blank line.
        let before = source.slice(0, start);

        for (const range of [...removedRanges].reverse()) {
          before = before.slice(0, range.start) + before.slice(range.end);
        }

        const isOnlyLeading = before.trim() === '' || /\n\s*\n$/.test(before);
        const blank = /^[ \t]*\r?\n/.exec(source.slice(end));

        if (isOnlyLeading && blank !== null) {
          end += blank[0].length;
        }

        edits.push({ start, end, text: '' });
        removedRanges.push({ start, end });
      } else if (kept.length === 0 && clause.name !== undefined) {
        // A default import stays: `import Default, { AnyType } from ...` -> `import Default from ...`.
        edits.push({ start: clause.name.getEnd(), end: named.getEnd(), text: '' });
      } else {
        const isMultiline = /\r?\n/.test(source.slice(named.getStart(file), named.getEnd()));
        const hasTrailingComma = named.elements.hasTrailingComma;
        const lines = kept.map((item, index) => {
          const comma = index < kept.length - 1 || hasTrailingComma ? ',' : '';

          return `  ${item.text}${comma}${item.trailing === '' ? '' : ` ${item.trailing}`}`;
        });
        const text = isMultiline
          ? `{\n${lines.join('\n')}\n}`
          : `{ ${kept.map((item) => item.text).join(', ')} }`;

        edits.push({ start: named.getStart(file), end: named.getEnd(), text });
      }
    }

    // Declarations of a same-named type that is not an import of the aliases.
    for (const statement of file.statements) {
      if (
        (ts.isTypeAliasDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name !== undefined &&
        replacements.has(statement.name.text) &&
        !aliasNames.has(statement.name.text)
      ) {
        local.push({ line: lineOf(statement.name), name: statement.name.text });
      }
    }

    const visit = (node: import('typescript').Node): void => {
      // A same-named type declared below the file level (a namespace, a function, a block, a type parameter) is a
      // different type: it is listed, and the uses it shadows are left alone (see isShadowed).
      if (
        (ts.isTypeAliasDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isEnumDeclaration(node) ||
          ts.isTypeParameterDeclaration(node)) &&
        node.name !== undefined &&
        replacements.has(node.name.text) &&
        !ts.isSourceFile(node.parent)
      ) {
        local.push({ line: lineOf(node.name), name: node.name.text });
      }

      if (ts.isTypeReferenceNode(node) && node.typeArguments === undefined) {
        const { typeName } = node;
        const byName =
          ts.isIdentifier(typeName) && !isShadowed(node, typeName.text, false)
            ? aliasNames.get(typeName.text)
            : undefined;
        const byNamespace =
          ts.isQualifiedName(typeName) &&
          ts.isIdentifier(typeName.left) &&
          namespaces.has(typeName.left.text) &&
          !isShadowed(node, typeName.left.text, true)
            ? replacements.get(typeName.right.text)
            : undefined;
        const replacement = byName ?? byNamespace;

        if (replacement !== undefined) {
          addReplacement(node, replacement);

          return;
        }
      }

      if (ts.isExpressionWithTypeArguments(node) && node.typeArguments === undefined) {
        const { expression } = node;
        const byName =
          ts.isIdentifier(expression) && !isShadowed(node, expression.text, false)
            ? aliasNames.get(expression.text)
            : undefined;
        const byNamespace =
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          namespaces.has(expression.expression.text) &&
          !isShadowed(node, expression.expression.text, true)
            ? replacements.get(expression.name.text)
            : undefined;
        const replacement = byName ?? byNamespace;

        if (replacement !== undefined && HERITAGE_BLOCKED.has(replacement)) {
          manual.push({
            line: lineOf(node),
            reason: `${node.getText(file)} in a heritage clause: extends any, extends unknown and implements are not valid, name the members you mean`,
          });

          return;
        }

        if (replacement !== undefined) {
          addReplacement(node, replacement);

          return;
        }

        if (
          ts.isIdentifier(expression) &&
          heritageBlocked.has(expression.text) &&
          !isShadowed(node, expression.text, false)
        ) {
          manual.push({
            line: lineOf(node),
            reason: `${expression.text} in a heritage clause: extends any, extends unknown and implements are not valid, name the members you mean`,
          });

          return;
        }
      }

      if (
        ts.isImportTypeNode(node) &&
        node.qualifier !== undefined &&
        ts.isIdentifier(node.qualifier) &&
        replacements.has(node.qualifier.text) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal) &&
        ALIAS_MODULE.test(node.argument.literal.text)
      ) {
        manual.push({
          line: lineOf(node),
          reason: `import("${node.argument.literal.text}").${node.qualifier.text}: replace the whole type by hand`,
        });
      }

      if (
        ts.isExportDeclaration(node) &&
        node.exportClause !== undefined &&
        ts.isNamedExports(node.exportClause)
      ) {
        const isIgnisSource =
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          ALIAS_MODULE.test(node.moduleSpecifier.text);

        for (const element of node.exportClause.elements) {
          const exported = (element.propertyName ?? element.name).text;

          if (replacements.has(exported) && isIgnisSource) {
            manual.push({
              line: lineOf(element),
              reason: `a re-export of ${exported}: the alias is gone, export the type you meant`,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(file);

    if (edits.length === 0) {
      return { output: source, changed: false, rewritten: 0, manual, local };
    }

    let output = source;

    for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, rewritten, manual, local };
  }
}

/** `devz codemod any-aliases`: reads the sources, prints what changes, writes with `--write`. */
export class AnyAliasesCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (args.includes(AnyAliasesFlags.HELP) || args.includes(AnyAliasesFlags.HELP_SHORT)) {
      console.log(USAGE);

      return 0;
    }

    const flags = args.filter((argument) => argument.startsWith('-'));
    const paths = args.filter((argument) => !argument.startsWith('-'));
    const unknown = flags.filter((flag) => !AnyAliasesFlags.isValid(flag));

    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(AnyAliasesFlags.WRITE);
    const isCheck = flags.includes(AnyAliasesFlags.CHECK);
    const isStrict = flags.includes(AnyAliasesFlags.STRICT);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${AnyAliasesFlags.WRITE} and ${AnyAliasesFlags.CHECK} contradict each other\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const refusal = CodemodFiles.refusal({
      command: 'any-aliases',
      isWrite,
      isAll: flags.includes(AnyAliasesFlags.ALL),
      paths,
    });

    if (refusal) {
      console.error(`${refusal}\n${USAGE}`);

      return USAGE_ERROR_CODE;
    }

    let typescript: typeof import('typescript');

    try {
      const loaded = await import('typescript');
      typescript = loaded.default;
    } catch {
      console.error('devz codemod: the "typescript" package is required to read your sources');

      return 1;
    }

    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    let changedCount = 0;
    let referenceCount = 0;
    let manualCount = 0;
    let localCount = 0;
    let refusedCount = 0;

    for (const target of targets) {
      const files = CodemodFiles.collect({ target });
      const dirty = isWrite ? CodemodFiles.dirty({ target }) : undefined;

      if (files.length === 0 && paths.length > 0) {
        console.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of files) {
        const source = readFileSync(file, 'utf8');

        if (!/\bAny(?:Type|Object)\b/.test(source)) {
          continue;
        }

        const result = AnyAliases.rewrite({ typescript, fileName: file, source, isStrict });
        const shown = relative(root, file).split('\\').join('/') || file;

        for (const item of result.manual) {
          manualCount += 1;
          console.warn(`manual  ${shown}:${item.line}  ${item.reason}`);
        }

        for (const item of result.local) {
          localCount += 1;
          console.warn(
            `local  ${shown}:${item.line}  ${item.name} is not the IGNIS alias (declared here or imported from elsewhere): left alone`,
          );
        }

        if (!result.changed) {
          continue;
        }

        if (dirty?.has(file)) {
          refusedCount += 1;
          console.warn(
            `refused  ${shown}  has local changes (commit or stash them, then run again)`,
          );
          continue;
        }

        changedCount += 1;
        referenceCount += result.rewritten;
        console.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} reference(s))`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod any-aliases: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${referenceCount} reference(s) ${isWrite ? 'rewritten' : 'would be rewritten'}, ${manualCount} manual, ${localCount} local` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (!isWrite && changedCount > 0) {
      console.log(
        `Nothing was written. Run again with ${AnyAliasesFlags.WRITE} to apply, then run your typecheck${isStrict ? ': a value an alias used to accept may need a type alias, a spread or a narrowing' : ''}.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && (changedCount > 0 || manualCount > 0) ? 1 : 0;
  }
}
