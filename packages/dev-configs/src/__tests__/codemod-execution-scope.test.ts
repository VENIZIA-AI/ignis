import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import {
  ExecutionScopeRewrite,
  ExecutionScopeCommand,
  type TExecutionScopeMap,
} from '../cli/codemod/execution-scope';
import { CliOutput } from '../common/cli-output';

const MAP: TExecutionScopeMap = {
  runElevated: { mode: 'system' },
  runPinned: { mode: 'scoped', values: { tenantIds: 'tenantIds' } },
  'Scope.elevate': { mode: 'system' },
};

const HELPERS = "import { runElevated, runPinned } from './scope';";
const IGNIS = "import { Execution, ExecutionModes } from '@venizia/ignis';";

const lines = (...rows: string[]) => `${rows.join('\n')}\n`;

const rewrite = (source: string, opts?: { rewriteNested?: boolean }) =>
  ExecutionScopeRewrite.rewrite({
    typescript: ts,
    fileName: '/app/src/job.ts',
    shownName: 'src/job.ts',
    source,
    map: MAP,
    isNestedRewritten: opts?.rewriteNested ?? false,
  });

const SYSTEM = (method: string) =>
  `Execution.run({ mode: ExecutionModes.SYSTEM, reason: 'TODO: reason (src/job.ts:${method})', task: `;
const SCOPED = (values: string) =>
  `Execution.run({ mode: ExecutionModes.SCOPED, values: { ${values} }, task: `;

describe('devz codemod execution-scope: plain calls', () => {
  test('a system call gets a TODO reason, the import is added and the helper import goes', () => {
    const result = rewrite(
      lines(
        "import { runElevated } from './scope';",
        'export class Job {',
        '  reap() {',
        '    return runElevated(() => this.all());',
        '  }',
        '}',
      ),
    );

    expect(result.output).toBe(
      lines(
        IGNIS,
        'export class Job {',
        '  reap() {',
        `    return ${SYSTEM('reap')}() => this.all() });`,
        '  }',
        '}',
      ),
    );
    expect(result.rewritten).toBe(1);
    expect(result.manual).toEqual([
      { line: 4, note: expect.stringContaining('TODO: reason (src/job.ts:reap)') },
    ]);
  });

  test('a scoped call takes its values from the options object, with the task in it or after it', () => {
    const result = rewrite(
      lines(
        HELPERS,
        'export const a = (ids: string[]) => runPinned({ tenantIds: ids, task: async () => 1 });',
        'export const b = (tenantIds: string[]) => runPinned({ tenantIds }, () => 2);',
        'export const c = (job: IJob) => runPinned({ tenantIds: [job.tenantId] }, () => 3);',
      ),
    );

    expect(result.output).toContain(`${SCOPED('tenantIds: ids')}async () => 1 })`);
    expect(result.output).toContain(`${SCOPED('tenantIds')}() => 2 })`);
    expect(result.output).toContain(`${SCOPED('tenantIds: [job.tenantId]')}() => 3 })`);
    expect(result.output).toContain("import { runElevated } from './scope';");
    expect(result.manual).toEqual([]);
  });

  test('await in return position, a type argument and a function expression stay as written', () => {
    const result = rewrite(
      lines(
        HELPERS,
        'export async function load() {',
        '  return await runElevated<number>(async function () {',
        '    return await read();',
        '  });',
        '}',
      ),
    );

    expect(result.output).toContain(
      `return await Execution.run<number>({ mode: ExecutionModes.SYSTEM, reason: 'TODO: reason (src/job.ts:load)', task: async function () {\n    return await read();\n  } });`,
    );
  });

  test('an aliased helper import is followed, and a mapped static method is rewritten', () => {
    const result = rewrite(
      lines(
        "import { runElevated as elevate, other } from './scope';",
        "import { Scope } from './tenant';",
        'export const sweep = () => elevate(() => other());',
        'export const purge = () => Scope.elevate(() => other());',
      ),
    );

    expect(result.output).toContain(`${SYSTEM('sweep')}() => other() })`);
    expect(result.output).toContain(`${SYSTEM('purge')}() => other() })`);
    expect(result.output).toContain("import { other } from './scope';");
    expect(result.output).not.toContain('./tenant');
    expect(result.rewritten).toBe(2);
  });

  test('an existing ignis import is reused or extended, and a taken name is aliased', () => {
    const extended = rewrite(
      lines(
        "import { Execution as Frames } from '@venizia/ignis';",
        HELPERS,
        'runElevated(() => 1);',
      ),
    );

    expect(extended.output).toContain(
      "import { Execution as Frames, ExecutionModes } from '@venizia/ignis';",
    );
    expect(extended.output).toContain('Frames.run({ mode: ExecutionModes.SYSTEM');

    const taken = rewrite(
      lines("import type { Execution } from './model';", HELPERS, 'runElevated(() => 1);'),
    );

    expect(taken.output).toContain(
      "import { Execution as IgnisExecution, ExecutionModes } from '@venizia/ignis';",
    );
    expect(taken.output).toContain('IgnisExecution.run({');
  });

  test('an Execution imported from helpers is reused, and ExecutionModes gets its own import', () => {
    const result = rewrite(
      lines(
        "import { Execution } from '@venizia/ignis-helpers';",
        HELPERS,
        'runElevated(() => 1);',
      ),
    );

    expect(result.output).toContain("import { Execution } from '@venizia/ignis-helpers';");
    expect(result.output).toContain("import { ExecutionModes } from '@venizia/ignis';");
    expect(result.output).toContain('Execution.run({ mode: ExecutionModes.SYSTEM');
  });

  test('a second run changes nothing', () => {
    const once = rewrite(
      lines(
        HELPERS,
        'export const a = (ids: string[]) => runPinned({ tenantIds: ids }, () => runElevated(() => 1));',
      ),
    );
    const twice = rewrite(once.output);

    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
    expect(twice.output).toBe(once.output);
    expect(twice.manual.some((entry) => entry.note.includes('inside a scoped'))).toBe(true);
  });
});

