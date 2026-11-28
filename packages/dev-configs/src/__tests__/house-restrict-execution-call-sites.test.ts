import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  houseConfigs,
  houseEslintPlugin,
  reactHouseConfigs,
  RestrictExecutionCallSitesRule,
} from '../linters/house';

const NAME = RestrictExecutionCallSitesRule.NAME;
const CWD = '/project';
const CORE = "import { Execution } from '@venizia/ignis-helpers/core';";
const FRAMES = "import { ExecutionFrames } from '@venizia/ignis-helpers/core';";

const lint = (opts: { code: string; file?: string; allow?: string[]; allowRoot?: string[] }) => {
  const { code, file = 'src/subject.ts', allow, allowRoot } = opts;
  const config: Linter.Config[] = [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser },
      plugins: { '@venizia': houseEslintPlugin },
      rules: { [NAME]: RestrictExecutionCallSitesRule.build({ allow, allowRoot }) },
    },
  ];

  return new Linter({ cwd: CWD })
    .verify(code, config, { filename: join(CWD, file) })
    .map((finding) => finding.messageId ?? finding.message);
};

const SCOPED = "Execution.run({ mode: 'scoped', task });";
const ROOT = "Execution.run({ mode: 'scoped', isRoot: true, task });";

describe('restrict-execution-call-sites: calls of the framework', () => {
  test.each([
    ['a named import', `${CORE}\n${SCOPED}`],
    ['an alias', `import { Execution as Scope } from '@venizia/ignis';\nScope.run({ task });`],
    ['the ignis root', `import { Execution } from '@venizia/ignis';\n${SCOPED}`],
    ['an ignis sub-path', `import { Execution } from '@venizia/ignis/helpers';\n${SCOPED}`],
    ['the helpers root', `import { Execution } from '@venizia/ignis-helpers';\n${SCOPED}`],
    ['a namespace', `import * as ignis from '@venizia/ignis';\nignis.Execution.run({ task });`],
    ['a value passed on', `${CORE}\nexport const run = Execution.run;`],
    ['an optional call', `${CORE}\nExecution?.run({ task });`],
    ['a computed name', `${CORE}\nExecution['run']({ task });`],
    ['a non-null wrapper', `${CORE}\nExecution!.run({ task });`],
    ['a destructuring', `${CORE}\nconst { run } = Execution;`],
    ['ExecutionFrames.run', `${FRAMES}\nExecutionFrames.run({ frame, task });`],
    ['ExecutionFrames.root', `${FRAMES}\nExecutionFrames.root({ task });`],
  ])('with no allow-list, reports %s', (_name, code) => {
    expect(lint({ code })).toHaveLength(1);
  });

  test.each([
    [
      'the other methods',
      `${CORE}\nExecution.sleep({ ms: 1 });\nExecution.current();\nExecution.fireAndForget({ scope, execution });`,
    ],
    ['the other frame methods', `${FRAMES}\nExecutionFrames.listener({ handler });`],
    ['another library', "import { Execution } from 'some-library';\nExecution.run({ task });"],
    [
      'a sibling package',
      "import { Execution } from '@venizia/ignis-kernel';\nExecution.run({ task });",
    ],
    [
      'a look-alike package',
      "import { Execution } from '@venizia/ignis-helpersx';\nExecution.run({ task });",
    ],
    ['a local import', "import { Execution } from './jobs';\nExecution.run({ task });"],
    ['a class of the file', 'class Execution { static run() {} }\nExecution.run();'],
    ['a shadowing parameter', `${CORE}\nexport const f = (Execution: IRunner) => Execution.run();`],
    [
      'another export under the name',
      "import { Job as Execution } from '@venizia/ignis';\nExecution.run();",
    ],
    ['an unrelated run', `${CORE}\njob.run(); task.run({ isRoot: true });`],
    ['a type', `${CORE}\nexport type TRun = typeof Execution.run;`],
    [
      'a type-only import',
      "import type { Execution } from '@venizia/ignis';\nexport type TRun = typeof Execution.run;",
    ],
  ])('leaves %s alone', (_name, code) => {
    expect(lint({ code })).toEqual([]);
  });
});

