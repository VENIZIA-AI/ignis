import { describe, expect, test } from 'bun:test';
import ts from 'typescript';
import { LoggerScopeRewriter } from '../cli/codemod/namespace-functions';

const rewrite = (source: string) =>
  LoggerScopeRewriter.rewrite({ typescript: ts, fileName: 'a.ts', source });

const HEADER = `import { ApplicationLogger } from '@venizia/ignis-helpers';\n`;
const FIXED_HEADER = `import { LoggerFactory } from '@venizia/ignis-helpers';\n`;

describe('the ApplicationLogger call-shape rule: every form becomes LoggerFactory.getLogger([scope])', () => {
  test('a string literal becomes an array of one scope, and the import follows', () => {
    const result = rewrite(`${HEADER}const logger = ApplicationLogger.get('UserService');\n`);

    expect(result.output).toBe(
      `${FIXED_HEADER}const logger = LoggerFactory.getLogger(['UserService']);\n`,
    );
    expect(result.rewritten).toBe(1);
    expect(result.reports).toEqual([]);
  });

  test('an identifier and a property access (the NAME and LOG_PREFIX constants) become an array of one scope', () => {
    const result = rewrite(
      `${HEADER}const a = ApplicationLogger.get(NAME);\nconst b = ApplicationLogger.get(Constants.LOG_PREFIX);\n`,
    );

    expect(result.output).toContain('LoggerFactory.getLogger([NAME])');
    expect(result.output).toContain('LoggerFactory.getLogger([Constants.LOG_PREFIX])');
    expect(result.output).not.toContain('ApplicationLogger');
    expect(result.rewritten).toBe(2);
  });

  test('a template literal becomes an array of one scope', () => {
    const result = rewrite(`${HEADER}ApplicationLogger.get(\`\${name}-svc\`);\n`);

    expect(result.output).toContain('LoggerFactory.getLogger([`${name}-svc`])');
  });

  test('the object form { scope } is rewritten too, in the long and the short spelling', () => {
    const result = rewrite(
      `${HEADER}const scope = 'X';\nconst a = ApplicationLogger.get({ scope: 'Y' });\nconst b = ApplicationLogger.get({ scope });\n`,
    );

    expect(result.output).toContain("LoggerFactory.getLogger(['Y'])");
    expect(result.output).toContain('LoggerFactory.getLogger([scope])');
    expect(result.rewritten).toBe(2);
  });

  test('the import keeps its other names and takes LoggerFactory in place of ApplicationLogger', () => {
    const result = rewrite(
      `import { ErrorPrettier, ApplicationLogger, getError } from '@venizia/ignis-helpers';\nApplicationLogger.get('A');\n`,
    );

    expect(result.output).toContain(
      "import { ErrorPrettier, LoggerFactory, getError } from '@venizia/ignis-helpers';",
    );
  });

  test('an import that already has LoggerFactory just drops ApplicationLogger', () => {
    const result = rewrite(
      `import { ApplicationLogger, LoggerFactory } from '@venizia/ignis-helpers';\nApplicationLogger.get('A');\nLoggerFactory.use({ provider });\n`,
    );

    expect(result.output).toContain("import { LoggerFactory } from '@venizia/ignis-helpers';");
    expect(result.output).toContain("LoggerFactory.getLogger(['A'])");
  });

  test('ApplicationLogger stays imported while something else still uses it, and LoggerFactory is added', () => {
    const result = rewrite(
      `${HEADER}ApplicationLogger.get('A');\nexport const alias = ApplicationLogger;\n`,
    );

    expect(result.output).toContain(
      "import { ApplicationLogger, LoggerFactory } from '@venizia/ignis-helpers';",
    );
    expect(result.output).toContain("LoggerFactory.getLogger(['A'])");
    expect(result.output).toContain('export const alias = ApplicationLogger;');
  });

  test('an aliased import and a namespace import are followed', () => {
    const aliased = rewrite(
      `import { ApplicationLogger as AppLog } from '@venizia/ignis';\nAppLog.get('A');\n`,
    );
    const namespaced = rewrite(
      `import * as helpers from '@venizia/ignis-helpers';\nhelpers.ApplicationLogger.get('B');\n`,
    );

    expect(aliased.output).toContain("import { LoggerFactory } from '@venizia/ignis';");
    expect(aliased.output).toContain("LoggerFactory.getLogger(['A'])");
    expect(namespaced.output).toContain("helpers.LoggerFactory.getLogger(['B'])");
  });

  test('Logger.get and HfLogger.get are never touched', () => {
    const source = `import { HfLogger, Logger } from '@venizia/ignis-helpers';\nLogger.get('A');\nHfLogger.get('B');\n`;
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
  });

  test('an ApplicationLogger that does not come from a listed module is not touched', () => {
    const source = `import { ApplicationLogger } from './my-logger';\nApplicationLogger.get('A');\n`;

    expect(rewrite(source).changed).toBe(false);
  });

  test('a call it cannot decide is listed with its line and left as it was', () => {
    const source = `${HEADER}ApplicationLogger.get(name());\nApplicationLogger.get('a', 'b');\nApplicationLogger.get({ scope: 'a', extra: 1 });\n`;
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.reports.map((report) => report.line)).toEqual([2, 3, 4]);
  });
});