describe('devz codemod execution-scope: nested calls', () => {
  const source = lines(
    HELPERS,
    'export const a = (ids: string[]) =>',
    '  runPinned({ tenantIds: ids }, async () => {',
    '    await runElevated(() => 1);',
    '  });',
  );

  test('a system call inside a scoped one is listed and left', () => {
    const result = rewrite(source);

    expect(result.output).toContain(`${SCOPED('tenantIds: ids')}async () => {`);
    expect(result.output).toContain('await runElevated(() => 1);');
    expect(result.output).toContain("import { runElevated } from './scope';");
    expect(result.manual).toEqual([{ line: 4, note: expect.stringContaining('--rewrite-nested') }]);
  });

  test('--rewrite-nested rewrites both', () => {
    const result = rewrite(source, { rewriteNested: true });

    expect(result.output).toContain(`await ${SYSTEM('a')}() => 1 });`);
    expect(result.output).not.toContain('./scope');
    expect(result.rewritten).toBe(2);
  });

  test('a system call inside a hand-written scoped run is left too', () => {
    const result = rewrite(
      lines(
        IGNIS,
        HELPERS,
        'Execution.run({ mode: ExecutionModes.SCOPED, task: () => runElevated(() => 1) });',
      ),
    );

    expect(result.changed).toBe(false);
    expect(result.manual).toHaveLength(1);
  });
});