describe('restrict-execution-call-sites: the allow-lists', () => {
  const allow = ['src/jobs/**'];
  const allowRoot = ['src/listeners/*.ts'];

  test('a file in allow may call, not open a root', () => {
    const file = 'src/jobs/reaper.ts';

    expect(lint({ code: `${CORE}\n${SCOPED}`, file, allow, allowRoot })).toEqual([]);
    expect(lint({ code: `${CORE}\n${ROOT}`, file, allow, allowRoot })).toEqual(['root']);
    expect(lint({ code: `${FRAMES}\nExecutionFrames.root({ task });`, file, allow })).toEqual([
      'root',
    ]);
    expect(lint({ code: `${FRAMES}\nExecutionFrames.run({ frame, task });`, file, allow })).toEqual(
      ['root'],
    );
  });

  test('a file in allowRoot may do both', () => {
    const code = [
      "import { Execution, ExecutionFrames } from '@venizia/ignis-helpers/core';",
      SCOPED,
      ROOT,
      'ExecutionFrames.root({ task });',
      'ExecutionFrames.run({ frame, task });',
    ].join('\n');

    expect(lint({ code, file: 'src/listeners/mqtt.ts', allow, allowRoot })).toEqual([]);
  });

  test('another file may do neither', () => {
    const code = `${CORE}\n${SCOPED}\n${ROOT}`;

    expect(lint({ code, allow, allowRoot })).toEqual(['restricted', 'restricted']);
  });

  test.each([
    ['isRoot: false', "{ mode: 'scoped', isRoot: false, task }"],
    ['isRoot: undefined', "{ mode: 'scoped', isRoot: undefined, task }"],
    ['no isRoot', "{ mode: 'scoped', task }"],
    ['an isRoot written after a spread', '{ ...base, isRoot: false }'],
    ['a system run with a spread', "{ ...base, mode: 'system', reason: 'r', task }"],
  ])('is not a root: %s', (_name, options) => {
    const code = `${CORE}\nExecution.run(${options});`;

    expect(lint({ code, file: 'src/jobs/a.ts', allow })).toEqual([]);
  });

  test.each([
    ['an expression', `Execution.run({ mode: 'scoped', isRoot: flag, task });`],
    ['a shorthand', `Execution.run({ mode: 'scoped', isRoot, task });`],
    ['a quoted key', `Execution.run({ mode: 'scoped', 'isRoot': true, task });`],
    ['a spread', `Execution.run({ mode: 'scoped', ...extra });`],
    ['a spread after isRoot: false', `Execution.run({ isRoot: false, ...extra });`],
    ['a computed key', `Execution.run({ [key]: true, task });`],
    ['a spread after a system mode', "Execution.run({ mode: 'system', ...extra });"],
    ['options held elsewhere', 'Execution.run(options);'],
    ['the method passed on', 'export const run = Execution.run;'],
    ['the method destructured', 'const { run } = Execution;'],
  ])('may be a root: %s', (_name, line) => {
    const code = `${CORE}\n${line}`;

    expect(lint({ code, file: 'src/jobs/a.ts', allow })).toEqual(['root']);
  });
});

describe('restrict-execution-call-sites: presets', () => {
  const code = `${CORE}\n${SCOPED}`;
  const findings = (configs: Linter.Config[]) =>
    new Linter()
      .verify(code, configs, { filename: 'src/a.ts' })
      .filter((finding) => finding.ruleId === NAME);

  test('is off in the presets, and an app turns it on', () => {
    const optIn: Linter.Config = {
      files: ['**/*.ts'],
      rules: { [NAME]: RestrictExecutionCallSitesRule.build() },
    };

    expect(findings(houseConfigs)).toHaveLength(0);
    expect(findings(reactHouseConfigs)).toHaveLength(0);
    expect(findings([...houseConfigs, optIn]).map((finding) => finding.severity)).toEqual([2]);
  });
});
