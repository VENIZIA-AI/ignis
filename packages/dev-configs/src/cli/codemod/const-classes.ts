import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type ts from 'typescript';
import { CodemodFiles } from './files';

type TTypeScript = typeof ts;

const DEFAULT_IMPORT_FROM = '@venizia/ignis-helpers/common';
const TEST_FILE_PATTERN = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?tsx?$/;
/** Utility types whose type argument is a set of keys, not an enumerable value. */
const KEY_SET_TYPES = new Set(['Pick', 'Omit', 'Extract', 'Exclude', 'Record']);
/** A file that can hold a string-literal union: a quote beside a `|`. */
const UNION_TEXT = /\|\s*['"]|['"]\s*\|/;
const RESERVED_KEYS = new Set(['SCHEME_SET']);

/** What the user may change for one declaration, from the mapping file. */
export interface IConstClassOverride {
  /** The class name. */
  class?: string;
  /** The type name; only a property of an interface or object type gets a new one. */
  type?: string;
  /** A member key per literal value: `{ "read-only": "READ_ONLY" }`. */
  members?: Record<string, string>;
  /** Leave this declaration alone. */
  skip?: boolean;
}

export type TConstClassMap = Record<string, IConstClassOverride>;

export interface IConstClassProposal {
  /** The key of the mapping file: `path/to/file.ts#TName` or `path/to/file.ts#IContainer.property`. */
  id: string;
  line: number;
  className: string;
  typeName: string;
  /** The literal values and the member key each one gets, in order. */
  members: Array<{ value: string; key: string }>;
  /** What the union also held: `null` or `undefined`. */
  nullish: string[];
}

export interface IConstClassUntouched {
  line: number;
  column: number;
  reason: string;
}

export interface IConstClassResult {
  output: string;
  changed: boolean;
  proposals: IConstClassProposal[];
  untouched: IConstClassUntouched[];
}

interface IEdit {
  start: number;
  end: number;
  text: string;
}

/** The plural of a PascalCase word, for the class that holds its values. */
const pluralize = (word: string): string => {
  const alreadyPlural = /[^uis]s$/.test(word) || /ings$/.test(word);
  if (alreadyPlural) {
    return word;
  }

  if (/(s|x|z|ch|sh)$/.test(word)) {
    return `${word}es`;
  }

  if (/[^aeiou]y$/.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }

  return `${word}s`;
};

/** `read-only`, `readOnly` and `string[]` become `READ_ONLY`, `READ_ONLY` and `STRING_ARRAY`; `undefined` when nothing is left. */
const toKey = (value: string): string | undefined => {
  const key = value
    .replace(/\[\]/g, '_ARRAY_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  if (key === '') {
    return undefined;
  }

  return /^[0-9]/.test(key) ? `_${key}` : key;
};

const pascal = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/**
 * Turns the string-literal unions of exported declarations into const classes: an exported type
 * alias, and a property of an exported interface or object type. The values stay the same, so every
 * existing literal still type-checks and no call site changes. A union it cannot name is reported.
 */
export class ConstClasses {
  static convert(opts: {
    typescript: TTypeScript;
    fileName: string;
    source: string;
    /** The id prefix of the mapping file: the path of the file relative to the project root. */
    relativePath?: string;
    overrides?: TConstClassMap;
    importFrom?: string;
  }): IConstClassResult {
    const { typescript, fileName, source, overrides = {}, importFrom = DEFAULT_IMPORT_FROM } = opts;
    const relativePath = opts.relativePath ?? fileName;
    const sourceFile = typescript.createSourceFile(
      fileName,
      source,
      typescript.ScriptTarget.Latest,
      true,
    );
    const taken = ConstClasses.declaredNames({ typescript, sourceFile });
    const proposals: IConstClassProposal[] = [];
    const untouched: IConstClassUntouched[] = [];
    const edits: IEdit[] = [];
    const insertions = new Map<number, string[]>();
    const handled = new Set<ts.Node>();

    const report = (node: ts.Node, reason: string) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      untouched.push({ line: line + 1, column: character + 1, reason });
    };

    const lineOf = (node: ts.Node) =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    /** Plans one conversion; `undefined` and a report when the names or the members do not work. */
    const plan = (planOpts: {
      node: ts.UnionTypeNode;
      id: string;
      className: string;
      typeName: string;
      anchor: ts.Node;
      mayRenameType: boolean;
    }): void => {
      const { node, id, anchor } = planOpts;
      const override = overrides[id] ?? {};
      const union = ConstClasses.readUnion({ typescript, node });

      if (override.skip) {
        handled.add(node);
        return;
      }

      const className = override.class ?? planOpts.className;
      const typeName = planOpts.mayRenameType
        ? (override.type ?? planOpts.typeName)
        : planOpts.typeName;
      const members = union.values.map((value) => ({
        value,
        key: override.members?.[value] ?? toKey(value) ?? '',
      }));

      const problem = ConstClasses.checkPlan({
        className,
        typeName,
        members,
        taken,
        mayRenameType: planOpts.mayRenameType,
      });
      if (problem) {
        report(node, `${problem}; left untouched (name it in the mapping file: ${id})`);
        handled.add(node);
        return;
      }

      taken.add(className);
      if (planOpts.mayRenameType) {
        taken.add(typeName);
      }

      handled.add(node);
      proposals.push({
        id,
        line: lineOf(node),
        className,
        typeName,
        members,
        nullish: union.nullish,
      });

      const classText = ConstClasses.renderClass({ className, typeName, members });
      const reference = `TConstValue<typeof ${className}>`;
      const nullishText = union.nullish.map((member) => ` | ${member}`).join('');

      if (planOpts.mayRenameType) {
        const aliasText = `export type ${typeName} = ${reference};\n\n`;
        const at = anchor.getStart(sourceFile, true);
        insertions.set(at, [...(insertions.get(at) ?? []), `${classText}\n\n${aliasText}`]);
        edits.push({
          start: node.getStart(sourceFile),
          end: node.end,
          text: `${typeName}${nullishText}`,
        });
        return;
      }

      const at = anchor.getStart(sourceFile, true);
      insertions.set(at, [...(insertions.get(at) ?? []), `${classText}\n\n`]);
      edits.push({
        start: node.getStart(sourceFile),
        end: node.end,
        text: `${reference}${nullishText}`,
      });
    };

    for (const statement of sourceFile.statements) {
      if (!ConstClasses.isExported({ typescript, node: statement })) {
        continue;
      }

      if (typescript.isTypeAliasDeclaration(statement)) {
        const union = typescript.isUnionTypeNode(statement.type) ? statement.type : undefined;
        if (union && ConstClasses.isEnumerable({ typescript, node: union })) {
          const base = statement.name.text.replace(/^T(?=[A-Z])/, '');
          plan({
            node: union,
            id: `${relativePath}#${statement.name.text}`,
            className: pluralize(base),
            typeName: statement.name.text,
            anchor: statement,
            mayRenameType: false,
          });
          continue;
        }

        if (typescript.isTypeLiteralNode(statement.type)) {
          ConstClasses.planMembers({
            typescript,
            container: statement,
            members: statement.type.members,
            relativePath,
            plan,
          });
        }
      }

      if (typescript.isInterfaceDeclaration(statement)) {
        ConstClasses.planMembers({
          typescript,
          container: statement,
          members: statement.members,
          relativePath,
          plan,
        });
      }

      ConstClasses.findStrays({ typescript, statement, handled, report });
    }

    if (proposals.length === 0) {
      return { output: source, changed: false, proposals, untouched };
    }

    for (const [at, texts] of insertions) {
      edits.push({ start: at, end: at, text: texts.join('') });
    }

    // Last, so that at the top of a file the import lands above the class inserted at the same place.
    const importEdit = ConstClasses.planImport({ typescript, sourceFile, importFrom });
    if (importEdit) {
      edits.push(importEdit);
    }

    let output = source;
    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
      output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    return { output, changed: output !== source, proposals, untouched };
  }

  private static planMembers(opts: {
    typescript: TTypeScript;
    container: ts.InterfaceDeclaration | ts.TypeAliasDeclaration;
    members: ts.NodeArray<ts.TypeElement>;
    relativePath: string;
    plan: (planOpts: {
      node: ts.UnionTypeNode;
      id: string;
      className: string;
      typeName: string;
      anchor: ts.Node;
      mayRenameType: boolean;
    }) => void;
  }): void {
    const { typescript, container, members, relativePath, plan } = opts;
    const containerName = container.name.text;
    const base = containerName.replace(/^[IT](?=[A-Z])/, '');

    for (const member of members) {
      if (!typescript.isPropertySignature(member) || !member.type) {
        continue;
      }

      if (
        !typescript.isUnionTypeNode(member.type) ||
        !ConstClasses.isEnumerable({ typescript, node: member.type })
      ) {
        continue;
      }

      const property = typescript.isIdentifier(member.name) ? member.name.text : undefined;
      if (!property) {
        continue;
      }

      plan({
        node: member.type,
        id: `${relativePath}#${containerName}.${property}`,
        className: pluralize(`${base}${pascal(property)}`),
        typeName: `T${base}${pascal(property)}`,
        anchor: container,
        mayRenameType: true,
      });
    }
  }

  /** Every top-level name the file declares or imports. */
  private static declaredNames(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
  }): Set<string> {
    const { typescript, sourceFile } = opts;
    const names = new Set<string>();

    for (const statement of sourceFile.statements) {
      if (typescript.isImportDeclaration(statement) && statement.importClause) {
        const { name, namedBindings } = statement.importClause;
        if (name) {
          names.add(name.text);
        }

        if (namedBindings && typescript.isNamespaceImport(namedBindings)) {
          names.add(namedBindings.name.text);
        }

        if (namedBindings && typescript.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            names.add(element.name.text);
          }
        }
        continue;
      }

      if (typescript.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (typescript.isIdentifier(declaration.name)) {
            names.add(declaration.name.text);
          }
        }
        continue;
      }

      if (
        (typescript.isClassDeclaration(statement) ||
          typescript.isFunctionDeclaration(statement) ||
          typescript.isInterfaceDeclaration(statement) ||
          typescript.isTypeAliasDeclaration(statement) ||
          typescript.isEnumDeclaration(statement) ||
          typescript.isModuleDeclaration(statement)) &&
        statement.name &&
        typescript.isIdentifier(statement.name)
      ) {
        names.add(statement.name.text);
      }
    }

    return names;
  }

  private static isExported(opts: { typescript: TTypeScript; node: ts.Node }): boolean {
    const { typescript, node } = opts;
    const modifiers = typescript.canHaveModifiers(node) ? typescript.getModifiers(node) : undefined;
    return (
      modifiers?.some((modifier) => modifier.kind === typescript.SyntaxKind.ExportKeyword) === true
    );
  }

  /** The string values of a union, and its `null` or `undefined` members; the union must be string literals (and nullish) only. */
  private static readUnion(opts: { typescript: TTypeScript; node: ts.UnionTypeNode }): {
    values: string[];
    nullish: string[];
  } {
    const { typescript, node } = opts;
    const values: string[] = [];
    const nullish: string[] = [];

    for (const member of node.types) {
      if (typescript.isLiteralTypeNode(member) && typescript.isStringLiteral(member.literal)) {
        if (!values.includes(member.literal.text)) {
          values.push(member.literal.text);
        }
        continue;
      }

      if (member.kind === typescript.SyntaxKind.NullKeyword) {
        nullish.push('null');
      } else if (member.kind === typescript.SyntaxKind.UndefinedKeyword) {
        nullish.push('undefined');
      } else if (
        typescript.isLiteralTypeNode(member) &&
        member.literal.kind === typescript.SyntaxKind.NullKeyword
      ) {
        nullish.push('null');
      }
    }

    return { values, nullish };
  }

  /** At least two string literals, and nothing else but `null` or `undefined`. */
  private static isEnumerable(opts: { typescript: TTypeScript; node: ts.UnionTypeNode }): boolean {
    const { typescript, node } = opts;
    let literals = 0;

    for (const member of node.types) {
      if (typescript.isLiteralTypeNode(member) && typescript.isStringLiteral(member.literal)) {
        literals += 1;
        continue;
      }

      const isNullish =
        member.kind === typescript.SyntaxKind.UndefinedKeyword ||
        member.kind === typescript.SyntaxKind.NullKeyword ||
        (typescript.isLiteralTypeNode(member) &&
          member.literal.kind === typescript.SyntaxKind.NullKeyword);
      if (!isNullish) {
        return false;
      }
    }

    return literals >= 2;
  }

  private static checkPlan(opts: {
    className: string;
    typeName: string;
    members: Array<{ value: string; key: string }>;
    taken: Set<string>;
    mayRenameType: boolean;
  }): string | undefined {
    const { className, typeName, members, taken, mayRenameType } = opts;

    if (taken.has(className)) {
      return `the name ${className} is already used in this file`;
    }

    if (mayRenameType && taken.has(typeName)) {
      return `the name ${typeName} is already used in this file`;
    }

    const keys = new Set<string>();
    for (const { value, key } of members) {
      if (key === '') {
        return `no member name can be made from ${JSON.stringify(value)}`;
      }

      if (RESERVED_KEYS.has(key)) {
        return `${JSON.stringify(value)} would become the reserved member ${key}`;
      }

      if (keys.has(key)) {
        return `two values give the member ${key}`;
      }

      keys.add(key);
    }

    return undefined;
  }

  private static renderClass(opts: {
    className: string;
    typeName: string;
    members: Array<{ value: string; key: string }>;
  }): string {
    const { className, typeName, members } = opts;
    const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const lines = [
      `/** The values of \`${typeName}\`. */`,
      `export class ${className} {`,
      ...members.map(({ value, key }) => `  static readonly ${key} = ${quote(value)};`),
      '',
      `  static readonly SCHEME_SET = new Set<string>([${members.map(({ key }) => `this.${key}`).join(', ')}]);`,
      '',
      `  static isValid(value: string): value is ${typeName} {`,
      '    return this.SCHEME_SET.has(value);',
      '  }',
      '}',
    ];

    return lines.join('\n');
  }

  /** Reports every string-literal union of an exported declaration the codemod did not handle: it cannot name those. */
  private static findStrays(opts: {
    typescript: TTypeScript;
    statement: ts.Statement;
    handled: Set<ts.Node>;
    report: (node: ts.Node, reason: string) => void;
  }): void {
    const { typescript, statement, handled, report } = opts;

    const walk = (node: ts.Node): void => {
      if (typescript.isVariableDeclaration(node) && node.type) {
        // The annotation of an exported constant is not what the lint rule asks to name.
        if (node.initializer) {
          walk(node.initializer);
        }
        return;
      }

      if (typescript.isUnionTypeNode(node) && ConstClasses.isEnumerable({ typescript, node })) {
        if (!handled.has(node) && !ConstClasses.isKeySet({ typescript, node })) {
          report(
            node,
            'a string-literal union in this position (a parameter, a return type, a generic or a nested type) has no name to give it; write the const class by hand',
          );
        }

        return;
      }

      typescript.forEachChild(node, walk);
    };

    walk(statement);
  }

  private static isKeySet(opts: { typescript: TTypeScript; node: ts.Node }): boolean {
    const { typescript, node } = opts;
    const parent = node.parent;

    if (typescript.isMappedTypeNode(parent) || typescript.isTypeOperatorNode(parent)) {
      return true;
    }

    if (
      typescript.isTypeParameterDeclaration(parent) &&
      typescript.isMappedTypeNode(parent.parent)
    ) {
      return true;
    }

    if (
      parent &&
      typescript.isTypeReferenceNode(parent) &&
      typescript.isIdentifier(parent.typeName) &&
      KEY_SET_TYPES.has(parent.typeName.text)
    ) {
      return true;
    }

    return false;
  }

  /** The edit that makes `TConstValue` available: nothing when the file has it, a specifier on an import from the same module, else a new import line. */
  private static planImport(opts: {
    typescript: TTypeScript;
    sourceFile: ts.SourceFile;
    importFrom: string;
  }): IEdit | undefined {
    const { typescript, sourceFile, importFrom } = opts;
    let lastImportEnd = 0;
    let sameModule: ts.ImportDeclaration | undefined;

    for (const statement of sourceFile.statements) {
      if (!typescript.isImportDeclaration(statement)) {
        continue;
      }

      lastImportEnd = statement.end;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && typescript.isNamedImports(bindings)) {
        if (bindings.elements.some((element) => element.name.text === 'TConstValue')) {
          return undefined;
        }

        if (
          typescript.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === importFrom
        ) {
          sameModule = statement;
        }
      }
    }

    const bindings = sameModule?.importClause?.namedBindings;
    if (
      sameModule &&
      bindings &&
      typescript.isNamedImports(bindings) &&
      bindings.elements.length > 0
    ) {
      const last = bindings.elements[bindings.elements.length - 1];
      const typeOnly = sameModule.importClause?.isTypeOnly === true;
      return {
        start: last?.end ?? bindings.end,
        end: last?.end ?? bindings.end,
        text: typeOnly ? ', TConstValue' : ', type TConstValue',
      };
    }

    const line = `import type { TConstValue } from '${importFrom}';`;
    if (lastImportEnd > 0) {
      return { start: lastImportEnd, end: lastImportEnd, text: `\n${line}` };
    }

    return { start: 0, end: 0, text: `${line}\n\n` };
  }
}