describe('the ApplicationLogger call-shape rule: what it lists or keeps safe', () => {
  test('a use that is not a call is listed, and the import stays so the file still names it', () => {
    const result = rewrite(
      `${HEADER}ApplicationLogger.get('A');\nexport type Alias = typeof ApplicationLogger;\nexport const value = ApplicationLogger;\n`,
    );

    expect(result.output).toContain("LoggerFactory.getLogger(['A'])");
    expect(result.output).toContain(
      "import { ApplicationLogger, LoggerFactory } from '@venizia/ignis-helpers';",
    );
    expect(result.reports.map((report) => report.line)).toEqual([3, 4]);
    expect(result.reports[0]?.reason).toContain('no longer exists');
  });

  test('a re-export of the removed class from a listed module is listed, with no call to rewrite', () => {
    const source = `export { ApplicationLogger } from '@venizia/ignis-helpers';\n`;
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]?.reason).toContain('re-export');
  });

  test('a type-only import of the removed class is listed', () => {
    const source = `import type { ApplicationLogger } from '@venizia/ignis-helpers';\ntype T = ApplicationLogger;\n`;
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.reports.map((report) => report.reason).join(' ')).toContain('type-only import');
  });

  test('a LoggerFactory imported under another name is the name the calls use', () => {
    const result = rewrite(
      `import { ApplicationLogger, LoggerFactory as Factory } from '@venizia/ignis-helpers';\nApplicationLogger.get('A');\n`,
    );

    expect(result.output).toContain("Factory.getLogger(['A'])");
    expect(result.output).toContain(
      "import { LoggerFactory as Factory } from '@venizia/ignis-helpers';",
    );
    expect(result.output).not.toContain('ApplicationLogger');
  });

  test('a LoggerFactory imported in another declaration of a listed module is not imported twice', () => {
    const result = rewrite(
      `import { ApplicationLogger } from '@venizia/ignis-helpers';\nimport { LoggerFactory } from '@venizia/ignis';\nApplicationLogger.get('A');\n`,
    );

    expect(result.output).toContain("LoggerFactory.getLogger(['A'])");
    expect(result.output.match(/LoggerFactory/g)?.length).toBe(2);
    expect(result.output).not.toContain('ApplicationLogger');
  });

  test('a LoggerFactory of the file that is not the framework one stops the file and is listed', () => {
    const own = rewrite(`${HEADER}class LoggerFactory {}\nApplicationLogger.get('A');\n`);
    const foreign = rewrite(
      `${HEADER}import { LoggerFactory } from './mine';\nApplicationLogger.get('A');\n`,
    );

    for (const result of [own, foreign]) {
      expect(result.changed).toBe(false);
      expect(result.reports.map((report) => report.reason).join(' ')).toContain('already declared');
    }
  });

  test('a call and an import written over several lines are rewritten', () => {
    const result = rewrite(
      `import {\n  ApplicationLogger,\n  ErrorPrettier,\n} from '@venizia/ignis-helpers';\nconst logger = ApplicationLogger.get({\n  scope: NAME,\n});\n`,
    );

    expect(result.output).toContain('LoggerFactory.getLogger([NAME])');
    expect(result.output).toContain('LoggerFactory,');
    expect(result.output).not.toContain('ApplicationLogger');
  });
});
