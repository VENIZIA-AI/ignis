/**
 * Usage: bun scripts/checks/await-hoist-audit.ts <repository root> [more roots...] [--json]
 *
 * Finds the damage a name collision in the `await` hoisting fixers (`venizia/no-inline-await`,
 * `venizia/no-return-await`) can leave: a hoisted `const X = await f();` that shadows or repeats a
 * name of its own function, is never read, or whose next statement reads another hoist's name
 * instead of its own. Reads the TypeScript files git tracks in each root; exits 1 on any finding or
 * on a file it could not parse, 0 when clean, 2 on a usage error.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Linter, type Rule, type Scope } from 'eslint';
import tseslint from 'typescript-eslint';

export class AwaitHoistReasons {
  /** The name shadows one of its own function and the inner scope reads it beyond the hoist site. */
  static readonly SHADOW = 'shadow';
  /** The name is declared twice in one scope, or by two nested `await` hoists of one function. */
  static readonly DUPLICATE = 'duplicate';
  /** The hoisted name is never read. */
  static readonly UNUSED = 'unused';
  /** A fixer name read by its next statement once and again elsewhere, beside its pair: worth a look. */
  static readonly MULTI_USE = 'multi-use';
  /** The next statement reads not its own name but another hoist's: one declared later, or its fixer pair. */
  static readonly SWAP = 'swap';

  static readonly SCHEME_SET = new Set<string>([
    this.SHADOW,
    this.DUPLICATE,
    this.UNUSED,
    this.MULTI_USE,
    this.SWAP,
  ]);

  static isValid(value: string): value is TAwaitHoistReason {
    return this.SCHEME_SET.has(value);
  }
}

export type TAwaitHoistReason = Extract<
  (typeof AwaitHoistReasons)[keyof typeof AwaitHoistReasons],
  string
>;

export class AwaitHoistSeverities {
  static readonly ERROR = 'error';
  /** A pattern legitimate code also has: read the site before changing anything. */
  static readonly REVIEW = 'review';

  static readonly SCHEME_SET = new Set<string>([this.ERROR, this.REVIEW]);

  static isValid(value: string): value is TAwaitHoistSeverity {
    return this.SCHEME_SET.has(value);
  }
}

export type TAwaitHoistSeverity = Extract<
  (typeof AwaitHoistSeverities)[keyof typeof AwaitHoistSeverities],
  string
>;

export interface IAwaitHoistFinding {
  file: string;
  line: number;
  column: number;
  name: string;
  reason: TAwaitHoistReason;
  /** `review` for multi-use, an earlier-name swap and a shadow across functions; `error` otherwise. */
  severity: TAwaitHoistSeverity;
  /** The function that holds the declaration: `Class.method`, `name`, `<anonymous>` or `<module>`. */
  functionName: string;
  detail: string;
  /** The declaration line and the two after it. */
  context: string[];
}

export interface IAwaitHoistFailure {
  file: string;
  message: string;
}

export interface IAwaitHoistRepositoryReport {
  root: string;
  fileCount: number;
  /** The `const|let X = await ...` declarators examined: a zero here means the checks saw nothing. */
  hoistCount: number;
  findings: IAwaitHoistFinding[];
  failures: IAwaitHoistFailure[];
}

/** A node as the audit reads it; every other field is reached through `AwaitHoistAudit.fieldOf`. */
interface IAuditNode {
  type: string;
  range: [number, number];
  loc: { start: { line: number; column: number } };
  [key: string]: unknown;
}

/** One `const|let X = await ...;` single-declarator statement. */
interface IHoistCandidate {
  name: string;
  variable: Scope.Variable;
  scope: Scope.Scope;
  functionScope: Scope.Scope;
  declarator: IAuditNode;
  declaration: IAuditNode;
  /** The statement right after the declaration in its statement list. */
  next?: IAuditNode;
  reads: Scope.Reference[];
}

const SKIPPED_SEGMENTS = new Set(['node_modules', 'dist', 'generated', 'fixtures', '__fixtures__']);
const SOURCE_EXTENSION = /\.(ts|tsx|mts|cts)$/;
const DECLARATION_FILE = /\.d\.(ts|mts|cts)$/;
const AWAIT_TEXT = /\bawait\b/;
/** A name the hoisting fixers could have chosen, or a person renaming one would. */
const HOIST_LIKE_NAME = /^[a-z][A-Za-z0-9]*$/;
/** The names the fixers allocate (`result`, `result2`, ...) and the usual renames of them. */
const HOIST_FAMILY_NAME = /^(result|response|value|data)\d*$/;
const STATEMENT_LIST_FIELDS: Record<string, string> = {
  Program: 'body',
  BlockStatement: 'body',
  StaticBlock: 'body',
  SwitchCase: 'consequent',
};