const USAGE = `Usage: devz codemod const-classes [paths...] [--write | --check] [--map <file>] [--emit-map <file>] [--import-from <module>] [--include-tests]

Turns a string-literal union in an exported declaration into a const class (SCHEME_SET, isValid) plus
\`TConstValue<typeof X>\`, the shape the venizia/const-class-values lint rule asks for. It handles an
exported type alias and a property of an exported interface or object type. The values stay the same,
so every existing literal still type-checks and no call site changes.

It has to choose names: the class is the type name without its leading T, in the plural; a member is
the value in upper snake case. The dry run prints every proposal.

  --write              write the changed files (without it, nothing is written)
  --check              dry run that exits 1 while a union can be converted or is left untouched (for CI)
  --map <file>         a JSON file of overrides, keyed by the id the dry run prints
  --emit-map <file>    write the proposals as a mapping file to edit, then pass it with --map
  --import-from <m>    where TConstValue is imported from (default ${DEFAULT_IMPORT_FROM})
  --include-tests      also convert test files (skipped by default)
  --help               print this text and exit

A mapping entry: { "src/a.ts#TMode": { "class": "Modes", "members": { "read-only": "READ_ONLY" } } },
or { "skip": true }. A union in a parameter, a return type, a generic or a nested type is reported as
left untouched: it has no name, so write that class by hand. Key sets (Pick, Omit, Extract, Exclude,
Record, mapped types) are not enumerable values and are never touched.`;

