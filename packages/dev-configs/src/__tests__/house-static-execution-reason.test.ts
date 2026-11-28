import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  houseConfigs,
  houseEslintPlugin,
  reactHouseConfigs,
  StaticExecutionReasonRule,
} from '../linters/house';

const NAME = StaticExecutionReasonRule.NAME;
const IMPORT = "import { Execution, ExecutionModes } from '@venizia/ignis-helpers/core';";

const lint = (code: string) => {
  const config: Linter.Config[] = [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser },
      plugins: { '@venizia': houseEslintPlugin },
      rules: { [NAME]: StaticExecutionReasonRule.build() },
    },
  ];

  return new Linter()
    .verify(code, config, { filename: 'src/subject.ts' })
    .map((finding) => finding.messageId ?? finding.message);
};

const system = (reason: string) =>
  `Execution.run({ mode: ExecutionModes.SYSTEM, reason: ${reason}, task });`;

describe('static-execution-reason: static reasons', () => {
  test.each([
    ['a literal', system("'draft order reaper'")],
    ['a template without expressions', system('`draft order reaper`')],
    ['an as const literal', system("'reaper' as const")],
    ['a satisfies literal', system("'reaper' satisfies string")],
    ['a const of the file', `const REASON = 'reaper';\n${system('REASON')}`],
    [
      'a static readonly of a class of the file',
      `class Reasons { static readonly REAPER = 'reaper'; }\n${system('Reasons.REAPER')}`,
    ],
    [
      'a static readonly read through this in a static method',
      `class Job { static readonly REASON = 'reaper'; static go() { return ${system('this.REASON').slice(0, -1)}; } }`,
    ],
    [
      'a static readonly read through this in a static arrow field',
      `class Job { static readonly REASON = 'reaper'; static go = () => ${system('this.REASON').slice(0, -1)}; }`,
    ],
    [
      'an exported class declared later',
      `export const go = () => ${system('Reasons.REAPER')}\nexport class Reasons { static readonly REAPER = \`reaper\`; }`,
    ],
  ])('accepts %s', (_name, code) => {
    expect(lint(`${IMPORT}\n${code}`)).toEqual([]);
  });

  test.each([
    ['a template with an expression', system('`reap ${id}`')],
    ['a concatenation', system("'reap ' + id")],
    ['a call', system('buildReason()')],
    ['a parameter', `export const go = (reason: string) => ${system('reason')}`],
    [
      'a shorthand parameter',
      'export const go = (reason: string) => Execution.run({ mode: ExecutionModes.SYSTEM, reason, task });',
    ],
    ['a let', `let REASON = 'reaper';\n${system('REASON')}`],
    ['a const built at run time', `const REASON = build();\n${system('REASON')}`],
    ['an imported constant', `import { Reasons } from './reasons';\n${system('Reasons.REAPER')}`],
    [
      'a static that is not readonly',
      `class Reasons { static REAPER = 'reaper'; }\n${system('Reasons.REAPER')}`,
    ],
    [
      'an instance field',
      `class Reasons { readonly REAPER = 'reaper'; }\n${system('Reasons.REAPER')}`,
    ],
    [
      'this in an instance method',
      `class Job { static readonly REASON = 'reaper'; go() { return ${system('this.REASON').slice(0, -1)}; } }`,
    ],
    ['a computed member', system('Reasons[name]')],
    ['a number', system('1')],
    ['a spread that may supply it', 'Execution.run({ mode: ExecutionModes.SYSTEM, ...options });'],
    [
      'a spread that may replace it',
      "Execution.run({ mode: ExecutionModes.SYSTEM, reason: 'r', ...options });",
    ],
  ])('reports %s', (_name, code) => {
    expect(lint(`${IMPORT}\n${code}`)).toEqual(['notStatic']);
  });

  test.each([
    ['an empty literal', system("''")],
    ['spaces', system("'   '")],
    ['an empty template', system('`  `')],
    ['an empty constant', `const REASON = ' ';\n${system('REASON')}`],
  ])('reports %s as blank', (_name, code) => {
    expect(lint(`${IMPORT}\n${code}`)).toEqual(['blank']);
  });
});

describe('static-execution-reason: which calls', () => {
  test.each([
    ['the literal mode', `${IMPORT}\nExecution.run({ mode: 'system', reason: id, task });`],
    [
      'an as const mode',
      `${IMPORT}\nExecution.run({ mode: 'system' as const, reason: id, task });`,
    ],
    [
      'aliases',
      "import { Execution as E, ExecutionModes as M } from '@venizia/ignis';\nE.run({ mode: M.SYSTEM, reason: id, task });",
    ],
    [
      'a namespace',
      "import * as ignis from '@venizia/ignis-helpers';\nignis.Execution.run({ mode: ignis.ExecutionModes.SYSTEM, reason: id, task });",
    ],
    [
      'a sub-path',
      "import { Execution, ExecutionModes } from '@venizia/ignis/helpers';\nExecution?.run({ mode: ExecutionModes.SYSTEM, reason: id, task });",
    ],
  ])('reads %s', (_name, code) => {
    expect(lint(code)).toEqual(['notStatic']);
  });

  test.each([
    ['a scoped run', `${IMPORT}\nExecution.run({ mode: ExecutionModes.SCOPED, task });`],
    [
      'a mode of another origin',
      `${IMPORT}\nimport { Modes } from 'x';\nExecution.run({ mode: Modes.SYSTEM, reason: id, task });`,
    ],
    [
      'another library',
      "import { Execution } from 'some-library';\nExecution.run({ mode: 'system', reason: id });",
    ],
    [
      'a sibling package',
      "import { Execution } from '@venizia/ignis-kernel';\nExecution.run({ mode: 'system', reason: id });",
    ],
    ['an unrelated run', `${IMPORT}\njob.run({ mode: 'system', reason: id });`],
    [
      'a class of the file',
      "class Execution { static run(_o: object) {} }\nExecution.run({ mode: 'system', reason: id });",
    ],
    [
      'a shadowing parameter',
      `${IMPORT}\nexport const f = (Execution: IRunner) => Execution.run({ mode: 'system', reason: id });`,
    ],
    ['options held elsewhere', `${IMPORT}\nExecution.run(options);`],
    [
      'a missing reason, which does not compile',
      `${IMPORT}\nExecution.run({ mode: 'system', task });`,
    ],
  ])('leaves %s alone', (_name, code) => {
    expect(lint(code)).toEqual([]);
  });
});

describe('static-execution-reason: presets', () => {
  const code = `${IMPORT}\n${system('id')}`;
  const findings = (opts: { configs: Linter.Config[]; filename: string }) =>
    new Linter()
      .verify(code, opts.configs, { filename: opts.filename })
      .filter((finding) => finding.ruleId === NAME)
      .map((finding) => finding.severity);

  test('is an error in source and off in tests', () => {
    for (const configs of [houseConfigs, reactHouseConfigs]) {
      expect(findings({ configs, filename: 'src/a.ts' })).toEqual([2]);
      expect(findings({ configs, filename: 'src/__tests__/a.test.ts' })).toEqual([]);
    }
  });
});
