import { describe, expect, test } from 'bun:test';
import ts from 'typescript';
import { LoggerScopeRewriter } from '../cli/codemod/namespace-functions';

const rewrite = (source: string) =>
  LoggerScopeRewriter.rewrite({ typescript: ts, fileName: 'a.ts', source });

const HEADER = `import { ApplicationLogger } from '@venizia/ignis-helpers';\n`;

describe('the ApplicationLogger.get call-shape rule', () => {
  test('a string literal becomes the object form', () => {
    const result = rewrite(`${HEADER}const logger = ApplicationLogger.get('UserService');\n`);

    expect(result.output).toBe(
      `${HEADER}const logger = ApplicationLogger.get({ scope: 'UserService' });\n`,
    );
    expect(result.rewritten).toBe(1);
    expect(result.reports).toEqual([]);
  });

  test('an identifier and a property access become the object form', () => {
    const result = rewrite(
      `${HEADER}const NAME = 'X';\nconst a = ApplicationLogger.get(NAME);\nconst b = ApplicationLogger.get(Constants.LOG_PREFIX);\n`,
    );

    expect(result.output).toContain('ApplicationLogger.get({ scope: NAME })');
    expect(result.output).toContain('ApplicationLogger.get({ scope: Constants.LOG_PREFIX })');
    expect(result.rewritten).toBe(2);
  });

  test('an identifier named scope is written short', () => {
    const result = rewrite(`${HEADER}const scope = 'X';\nApplicationLogger.get(scope);\n`);

    expect(result.output).toContain('ApplicationLogger.get({ scope })');
  });

  test('a template literal becomes the object form', () => {
    const result = rewrite(`${HEADER}ApplicationLogger.get(\`\${name}-svc\`);\n`);

    expect(result.output).toContain('ApplicationLogger.get({ scope: `${name}-svc` })');
  });

  test('the object form is left alone', () => {
    const source = `${HEADER}ApplicationLogger.get({ scope: 'X' });\n`;
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.reports).toEqual([]);
  });

  test('an aliased import and a namespace import are followed', () => {
    const aliased = rewrite(
      `import { ApplicationLogger as AppLog } from '@venizia/ignis';\nAppLog.get('A');\n`,
    );
    const namespaced = rewrite(
      `import * as helpers from '@venizia/ignis-helpers';\nhelpers.ApplicationLogger.get('B');\n`,
    );

    expect(aliased.output).toContain("AppLog.get({ scope: 'A' })");
    expect(namespaced.output).toContain("helpers.ApplicationLogger.get({ scope: 'B' })");
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
    const source = `${HEADER}ApplicationLogger.get(name());\nApplicationLogger.get('a', 'b');\n`;
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.reports.map((report) => report.line)).toEqual([2, 3]);
  });
});