/** A usage error: nothing was read or written. */
const USAGE_ERROR_CODE = 2;

class ConstClassFlags {
  static readonly WRITE = '--write';
  static readonly CHECK = '--check';
  static readonly MAP = '--map';
  static readonly EMIT_MAP = '--emit-map';
  static readonly IMPORT_FROM = '--import-from';
  static readonly INCLUDE_TESTS = '--include-tests';
  static readonly HELP = '--help';
  static readonly HELP_SHORT = '-h';

  static readonly SCHEME_SET = new Set<string>([
    this.WRITE,
    this.CHECK,
    this.MAP,
    this.EMIT_MAP,
    this.IMPORT_FROM,
    this.INCLUDE_TESTS,
    this.HELP,
    this.HELP_SHORT,
  ]);

  /** The flags that take a value. */
  static readonly WITH_VALUE = new Set<string>([this.MAP, this.EMIT_MAP, this.IMPORT_FROM]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** `devz codemod const-classes [paths...] [--write | --check]`. */
export class ConstClassesCommand {
  static readonly USAGE = USAGE;

  static async run(opts: { root: string; args: string[] }): Promise<number> {
    const { root, args } = opts;

    if (args.includes(ConstClassFlags.HELP) || args.includes(ConstClassFlags.HELP_SHORT)) {
      console.log(USAGE);
      return 0;
    }

    const flags: string[] = [];
    const paths: string[] = [];
    const values = new Map<string, string>();

    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index] ?? '';
      const [name, inline] = argument.startsWith('--') ? argument.split(/=(.*)/s) : [argument];

      if (name !== undefined && ConstClassFlags.WITH_VALUE.has(name)) {
        const value = inline ?? args[index + 1];
        if (inline === undefined) {
          index += 1;
        }

        if (!value || value.startsWith('-')) {
          console.error(`devz codemod: ${name} needs a value\n${USAGE}`);
          return USAGE_ERROR_CODE;
        }

        values.set(name, value);
        continue;
      }

      if (argument.startsWith('-')) {
        flags.push(argument);
      } else {
        paths.push(argument);
      }
    }

    const unknown = flags.filter((flag) => !ConstClassFlags.isValid(flag));
    if (unknown.length > 0) {
      console.error(
        `devz codemod: unknown option ${unknown.map((flag) => `"${flag}"`).join(', ')}\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    const isWrite = flags.includes(ConstClassFlags.WRITE);
    const isCheck = flags.includes(ConstClassFlags.CHECK);
    const includeTests = flags.includes(ConstClassFlags.INCLUDE_TESTS);

    if (isWrite && isCheck) {
      console.error(
        `devz codemod: ${ConstClassFlags.WRITE} and ${ConstClassFlags.CHECK} contradict each other\n${USAGE}`,
      );
      return USAGE_ERROR_CODE;
    }

    let overrides: TConstClassMap = {};
    const mapPath = values.get(ConstClassFlags.MAP);
    if (mapPath) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(resolve(root, mapPath), 'utf8'));
      } catch (error) {
        console.error(
          `devz codemod: cannot read the mapping file ${mapPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return USAGE_ERROR_CODE;
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.error(
          `devz codemod: cannot read the mapping file ${mapPath}: the file must hold one JSON object`,
        );
        return USAGE_ERROR_CODE;
      }

      overrides = Object.fromEntries(Object.entries(parsed));
    }

    let typescript: TTypeScript;
    try {
      typescript = (await import('typescript')).default;
    } catch {
      console.error('devz codemod: the "typescript" package is required to read your sources');
      return 1;
    }

    const targets = (paths.length > 0 ? paths : ['.']).map((path) => resolve(root, path));
    const importFrom = values.get(ConstClassFlags.IMPORT_FROM);
    const emitted: TConstClassMap = {};
    let changedFiles = 0;
    let converted = 0;
    let untouchedCount = 0;

    for (const target of targets) {
      const files = CodemodFiles.collect({ target });

      if (files.length === 0 && paths.length > 0) {
        console.warn(
          `devz codemod: no source files under "${relative(root, target) || target}" (git ignores the path, or it holds none): nothing was read`,
        );
      }

      for (const file of files) {
        const relativePath = relative(root, file).split('\\').join('/');
        if (!includeTests && TEST_FILE_PATTERN.test(relativePath)) {
          continue;
        }

        const source = readFileSync(file, 'utf8');
        if (!UNION_TEXT.test(source)) {
          continue;
        }

        const result = ConstClasses.convert({
          typescript,
          fileName: file,
          source,
          relativePath,
          overrides,
          importFrom,
        });

        for (const item of result.untouched) {
          untouchedCount += 1;
          console.warn(`${relativePath}:${item.line}:${item.column}  ${item.reason}`);
        }

        for (const proposal of result.proposals) {
          converted += 1;
          emitted[proposal.id] = {
            class: proposal.className,
            ...(proposal.id.split('#')[1]?.includes('.') ? { type: proposal.typeName } : {}),
            members: Object.fromEntries(proposal.members.map(({ value, key }) => [value, key])),
          };
          console.log(
            `${isWrite ? 'converted' : 'would convert'}  ${relativePath}:${proposal.line}  ${proposal.typeName} -> class ${proposal.className} { ${proposal.members.map(({ key, value }) => `${key} = '${value}'`).join(', ')} }` +
              `  [${proposal.id}]`,
          );
        }

        if (result.changed) {
          changedFiles += 1;
          if (isWrite) {
            writeFileSync(file, result.output);
          }
        }
      }
    }

    const emitPath = values.get(ConstClassFlags.EMIT_MAP);
    if (emitPath) {
      writeFileSync(resolve(root, emitPath), `${JSON.stringify(emitted, null, 2)}\n`);
      console.log(
        `Wrote ${Object.keys(emitted).length} proposal(s) to ${emitPath}; edit it, then pass --map ${emitPath}.`,
      );
    }

    console.log(
      `devz codemod const-classes: ${converted} union(s) ${isWrite ? 'converted' : 'would be converted'} in ${changedFiles} file(s), ${untouchedCount} left untouched`,
    );

    if (!isWrite && changedFiles > 0) {
      console.log(
        `Nothing was written. Run again with ${ConstClassFlags.WRITE} to apply (add --map to rename), then run your typecheck and lint.`,
      );
    }

    return isCheck && (converted > 0 || untouchedCount > 0) ? 1 : 0;
  }
}
