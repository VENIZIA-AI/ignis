import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CodemodFiles } from './files';

const USAGE = `Usage: devz codemod binding-keys [paths...] [--write [--all] | --check] [--import-from <module>]

Rewrites the raw binding keys of the @venizia/ignis-inversion release where a key is made by BindingKeys.build<T>:

  container.get<Mailer>({ key: 'services.Mailer' })   becomes  container.get({ key: BindingKeys.build<Mailer>({ key: 'services.Mailer' }) })
  container.bind({ key: 'services.Mailer' })          becomes  container.bind({ key: BindingKeys.build<unknown>({ key: 'services.Mailer' }) })
  @inject({ key: 'services.Mailer' })                 becomes  @inject({ key: BindingKeys.build<unknown>({ key: 'services.Mailer' }) })
  container.get({ key: { namespace, key } })          becomes  container.get({ key: BindingKeys.build<unknown>({ namespace, key }) })
  container.get({ key: \`\${namespace}.Name\` })         becomes  container.get({ key: BindingKeys.build<unknown>({ namespace, key: 'Name' }) })
  BindingKeys.build({ key })                          becomes  BindingKeys.build<unknown>({ key })

The key string is never changed. The call's own type argument moves into build<T>, so the caller keeps the type it
claimed; without one the codemod writes build<unknown> and lists the site ("type"): name the real type there.

It rewrites a call named get, gets, getBinding, bind, isBound or unbind whose argument is an object literal with a
\`key\` (and, for get, \`isOptional\`), and a call of inject or provide. A container cannot be told from syntax, so the shape is the
test. A string key, a substitution-free template literal, a { namespace, key } literal and a template written
\${namespace}.Name or \${namespace}.\${name} are rewritten. These are listed
as "manual" and left alone: a key made at run time (a template with substitutions, a call) and a Symbol key (symbols are no
longer keys). A key that is a const of the file (const MAILER = 'services.Mailer') is rewritten where it is declared. Any
other name or property (Keys.MAILER) is left alone without a line: it may already be a built key, and your typecheck
names a raw one.

BindingKeys is imported from the module the file already takes inject from, else from the first @venizia/ignis import,
or from --import-from <module>; a file with none of them is listed as manual and not rewritten. An existing import of
BindingKeys is reused. A second run changes nothing.

It reads TypeScript files (.ts, .tsx, .mts, .cts). A .js, .cjs or .mjs file is not read: edit it by hand.

  --write        write the changed files (without it, nothing is written); it needs a path, or --all
  --all          with --write and no path: rewrite every source file under the working directory
  --check        dry run that exits 1 while a file would change or a manual site remains (for CI)
  --import-from  the module BindingKeys is imported from when the file gives no better one
  --help         print this text and exit

With no flag it lists what would change and writes nothing. Inside a git repository it reads the files git knows, and
--write refuses a file with local changes: commit or stash it first, so git can undo it.
There is no --reverse: a downgrade restores the files from git.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

/** The methods whose options object carries a container key. */
const KEY_METHODS = new Set(['get', 'gets', 'getBinding', 'bind', 'isBound', 'unbind']);

/** The other properties a key options object may carry and still be one. */
const OPTION_NAMES = new Set(['key', 'isOptional', 'scope']);

/** The decorators that take a key options object. */
const KEY_DECORATORS = new Set(['inject', 'provide']);

/** Where a file already imports the container API from. */
const IGNIS_MODULE = /^@venizia\/ignis(?:-kernel|-inversion)?$/;

const BUILDER = 'BindingKeys';

/** A module of the framework: a file's own barrel is not a place to take `BindingKeys` from. */
const VENIZIA_MODULE = /^@venizia\//;

class BindingKeysFlags {
  static readonly WRITE = '--write';
  static readonly ALL = '--all';
  static readonly CHECK = '--check';
  static readonly IMPORT_FROM = '--import-from';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.ALL,
    this.CHECK,
    this.IMPORT_FROM,
    this.HELP,
    this.HELP_SHORT,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** One site the codemod would change or cannot change. */
export interface IBindingKeysResult {
  output: string;
  changed: boolean;
  rewritten: number;
  /** Lines where `build<unknown>` was written because the call named no type. */
  unnamed: number[];
  manual: Array<{ line: number; reason: string }>;
}

/** Rewrites raw binding keys to `BindingKeys.build<T>({ key })`. */
export class BindingKeysCodemod {
  /** The module `BindingKeys` comes from in this file: an existing import, the module of `inject`, a @venizia/ignis import, or `fallback`. */
  private static readIdentifierSource(opts: {
    typescript: typeof import('typescript');
    file: import('typescript').SourceFile;
    fallback?: string;
  }): { module: string | undefined; declared: boolean; named?: import('typescript').NamedImports } {
    const { typescript: ts, file, fallback } = opts;
    let injectModule: string | undefined;
    let ignisModule: string | undefined;
    let named: import('typescript').NamedImports | undefined;
    let declared = false;

    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }

      const module = statement.moduleSpecifier.text;
      const bindings = statement.importClause?.namedBindings;
      const isTypeOnly = statement.importClause?.isTypeOnly === true;

      if (bindings === undefined || !ts.isNamedImports(bindings)) {
        continue;
      }

      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;

        if (imported === BUILDER && !isTypeOnly && !element.isTypeOnly) {
          declared = true;
        }

        if (imported === 'inject' && injectModule === undefined && VENIZIA_MODULE.test(module)) {
          injectModule = module;
        }
      }

      if (IGNIS_MODULE.test(module) && !isTypeOnly) {
        ignisModule ??= module;
        named ??= bindings;
      }
    }

    return { module: injectModule ?? ignisModule ?? fallback, declared, named };
  }

  static rewrite(opts: {
    typescript: typeof import('typescript');
    fileName: string;
    source: string;
    /** The module `BindingKeys` is imported from when the file gives no better one. */
    importFrom?: string;
  }): IBindingKeysResult {
    const { typescript: ts, fileName, source, importFrom } = opts;
    const language = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, language);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const manual: Array<{ line: number; reason: string }> = [];
    const unnamed: number[] = [];
    const handled = new Set<import('typescript').Node>();
    /** `const NAME = 'literal'` declared once in the file: a key held in a constant is rewritten where it is declared. */
    const constants = new Map<string, import('typescript').VariableDeclaration>();
    const duplicates = new Set<string>();
    let rewritten = 0;
    const lineOf = (node: import('typescript').Node): number =>
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

    const propertyOf = (
      node: import('typescript').ObjectLiteralExpression,
      name: string,
    ): import('typescript').PropertyAssignment | undefined => {
      for (const property of node.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
          property.name.text === name
        ) {
          return property;
        }
      }

      return undefined;
    };

    /** An object literal whose properties are all in `names` and that has a `key`: the shape of a key options object. */
    const isKeyOptions = (
      node: import('typescript').Expression | undefined,
    ): node is import('typescript').ObjectLiteralExpression => {
      if (node === undefined || !ts.isObjectLiteralExpression(node)) {
        return false;
      }

      return (
        propertyOf(node, 'key') !== undefined &&
        node.properties.every(
          (property) =>
            ts.isPropertyAssignment(property) &&
            (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
            OPTION_NAMES.has(property.name.text),
        )
      );
    };

    const isBuilderCall = (
      node: import('typescript').Node,
    ): node is import('typescript').CallExpression =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === BUILDER &&
      node.expression.name.text === 'build';

    const isSymbolExpression = (node: import('typescript').Expression): boolean =>
      (ts.isCallExpression(node) &&
        ((ts.isIdentifier(node.expression) && node.expression.text === 'Symbol') ||
          (ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === 'Symbol'))) ||
      (ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Symbol');

    /**
     * The `{ namespace, key }` text of a template written as `${namespace}.Name` or `${namespace}.${name}` (the two
     * shapes the framework's own keys take), or `undefined` for any other template.
     */
    const namespaceKeyOf = (node: import('typescript').TemplateExpression): string | undefined => {
      const { head, templateSpans } = node;

      if (head.text !== '') {
        return undefined;
      }

      if (templateSpans.length === 1 && templateSpans[0].literal.text.startsWith('.')) {
        const tail = templateSpans[0].literal.text.slice(1);

        return tail === ''
          ? undefined
          : `{ namespace: ${templateSpans[0].expression.getText(file)}, key: '${tail.replace(/'/g, "\\'")}' }`;
      }

      if (
        templateSpans.length === 2 &&
        templateSpans[0].literal.text === '.' &&
        templateSpans[1].literal.text === ''
      ) {
        return `{ namespace: ${templateSpans[0].expression.getText(file)}, key: ${templateSpans[1].expression.getText(file)} }`;
      }

      return undefined;
    };

    /**
     * Wraps the key of one options object. `typeText` is the value type the call already claimed, or `undefined` for
     * `unknown`. Answers whether the key was rewritten.
     */
    const rewriteKey = (
      options: import('typescript').ObjectLiteralExpression,
      typeText: string | undefined,
    ): boolean => {
      const property = propertyOf(options, 'key');

      if (property === undefined) {
        return false;
      }

      const value = property.initializer;
      const text = typeText ?? 'unknown';

      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
        edits.push({
          start: value.getStart(file),
          end: value.getEnd(),
          text: `${BUILDER}.build<${text}>({ key: ${value.getText(file)} })`,
        });
      } else if (
        ts.isObjectLiteralExpression(value) &&
        propertyOf(value, 'key') !== undefined &&
        value.properties.every(
          (item) =>
            ts.isPropertyAssignment(item) &&
            ts.isIdentifier(item.name) &&
            (item.name.text === 'key' || item.name.text === 'namespace'),
        )
      ) {
        edits.push({
          start: value.getStart(file),
          end: value.getEnd(),
          text: `${BUILDER}.build<${text}>(${value.getText(file)})`,
        });
      } else if (ts.isTemplateExpression(value) && namespaceKeyOf(value) !== undefined) {
        edits.push({
          start: value.getStart(file),
          end: value.getEnd(),
          text: `${BUILDER}.build<${text}>(${namespaceKeyOf(value)})`,
        });
      } else if (
        ts.isIdentifier(value) &&
        constants.has(value.text) &&
        !duplicates.has(value.text)
      ) {
        const declaration = constants.get(value.text);

        if (declaration?.initializer === undefined || handled.has(declaration)) {
          return false;
        }

        handled.add(declaration);
        edits.push({
          start: declaration.initializer.getStart(file),
          end: declaration.initializer.getEnd(),
          text: `${BUILDER}.build<${text}>({ key: ${declaration.initializer.getText(file)} })`,
        });

        if (typeText === undefined) {
          unnamed.push(lineOf(declaration));
        }

        rewritten += 1;

        return true;
      } else if (isBuilderCall(value)) {
        if (value.typeArguments !== undefined) {
          return false;
        }

        handled.add(value);
        // `BindingKeys.build(` then the argument: the type argument goes between the name and the parenthesis.
        edits.push({
          start: value.expression.getEnd(),
          end: value.expression.getEnd(),
          text: `<${text}>`,
        });
      } else if (isSymbolExpression(value)) {
        manual.push({
          line: lineOf(value),
          reason:
            'a Symbol key: symbols are no longer binding keys, use BindingKeys.build<T>({ key: "..." })',
        });

        return false;
      } else {
        // A name or a property (`MAILER`, `Keys.MAILER`) may already be a built key, and the typecheck names a raw
        // one: only an expression that makes a string at run time is listed.
        const isReference =
          ts.isIdentifier(value) ||
          ts.isPropertyAccessExpression(value) ||
          ts.isElementAccessExpression(value);

        if (!isReference) {
          manual.push({
            line: lineOf(value),
            reason:
              'a key made at run time (a template with substitutions, a call): build it with BindingKeys.build<T>({ key }) where it is made',
          });
        }

        return false;
      }

      rewritten += 1;

      if (typeText === undefined) {
        unnamed.push(lineOf(value));
      }

      return true;
    };

    const visit = (node: import('typescript').Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const first = node.arguments[0];
        const isInject = ts.isIdentifier(callee) && KEY_DECORATORS.has(callee.text);
        const isMethod =
          ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.name) &&
          KEY_METHODS.has(callee.name.text);
        const methodName = ts.isPropertyAccessExpression(callee) ? callee.name.text : '';

        if (
          isBuilderCall(node) &&
          node.typeArguments === undefined &&
          node.arguments.length === 1
        ) {
          if (handled.has(node)) {
            ts.forEachChild(node, visit);

            return;
          }

          const argument = node.arguments[0];

          if (ts.isObjectLiteralExpression(argument) && propertyOf(argument, 'key') !== undefined) {
            edits.push({
              start: node.expression.getEnd(),
              end: node.expression.getEnd(),
              text: '<unknown>',
            });
            rewritten += 1;
            unnamed.push(lineOf(node));
          }
        } else if (
          isMethod &&
          methodName === 'gets' &&
          first !== undefined &&
          ts.isObjectLiteralExpression(first)
        ) {
          const list = propertyOf(first, 'bindings')?.initializer;

          if (list !== undefined && ts.isArrayLiteralExpression(list)) {
            for (const element of list.elements) {
              if (isKeyOptions(element)) {
                rewriteKey(element, undefined);
              }
            }
          }
        } else if ((isInject || isMethod) && isKeyOptions(first)) {
          const typeArgument =
            isMethod && node.typeArguments?.length === 1 ? node.typeArguments[0] : undefined;
          const isKeyBuilt = (() => {
            const value = propertyOf(first, 'key')?.initializer;

            return value !== undefined && isBuilderCall(value) && value.typeArguments !== undefined;
          })();

          if (!isKeyBuilt) {
            const done = rewriteKey(first, typeArgument?.getText(file));

            // The type argument moved into `build<T>`; the call no longer needs it.
            if (done && typeArgument !== undefined) {
              const open = node.expression.getEnd();
              const close = source.indexOf('(', typeArgument.getEnd());

              edits.push({ start: open, end: close, text: '' });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    const collect = (node: import('typescript').Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        (ts.isStringLiteral(node.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
        (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0
      ) {
        if (constants.has(node.name.text)) {
          duplicates.add(node.name.text);
        }

        constants.set(node.name.text, node);
      }

      ts.forEachChild(node, collect);
    };

    collect(file);
    visit(file);

    if (edits.length === 0) {
      return { output: source, changed: false, rewritten, unnamed, manual };
    }

    const { module, declared, named } = BindingKeysCodemod.readIdentifierSource({
      typescript: ts,
      file,
      fallback: importFrom,
    });

    if (!declared && module === undefined) {
      return {
        output: source,
        changed: false,
        rewritten: 0,
        unnamed: [],
        manual: [
          ...manual,
          {
            line: 1,
            reason: `${rewritten} key(s) could be rewritten but the file imports nothing from @venizia/ignis to take BindingKeys from: pass --import-from <module>`,
          },
        ],
      };
    }

    if (!declared) {
      if (named !== undefined && named.elements.length > 0) {
        const last = named.elements[named.elements.length - 1];

        edits.push({ start: last.getEnd(), end: last.getEnd(), text: `, ${BUILDER}` });
      } else {
        const lastImport = [...file.statements]
          .reverse()
          .find((statement) => ts.isImportDeclaration(statement));
        const position = lastImport === undefined ? 0 : lastImport.getEnd();
        const text = `${lastImport === undefined ? '' : '\n'}import { ${BUILDER} } from '${module}';${lastImport === undefined ? '\n' : ''}`;

        edits.push({ start: position, end: position, text });
      }
    }

    let output = source;

    for (const edit of [...edits].sort(
      (left, right) => right.start - left.start || right.end - left.end,
    )) {
      output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
    }

    return { output, changed: output !== source, rewritten, unnamed, manual };
  }
}

/** `devz codemod binding-keys [paths...] [--write | --check]`: rewrites raw binding keys to `BindingKeys.build<T>`. */
export class BindingKeysCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (args.includes(BindingKeysFlags.HELP) || args.includes(BindingKeysFlags.HELP_SHORT)) {
      console.log(USAGE);

      return 0;
    }

    const flags: string[] = [];
    const paths: string[] = [];
    let importFrom: string | undefined;
    let hasImportFlag = false;

    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];

      if (argument === BindingKeysFlags.IMPORT_FROM) {
        hasImportFlag = true;
        importFrom = args[index + 1];
        index += 1;
      } else if (argument.startsWith('-')) {
        flags.push(argument);
      } else {
        paths.push(argument);
      }
    }

    const unknown = flags.filter((flag) => !BindingKeysFlags.isValid(flag));

    if (hasImportFlag && (importFrom === undefined || importFrom.startsWith('-'))) {
      console.error(`devz codemod: ${BindingKeysFlags.IMPORT_FROM} needs a module\n${USAGE}`);

      return USAGE_ERROR_CODE;
    }

    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(BindingKeysFlags.WRITE);
    const isCheck = flags.includes(BindingKeysFlags.CHECK);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${BindingKeysFlags.WRITE} and ${BindingKeysFlags.CHECK} contradict each other\n${USAGE}`,
      );

      return USAGE_ERROR_CODE;
    }

    const refusal = CodemodFiles.refusal({
      command: 'binding-keys',
      isWrite,
      isAll: flags.includes(BindingKeysFlags.ALL),
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
    let rewrittenCount = 0;
    let manualCount = 0;
    let unnamedCount = 0;
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

        if (!/\b(?:get|gets|getBinding|bind|isBound|unbind|inject|provide|build)\b/.test(source)) {
          continue;
        }

        const result = BindingKeysCodemod.rewrite({
          typescript,
          fileName: file,
          source,
          importFrom,
        });
        const shown = relative(root, file).split('\\').join('/') || file;

        for (const item of result.manual) {
          manualCount += 1;
          console.warn(`manual  ${shown}:${item.line}  ${item.reason}`);
        }

        for (const line of result.unnamed) {
          unnamedCount += 1;
          console.warn(
            `type  ${shown}:${line}  BindingKeys.build<unknown>: name the type of the value bound under this key`,
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
        rewrittenCount += result.rewritten;
        console.log(
          `${isWrite ? 'changed' : 'would change'}  ${shown}  (${result.rewritten} key(s))`,
        );

        if (isWrite) {
          writeFileSync(file, result.output);
        }
      }
    }

    console.log(
      `devz codemod binding-keys: ${changedCount} file(s) ${isWrite ? 'changed' : 'would change'}, ${rewrittenCount} key(s) ${isWrite ? 'rewritten' : 'would be rewritten'}, ${unnamedCount} to type, ${manualCount} manual` +
        (refusedCount > 0 ? `, ${refusedCount} refused` : ''),
    );

    if (!isWrite && changedCount > 0) {
      console.log(
        `Nothing was written. Run again with ${BindingKeysFlags.WRITE} to apply, then name each "type" site and run your typecheck.`,
      );
    }

    if (isWrite && refusedCount > 0) {
      return 1;
    }

    return isCheck && (changedCount > 0 || manualCount > 0) ? 1 : 0;
  }
}