describe('devz codemod execution-scope: what it cannot read', () => {
  for (const [name, call] of [
    ['a helper passed as a value', 'export const a = list.map(runElevated);'],
    ['a helper stored', 'export const a = { elevate: runElevated };'],
    ['a spread argument', 'runElevated(...args);'],
    ['a callback by reference', 'runElevated(this.reap);'],
    ['a callback with parameters', 'runElevated((client) => client);'],
    ['no argument', 'runElevated();'],
    ['an extra argument', 'runElevated(() => 1, options);'],
    ['an unknown option', 'runElevated({ task: () => 1, timeout: 5 });'],
    ['a positional value', 'runPinned(ids, () => 1);'],
    ['a missing value', 'runPinned({ task: () => 1 });'],
    ['a scoped call without its value', 'runPinned(() => 1);'],
    ['a spread option', 'runPinned({ ...scope, task: () => 1 });'],
    ['a member call of a bare name', 'this.runElevated(() => 1);'],
    ['an optional call', 'runElevated?.(() => 1);'],
    [
      'a comment between the arguments',
      'runPinned({ tenantIds: ids /* x */ }, /* why */ () => 1);',
    ],
  ] as const) {
    test(`${name} is listed and left`, () => {
      const source = lines(HELPERS, call);
      const result = rewrite(source);

      expect(result.output).toBe(source);
      expect(result.manual.map((entry) => entry.line)).toEqual([2]);
    });
  }

  test('a file that defines a mapped helper is not touched', () => {
    for (const source of [
      lines(
        'export function runElevated(task: () => void) { task(); }',
        'export const a = () => runElevated(() => 1);',
      ),
      lines(
        "import { runElevated } from './base';",
        'export const runPinned = (ids: string[], task: () => void) => runElevated(task);',
      ),
      lines('export class Scope {', '  static elevate(task: () => void) { task(); }', '}'),
    ]) {
      const result = rewrite(source);

      expect(result.output).toBe(source);
      expect(result.manual).toEqual([]);
      expect(result.info.map((entry) => entry.note).join()).toContain('defines');
    }
  });

  test('a name from nowhere is not a helper call', () => {
    const source = lines('export const a = (runElevated: TRun) => runElevated(() => 1);');

    expect(rewrite(source).output).toBe(source);
  });
});

describe('devz codemod execution-scope: handlers and consumers', () => {
  test('event handlers and queue consumers are listed, and change nothing', () => {
    const source = lines(
      'export class Sender implements IEventHandler<IPlaced> {}',
      'bus.register({ name, handler: { type: EventHandlerTypes.FUNCTION, fn } });',
      'new BullMQHelper({ onWorkerData: async (job) => job, onWorkerDataFail });',
      'KafkaConsumerHelper.newInstance({ onMessage: () => 1 });',
      'const config = { onMessage: 1 };',
      'class Worker { protected onMessage = async () => 1; }',
    );
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([]);
    expect(result.info.map((entry) => entry.line)).toEqual([1, 2, 3, 3, 4, 5, 6]);
  });
});