export class AwaitHoistAudit {
  static isAuditNode(value: unknown): value is IAuditNode {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof value.type === 'string' &&
      'range' in value &&
      Array.isArray(value.range) &&
      'loc' in value
    );
  }

  static fieldOf(opts: { node: unknown; key: string }): unknown {
    const { node, key } = opts;
    return typeof node === 'object' && node !== null && key in node
      ? Reflect.get(node, key)
      : undefined;
  }

  static nodeAt(opts: { node: unknown; key: string }): IAuditNode | undefined {
    const value = AwaitHoistAudit.fieldOf(opts);
    return AwaitHoistAudit.isAuditNode(value) ? value : undefined;
  }

  /** Two different names of one fixer family with one base: `result` and `result2`, `data2` and `data3`. */
  static isFixerPair(opts: { left: string; right: string }): boolean {
    const left = HOIST_FAMILY_NAME.exec(opts.left);
    const right = HOIST_FAMILY_NAME.exec(opts.right);
    return opts.left !== opts.right && left !== null && right !== null && left[1] === right[1];
  }

  static isWithin(opts: { position: number; node: IAuditNode }): boolean {
    return opts.position >= opts.node.range[0] && opts.position < opts.node.range[1];
  }

  /** `inner` is `outer` or sits below it in the scope tree. */
  static isScopeWithin(opts: { inner: Scope.Scope; outer: Scope.Scope }): boolean {
    for (let scope: Scope.Scope | null = opts.inner; scope; scope = scope.upper) {
      if (scope === opts.outer) {
        return true;
      }
    }
    return false;
  }

  static positionOf(opts: { reference: Scope.Reference }): number {
    return opts.reference.identifier.range?.[0] ?? -1;
  }

  /** The statement after `declaration` in the statement list that holds it, if any. */
  static nextStatementOf(opts: { declaration: IAuditNode }): IAuditNode | undefined {
    const parent = AwaitHoistAudit.nodeAt({ node: opts.declaration, key: 'parent' });
    const field = parent ? STATEMENT_LIST_FIELDS[parent.type] : undefined;
    const list = field ? AwaitHoistAudit.fieldOf({ node: parent, key: field }) : undefined;
    if (!Array.isArray(list)) {
      return undefined;
    }
    const index = list.indexOf(opts.declaration);
    const next: unknown = index >= 0 ? list[index + 1] : undefined;
    return AwaitHoistAudit.isAuditNode(next) ? next : undefined;
  }

  static isExported(opts: { declaration: IAuditNode }): boolean {
    const parent = AwaitHoistAudit.nodeAt({ node: opts.declaration, key: 'parent' });
    return parent?.type === 'ExportNamedDeclaration';
  }

  /** `Class.method`, the function or variable name, `<anonymous>`, or `<module>` for top-level code. */
  static functionNameOf(opts: { scope: Scope.Scope }): string {
    const block: unknown = opts.scope.block;
    if (!AwaitHoistAudit.isAuditNode(block) || block.type === 'Program') {
      return '<module>';
    }
    const nameOf = (node: unknown): string | undefined => {
      const value = AwaitHoistAudit.fieldOf({ node, key: 'name' });
      return typeof value === 'string' ? value : undefined;
    };
    const ownName = nameOf(AwaitHoistAudit.fieldOf({ node: block, key: 'id' }));
    if (ownName) {
      return ownName;
    }
    const parent = AwaitHoistAudit.nodeAt({ node: block, key: 'parent' });
    const keyName = nameOf(AwaitHoistAudit.fieldOf({ node: parent, key: 'key' }));
    if (
      parent &&
      keyName &&
      ['MethodDefinition', 'PropertyDefinition', 'Property'].includes(parent.type)
    ) {
      const classNode = AwaitHoistAudit.nodeAt({
        node: AwaitHoistAudit.nodeAt({ node: parent, key: 'parent' }),
        key: 'parent',
      });
      const className = nameOf(AwaitHoistAudit.fieldOf({ node: classNode, key: 'id' }));
      return className ? `${className}.${keyName}` : keyName;
    }
    const variableName = nameOf(AwaitHoistAudit.fieldOf({ node: parent, key: 'id' }));
    return variableName ?? '<anonymous>';
  }

  /** The `const|let X = await ...;` declarations of a parsed file, one per hoist-shaped declarator. */
  static collectCandidates(opts: { scopeManager: Scope.ScopeManager }): IHoistCandidate[] {
    const candidates: IHoistCandidate[] = [];

    for (const scope of opts.scopeManager.scopes) {
      for (const variable of scope.variables) {
        for (const definition of variable.defs) {
          if (definition.type !== 'Variable') {
            continue;
          }
          const declarator: unknown = definition.node;
          const declaration: unknown = definition.parent;
          if (
            !AwaitHoistAudit.isAuditNode(declarator) ||
            !AwaitHoistAudit.isAuditNode(declaration)
          ) {
            continue;
          }
          const kind = AwaitHoistAudit.fieldOf({ node: declaration, key: 'kind' });
          const declarators = AwaitHoistAudit.fieldOf({ node: declaration, key: 'declarations' });
          const identifier = AwaitHoistAudit.nodeAt({ node: declarator, key: 'id' });
          const init = AwaitHoistAudit.nodeAt({ node: declarator, key: 'init' });
          if (
            (kind !== 'const' && kind !== 'let') ||
            !Array.isArray(declarators) ||
            declarators.length !== 1 ||
            identifier?.type !== 'Identifier' ||
            init?.type !== 'AwaitExpression'
          ) {
            continue;
          }
          candidates.push({
            name: variable.name,
            variable,
            scope,
            functionScope: scope.variableScope,
            declarator,
            declaration,
            next: AwaitHoistAudit.nextStatementOf({ declaration }),
            reads: variable.references.filter((reference) => reference.isRead()),
          });
        }
      }
    }

    return candidates;
  }

  /**
   * The nearest variable named `name` declared in a scope enclosing `scope`, and whether it belongs to the
   * same function (its own scopes and parameters) or to a function around it.
   */
  static findEnclosing(opts: {
    scope: Scope.Scope;
    name: string;
    functionScope: Scope.Scope;
  }): { variable: Scope.Variable; isSameFunction: boolean } | undefined {
    let isSameFunction = opts.scope !== opts.functionScope;
    for (let scope = opts.scope.upper; scope; scope = scope.upper) {
      const variable = scope.set.get(opts.name);
      if (variable && variable.defs.length > 0) {
        return { variable, isSameFunction };
      }
      if (scope === opts.functionScope) {
        isSameFunction = false;
      }
    }
    return undefined;
  }

  static lineOf(opts: { variable: Scope.Variable }): number | undefined {
    return opts.variable.defs[0]?.name.loc?.start.line;
  }

  /** Every finding of one file. `filePath` only names the file and picks the JSX mode. */
  static auditSource(opts: { code: string; filePath: string }): {
    findings: IAwaitHoistFinding[];
    /** How many `const|let X = await ...` declarators the file holds: what the checks looked at. */
    hoistCount: number;
    failure?: IAwaitHoistFailure;
  } {
    const { code, filePath } = opts;
    const findings: IAwaitHoistFinding[] = [];
    let hoistCount = 0;
    if (!AWAIT_TEXT.test(code)) {
      return { findings, hoistCount };
    }
    const lines = code.split('\n');

    const rule: Rule.RuleModule = {
      meta: { type: 'problem', schema: [] },
      create: (context) => ({
        'Program:exit': () => {
          const result = AwaitHoistAudit.analyze({
            scopeManager: context.sourceCode.scopeManager,
            filePath,
            lines,
          });
          findings.push(...result.findings);
          hoistCount = result.hoistCount;
        },
      }),
    };
    const config: Linter.Config[] = [
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: filePath.endsWith('.tsx') } },
        },
        linterOptions: { reportUnusedDisableDirectives: 'off', noInlineConfig: true },
        plugins: { audit: { rules: { hoist: rule } } },
        rules: { 'audit/hoist': 'error' },
      },
    ];

    const messages = new Linter().verify(code, config, { filename: filePath });
    const fatal = messages.find((message) => message.fatal);
    if (fatal) {
      return {
        findings,
        hoistCount,
        failure: { file: filePath, message: `${fatal.line}:${fatal.column} ${fatal.message}` },
      };
    }
    return { findings, hoistCount };
  }

  static analyze(opts: { scopeManager: Scope.ScopeManager; filePath: string; lines: string[] }): {
    findings: IAwaitHoistFinding[];
    hoistCount: number;
  } {
    const { scopeManager, filePath, lines } = opts;
    const candidates = AwaitHoistAudit.collectCandidates({ scopeManager });
    const findings: IAwaitHoistFinding[] = [];
    const byFunction = new Map<Scope.Scope, IHoistCandidate[]>();
    for (const candidate of candidates) {
      const list = byFunction.get(candidate.functionScope) ?? [];
      list.push(candidate);
      byFunction.set(candidate.functionScope, list);
    }
    const allReferences = scopeManager.scopes
      .flatMap((scope) => scope.references)
      .sort(
        (left, right) =>
          AwaitHoistAudit.positionOf({ reference: left }) -
          AwaitHoistAudit.positionOf({ reference: right }),
      );
    const referencesIn = (node: IAuditNode) =>
      allReferences.filter((reference) =>
        AwaitHoistAudit.isWithin({ position: AwaitHoistAudit.positionOf({ reference }), node }),
      );

    const report = (entry: {
      candidate: IHoistCandidate;
      reason: TAwaitHoistReason;
      detail: string;
      severity?: TAwaitHoistSeverity;
    }) => {
      const { line, column } = entry.candidate.declarator.loc.start;
      findings.push({
        file: filePath,
        line,
        column: column + 1,
        name: entry.candidate.name,
        reason: entry.reason,
        severity:
          entry.severity ??
          (entry.reason === AwaitHoistReasons.MULTI_USE
            ? AwaitHoistSeverities.REVIEW
            : AwaitHoistSeverities.ERROR),
        functionName: AwaitHoistAudit.functionNameOf({ scope: entry.candidate.functionScope }),
        detail: entry.detail,
        context: lines.slice(line - 1, line + 2),
      });
    };

    for (const [, group] of byFunction) {
      // `result` and `result2` in one function: the two names one fixer pass allocates
      const hasFixerPair = (opts: { name: string }) =>
        group.some((other) => AwaitHoistAudit.isFixerPair({ left: opts.name, right: other.name }));

      for (const candidate of group) {
        const { name, variable, scope, functionScope, declarator, next, reads } = candidate;
        const declaredAt = declarator.range[0];
        const nextReads = next
          ? reads.filter((reference) =>
              AwaitHoistAudit.isWithin({
                position: AwaitHoistAudit.positionOf({ reference }),
                node: next,
              }),
            )
          : [];

        // (2) the same scope declares the name twice: a parse the compiler refuses, kept by the scope manager
        if (variable.defs.length > 1) {
          report({
            candidate,
            reason: AwaitHoistReasons.DUPLICATE,
            detail: `\`${name}\` is declared ${variable.defs.length} times in one scope`,
          });
        }

        // An enclosing name declared after this one was in its TDZ here, so no read in this scope can have meant it.
        const enclosing = AwaitHoistAudit.findEnclosing({ scope, name, functionScope });
        const outer =
          enclosing && (enclosing.variable.defs[0]?.name.range?.[0] ?? Infinity) < declaredAt
            ? enclosing.variable
            : undefined;
        if (enclosing && outer) {
          const outerLine = AwaitHoistAudit.lineOf({ variable: outer });
          const before = reads.filter(
            (reference) => AwaitHoistAudit.positionOf({ reference }) < declaredAt,
          );
          const isOnlyHoistSite = reads.length === 1 && nextReads.length === 1;

          // (1) a read beyond the one site the hoist replaced most likely meant the outer name; across a
          // function boundary the same shape is also a plain callback that reuses a name, so it is a review
          if (before.length > 0 || !isOnlyHoistSite) {
            const parts = [
              `shadows \`${name}\` of line ${outerLine ?? '?'} ${enclosing.isSameFunction ? 'in the same function' : 'of an enclosing function'}`,
            ];
            if (before.length > 0) {
              parts.push(`${before.length} read(s) before this declaration (TDZ)`);
            }
            parts.push(
              `${reads.length} read(s) of the inner name, ${nextReads.length} in the next statement`,
            );
            report({
              candidate,
              reason: AwaitHoistReasons.SHADOW,
              detail: parts.join('; '),
              severity:
                enclosing.isSameFunction || before.length > 0
                  ? AwaitHoistSeverities.ERROR
                  : AwaitHoistSeverities.REVIEW,
            });
          }

          // (2) two nested await hoists of one function under one name
          const outerHoist = group.find((other) => other.variable === outer);
          if (enclosing.isSameFunction && outerHoist && HOIST_LIKE_NAME.test(name)) {
            report({
              candidate,
              reason: AwaitHoistReasons.DUPLICATE,
              detail: `the enclosing \`${name}\` of line ${outerLine ?? '?'} is an \`await\` hoist too`,
            });
          }
        }

        // (3) an exported or `_`-prefixed name is read elsewhere or unused on purpose
        if (
          reads.length === 0 &&
          !name.startsWith('_') &&
          !AwaitHoistAudit.isExported({ declaration: candidate.declaration })
        ) {
          report({
            candidate,
            reason: AwaitHoistReasons.UNUSED,
            detail: `\`${name}\` is never read`,
          });
        }

        // (4) conservative: only a fixer name, only in a function that also holds its pair
        if (hasFixerPair({ name }) && reads.length > 1 && nextReads.length === 1) {
          const elsewhere = reads.filter((reference) => !nextReads.includes(reference));
          report({
            candidate,
            reason: AwaitHoistReasons.MULTI_USE,
            detail: `read once by the next statement and ${elsewhere.length} more time(s) at line(s) ${elsewhere
              .map((reference) => reference.identifier.loc?.start.line ?? '?')
              .join(', ')}; check each read meant this \`${name}\``,
          });
        }

        // (5) the next statement reads another hoist's name and not its own
        if (
          next &&
          !variable.references.some((reference) =>
            AwaitHoistAudit.isWithin({
              position: AwaitHoistAudit.positionOf({ reference }),
              node: next,
            }),
          )
        ) {
          const swapped = new Set<string>();
          for (const reference of referencesIn(next)) {
            const usedName = reference.identifier.name;
            if (usedName === name || swapped.has(usedName) || !reference.isRead()) {
              continue;
            }
            const position = AwaitHoistAudit.positionOf({ reference });
            const isFamilyPair = AwaitHoistAudit.isFixerPair({ left: name, right: usedName });
            const isLater = (entry: IHoistCandidate) =>
              entry.declarator.range[0] > position &&
              (reference.resolved === entry.variable || reference.resolved === null);
            // a fixer name read where another fixer name was hoisted: the swap that compiles
            const isEarlierFamily = (entry: IHoistCandidate) =>
              reference.resolved === entry.variable &&
              entry.declarator.range[0] < declaredAt &&
              isFamilyPair &&
              AwaitHoistAudit.isScopeWithin({ inner: scope, outer: entry.scope });
            const other = group.find(
              (entry) =>
                entry !== candidate &&
                entry.name === usedName &&
                (isLater(entry) || isEarlierFamily(entry)),
            );
            if (!other) {
              continue;
            }
            swapped.add(usedName);
            const otherLine = other.declarator.loc.start.line;
            const isLaterUse = isLater(other);
            report({
              candidate,
              reason: AwaitHoistReasons.SWAP,
              severity: isLaterUse ? AwaitHoistSeverities.ERROR : AwaitHoistSeverities.REVIEW,
              detail: isLaterUse
                ? `the next statement reads \`${usedName}\`, hoisted later at line ${otherLine}, and never \`${name}\``
                : `the next statement reads \`${usedName}\`, hoisted earlier at line ${otherLine}, and never \`${name}\` (a compiling swap, or a plain reorder)`,
            });
          }
        }
      }
    }

    return { findings, hoistCount: candidates.length };
  }

  /** The TypeScript files git tracks under `root`, minus dependencies, build output, generated code and fixtures. */
  static listFiles(opts: { root: string }): string[] {
    const listed = spawnSync('git', ['ls-files', '-z'], {
      cwd: opts.root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (listed.status !== 0) {
      throw new Error(`git ls-files failed in ${opts.root}: ${listed.stderr.trim()}`);
    }
    return listed.stdout
      .split('\0')
      .filter(
        (file) =>
          SOURCE_EXTENSION.test(file) &&
          !DECLARATION_FILE.test(file) &&
          !file.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment)),
      );
  }

  static auditRepository(opts: { root: string }): IAwaitHoistRepositoryReport {
    const files = AwaitHoistAudit.listFiles({ root: opts.root });
    const findings: IAwaitHoistFinding[] = [];
    const failures: IAwaitHoistFailure[] = [];
    let hoistCount = 0;

    for (const file of files) {
      let code: string;
      try {
        code = readFileSync(join(opts.root, file), 'utf8');
      } catch (error) {
        // a tracked file deleted in the working tree: listed as not parsed, never skipped silently
        failures.push({ file, message: `unreadable: ${String(error)}` });
        continue;
      }
      const result = AwaitHoistAudit.auditSource({ code, filePath: file });
      findings.push(...result.findings);
      hoistCount += result.hoistCount;
      if (result.failure) {
        failures.push(result.failure);
      }
    }

    return { root: opts.root, fileCount: files.length, hoistCount, findings, failures };
  }

  static countByReason(opts: {
    findings: IAwaitHoistFinding[];
  }): Record<TAwaitHoistReason, number> {
    const counts: Record<TAwaitHoistReason, number> = {
      shadow: 0,
      duplicate: 0,
      unused: 0,
      'multi-use': 0,
      swap: 0,
    };
    for (const finding of opts.findings) {
      counts[finding.reason] += 1;
    }
    return counts;
  }

  static formatText(opts: { reports: IAwaitHoistRepositoryReport[] }): string {
    const out: string[] = [];

    for (const report of opts.reports) {
      out.push(
        `== ${report.root}: ${report.fileCount} files, ${report.hoistCount} await declarators, ${report.findings.length} finding(s), ${report.failures.length} unparsed`,
      );
      const byFile = new Map<string, IAwaitHoistFinding[]>();
      for (const finding of report.findings) {
        byFile.set(finding.file, [...(byFile.get(finding.file) ?? []), finding]);
      }
      for (const [file, findings] of byFile) {
        out.push(`  ${file}`);
        for (const finding of findings) {
          out.push(
            `    ${finding.line}:${finding.column}  ${finding.reason}${finding.severity === AwaitHoistSeverities.REVIEW ? ' (review)' : ''}  ${finding.functionName}  \`${finding.name}\` - ${finding.detail}`,
          );
          for (const [offset, text] of finding.context.entries()) {
            out.push(`      ${String(finding.line + offset).padStart(5)} | ${text}`);
          }
        }
      }
      for (const failure of report.failures) {
        out.push(`  not parsed: ${failure.file} - ${failure.message}`);
      }
    }

    const header = ['reason', ...opts.reports.map((report) => report.root), 'total'];
    const rows = [...AwaitHoistReasons.SCHEME_SET].map((reason) => {
      const counts = opts.reports.map(
        (report) => report.findings.filter((finding) => finding.reason === reason).length,
      );
      return [reason, ...counts.map(String), String(counts.reduce((sum, count) => sum + count, 0))];
    });
    const unparsed = opts.reports.map((report) => report.failures.length);
    rows.push([
      'not parsed',
      ...unparsed.map(String),
      String(unparsed.reduce((sum, count) => sum + count, 0)),
    ]);

    out.push('', `| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`);
    for (const row of rows) {
      out.push(`| ${row.join(' | ')} |`);
    }
    return out.join('\n');
  }

  /** Runs the CLI and returns its exit code. */
  static main(opts: { argv: string[] }): number {
    const isJson = opts.argv.includes('--json');
    const unknownFlag = opts.argv.find((arg) => arg.startsWith('--') && arg !== '--json');
    const roots = opts.argv.filter((arg) => !arg.startsWith('--'));
    if (unknownFlag || roots.length === 0) {
      console.error(
        'usage: bun scripts/checks/await-hoist-audit.ts <repository root> [more roots...] [--json]',
      );
      return 2;
    }

    const reports = roots.map((root) => AwaitHoistAudit.auditRepository({ root }));
    const isDirty = reports.some(
      (report) => report.findings.length > 0 || report.failures.length > 0,
    );

    if (isJson) {
      const findings = reports.flatMap((report) => report.findings);
      console.log(
        JSON.stringify(
          { repositories: reports, summary: AwaitHoistAudit.countByReason({ findings }) },
          null,
          2,
        ),
      );
    } else {
      console.log(AwaitHoistAudit.formatText({ reports }));
    }
    return isDirty ? 1 : 0;
  }
}

if (import.meta.main) {
  process.exit(AwaitHoistAudit.main({ argv: process.argv.slice(2) }));
}