describe('devz codemod execution-scope: the command', () => {
  let root: string;
  let logs: string[];
  let errors: string[];

  const commit = () => {
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'x'],
      { cwd: root },
    );
  };

  const run = (...args: string[]) =>
    CodemodCommand.run({ root, args: ['execution-scope', ...args] });

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'codemod-scope-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'map.json'), JSON.stringify(MAP));
    logs = [];
    errors = [];
    spyOn(CliOutput, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    spyOn(CliOutput, 'warn').mockImplementation(() => {});
    spyOn(CliOutput, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    mock.restore();
  });

  test('--check exits 1 while a call would change, and writes nothing', async () => {
    const file = join(root, 'src', 'a.ts');
    const source = lines(HELPERS, 'export const a = () => runElevated(() => 1);');
    writeFileSync(file, source);

    const code = await run('--map', 'map.json', '--check');
    expect(code).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe(source);
  });

  test('--write rewrites and lists the reason; --check fails until it is written, then passes', async () => {
    const file = join(root, 'src', 'a.ts');
    writeFileSync(file, lines(HELPERS, 'export const a = () => runElevated(() => 1);'));
    commit();

    const written = await run('--map', 'map.json', 'src', '--write');
    expect(written).toBe(0);
    expect(readFileSync(file, 'utf8')).toContain("reason: 'TODO: reason (src/a.ts:a)'");
    expect(logs.join('\n')).toContain('1 call(s) rewritten');
    const pending = await run('--map', 'map.json', '--check');
    expect(pending).toBe(1);

    writeFileSync(file, readFileSync(file, 'utf8').replace('TODO: reason (src/a.ts:a)', 'sweep'));

    const done = await run('--map', 'map.json', '--check');
    expect(done).toBe(0);
  });

  test('a handler file with no helper is listed, and does not fail --check', async () => {
    writeFileSync(join(root, 'src', 'h.ts'), 'export class A implements IEventHandler {}\n');

    const code = await run('--map', 'map.json', '--check');
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('review  src/h.ts:1');
  });

  test('--rewrite-nested reaches the rewrite', async () => {
    const file = join(root, 'src', 'a.ts');
    writeFileSync(
      file,
      lines(
        HELPERS,
        'export const a = () => runPinned({ tenantIds: [1] }, () => runElevated(() => 1));',
      ),
    );
    commit();

    const code = await run('--map', 'map.json', '--rewrite-nested', '--write', '--all');
    expect(code).toBe(0);
    expect(readFileSync(file, 'utf8')).not.toMatch(/runElevated|runPinned/);
  });

  test('a missing or unreadable map exits 2', async () => {
    writeFileSync(join(root, 'bad.json'), '{ "a": { "mode": "root" } }');
    writeFileSync(
      join(root, 'values.json'),
      '{ "a": { "mode": "system", "values": { "x": "y" } } }',
    );
    writeFileSync(join(root, 'text.json'), 'not json');

    for (const args of [
      [],
      ['--map'],
      ['--map', 'none.json'],
      ['--map', 'bad.json'],
      ['--map', 'values.json'],
      ['--map', 'text.json'],
    ]) {
      const code = await run(...args);
      expect(code).toBe(2);
    }

    expect(errors).toHaveLength(6);
  });

  test('--help prints the usage without a map; --reverse is refused', async () => {
    const helpCode = await run('--help');
    expect(helpCode).toBe(0);
    expect(logs.join('\n')).toContain(ExecutionScopeCommand.USAGE);
    const reverseCode = await run('--map', 'map.json', '--reverse');
    expect(reverseCode).toBe(2);
  });
});

describe('devz codemod execution-scope: the module of a helper', () => {
  const library = lines(
    "import { runElevated as other } from 'some-lib';",
    'export const a = () => other(() => 2);',
  );
  const run = (source: string, map: TExecutionScopeMap) =>
    ExecutionScopeRewrite.rewrite({
      typescript: ts,
      fileName: '/app/src/job.ts',
      shownName: 'src/job.ts',
      source,
      map,
      isNestedRewritten: false,
    });

  test('a package import of a mapped name is listed, not rewritten', () => {
    const result = run(library, MAP);

    expect(result.output).toBe(library);
    expect(result.rewritten).toBe(0);
    expect(result.manual).toEqual([{ line: 1, note: expect.stringContaining('some-lib') }]);
  });

  test('"from" names the package whose calls are rewritten', () => {
    const result = run(library, { runElevated: { mode: 'system', from: 'some-lib' } });

    expect(result.rewritten).toBe(1);
    expect(result.output).not.toContain('some-lib');
  });

  test('with "from", the name imported from another module is listed', () => {
    const source = lines(
      "import { runElevated } from './scope';",
      'export const a = () => runElevated(() => 2);',
    );
    const result = run(source, { runElevated: { mode: 'system', from: '@app/scope' } });

    expect(result.output).toBe(source);
    expect(result.manual).toEqual([{ line: 1, note: expect.stringContaining('./scope') }]);
  });

  test.each(['./scope', '../common/scope', '@/common/scope', '~/scope', '#scope'])(
    'without "from", %s is a module of the application',
    (module) => {
      const source = lines(
        `import { runElevated } from '${module}';`,
        'export const a = () => runElevated(() => 2);',
      );

      expect(run(source, MAP).rewritten).toBe(1);
    },
  );
});
