import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { AwaitHoistAudit } from '../await-hoist-audit';

const CLI = resolve(import.meta.dir, '../await-hoist-audit.ts');
const roots: string[] = [];

const audit = (opts: { code: string; filePath?: string }) =>
  AwaitHoistAudit.auditSource({ code: opts.code, filePath: opts.filePath ?? 'src/subject.ts' });

/** `name@line reason` for every finding, so a test names the lines it expects. */
const reasonsOf = (opts: { code: string }) =>
  audit(opts).findings.map((finding) => `${finding.name}@${finding.line} ${finding.reason}`);

/** A git repository in the test temp folder (inside the repository, through the test preload). */
const makeRepository = (opts: { files: Record<string, string> }) => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-await-hoist-'));
  roots.push(root);
  for (const [path, content] of Object.entries(opts.files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  for (const command of [
    ['init', '--quiet'],
    ['add', '--all'],
  ]) {
    const run = spawnSync('git', command, { cwd: root, encoding: 'utf8' });
    if (run.status !== 0) {
      throw new Error(`git ${command.join(' ')} failed: ${run.stderr}`);
    }
  }
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** What BANA ran through `devz codemod async-style` 0.4.7-0 (issue #695). */
const BANA_INPUT = `export class Svc {
  async run(): Promise<string> {
    if (!(await this._lock({ id: 1 }))) {
      return 'BUSY';
    }

    try {
      this.log();
      return await this._compact({ id: 1 });
    } finally {
      this.unlock();
    }
  }
}
`;

/** What the codemod wrote: the \`if\` reads the name allocated for the second hoist. */
const BANA_OUTPUT = `export class Svc {
  async run(): Promise<string> {
    const lock = await this._lock({ id: 1 });
    if (!compact) {
      return 'BUSY';
    }

    try {
      this.log();
      const compact = await this._compact({ id: 1 });
      return compact;
    } finally {
      this.unlock();
    }
  }
}
`;

/** The same swap with both hoists in one block, as the issue quotes it. */
const BANA_OUTPUT_ONE_BLOCK = `export class Svc {
  async run(): Promise<string> {
    const lock = await this._lock({ id: 1 });
    if (!compact) {
      return 'BUSY';
    }
    const compact = await this._compact({ id: 1 });
    return compact;
  }
}
`;

/** What the codemod should have written. */
const BANA_CORRECT = `export class Svc {
  async run(): Promise<string> {
    const lock = await this._lock({ id: 1 });
    if (!lock) {
      return 'BUSY';
    }

    try {
      this.log();
      const compact = await this._compact({ id: 1 });
      return compact;
    } finally {
      this.unlock();
    }
  }
}
`;

describe('AwaitHoistAudit - the BANA pair', () => {
  test('the codemod output is reported as a swap and an unused hoist', () => {
    const findings = audit({ code: BANA_OUTPUT }).findings;

    expect(findings.map((finding) => `${finding.name}@${finding.line} ${finding.reason}`)).toEqual([
      'lock@3 unused',
      'lock@3 swap',
    ]);
    expect(findings[1]?.functionName).toBe('Svc.run');
    expect(findings[1]?.severity).toBe('error');
    expect(findings[1]?.detail).toContain('hoisted later at line 10');
    expect(findings[1]?.context[1]).toContain('if (!compact)');
  });

  test('the one-block form is a swap too', () => {
    expect(reasonsOf({ code: BANA_OUTPUT_ONE_BLOCK })).toEqual(['lock@3 unused', 'lock@3 swap']);
  });

  test('what the develop codemod writes for the input today: two nested `result` hoists', () => {
    const code = `export class Svc {
  async run(): Promise<string> {
    const result = await this._lock({ id: 1 });
    if (!result) {
      return 'BUSY';
    }

    try {
      this.log();
      const result = await this._compact({ id: 1 });
      return result;
    } finally {
      this.unlock();
    }
  }
}`;
    expect(reasonsOf({ code })).toEqual(['result@10 duplicate']);
  });

  test('what the develop codemod writes when both awaits sit in the try: one scope, two `result`', () => {
    const code = `export class Svc {
  async run(): Promise<string> {
    try {
      const result = await this._lock({ id: 1 });
      if (!result) {
        return 'BUSY';
      }

      this.log();
      const result = await this._compact({ id: 1 });
      return result;
    } finally {
      this.unlock();
    }
  }
}`;
    expect(reasonsOf({ code })).toEqual(['result@4 duplicate', 'result@10 duplicate']);
  });

  test('the input and the correct output are clean', () => {
    expect(audit({ code: BANA_INPUT }).findings).toEqual([]);
    expect(audit({ code: BANA_CORRECT }).findings).toEqual([]);
  });
});

describe('AwaitHoistAudit - each pattern is reported', () => {
  test('shadow: an inner hoist read twice, where the second read meant the outer name', () => {
    const code = `async function load(id: string) {
  const result = await fetchUser(id);
  if (result.active) {
    const result = await fetchOrders(id);
    return merge(result, result);
  }
  return result;
}`;
    expect(reasonsOf({ code })).toEqual(['result@4 shadow', 'result@4 duplicate']);
  });

  test('shadow: a read of the name before the inner declaration (TDZ)', () => {
    const code = `async function load(id: string) {
  const result = await fetchUser(id);
  {
    log(result);
    const result = await fetchOrders(id);
    use(result);
  }
  return result;
}`;
    const findings = audit({ code }).findings;

    expect(findings[0]?.reason).toBe('shadow');
    expect(findings[0]?.detail).toContain('1 read(s) before this declaration (TDZ)');
  });

  test('shadow: an inner hoist over a parameter of the same function', () => {
    const code = `async function scale(value: number) {
  if (value > 0) {
    const value = await compute();
    return value + value;
  }
  return value;
}`;
    expect(reasonsOf({ code })).toEqual(['value@3 shadow']);
  });

  test('shadow: a callback hoist read twice over a name of the function around it (review)', () => {
    const code = `async function each(items: string[]) {
  const result = await first();
  await Promise.all(
    items.map(async (item) => {
      const result = await load(item);
      return merge(result, result);
    }),
  );
  return result;
}`;
    const findings = audit({ code }).findings;

    expect(findings.map((finding) => `${finding.name}@${finding.line} ${finding.reason}`)).toEqual([
      'result@5 shadow',
    ]);
    expect(findings[0]?.severity).toBe('review');
    expect(findings[0]?.detail).toContain('of an enclosing function');
  });

  test('duplicate: two nested await hoists under one renamed name', () => {
    const code = `async function pick() {
  const user = await getUser();
  if (user.isAdmin) {
    const user = await getAdmin();
    return user;
  }
  return user;
}`;
    expect(reasonsOf({ code })).toEqual(['user@4 duplicate']);
  });

  test('duplicate: one scope declares the name twice', () => {
    const code = `async function twice() {
  const result = await first();
  const result = await second();
  return result;
}`;
    expect(reasonsOf({ code })).toEqual(['result@2 duplicate', 'result@3 duplicate']);
  });

  test('unused: a hoist nothing reads', () => {
    const code = `async function drop() {
  const result = await run();
  return 1;
}`;
    expect(reasonsOf({ code })).toEqual(['result@2 unused']);
  });

  test('multi-use: a fixer name read by its next statement and again, beside its pair (review)', () => {
    const code = `async function both() {
  const result = await first();
  const result2 = await second();
  use(result2);
  return result2.id + result.id;
}`;
    const findings = audit({ code }).findings;

    expect(findings.map((finding) => `${finding.name}@${finding.line} ${finding.reason}`)).toEqual([
      'result2@3 multi-use',
    ]);
    expect(findings[0]?.severity).toBe('review');
  });

  test('swap: the next statement reads an enclosing hoist instead of its own', () => {
    const code = `async function nested(flag: boolean) {
  const result = await first();
  if (flag) {
    const result2 = await second();
    use(result);
  }
  return result;
}`;
    // the outer `result` is read by the `if` and by the `return`, beside its pair: a review as well
    expect(reasonsOf({ code })).toEqual([
      'result@2 multi-use',
      'result2@4 unused',
      'result2@4 swap',
    ]);
  });

  test('swap: two fixer names already in scope, swapped in a way that compiles (review)', () => {
    const code = `async function swapped() {
  const result = await g();
  const result2 = await k();
  const x = h(result);
  return result2 + x;
}`;
    const findings = audit({ code }).findings;

    expect(findings.map((finding) => `${finding.name}@${finding.line} ${finding.reason}`)).toEqual([
      'result2@3 swap',
    ]);
    expect(findings[0]?.severity).toBe('review');
  });
});

describe('AwaitHoistAudit - clean code is not reported', () => {
  const clean: Record<string, string> = {
    'a hoist read by its next statement': `async function f() {
  const result = await load();
  use(result);
}`,
    'a hoist in each of two sibling blocks': `async function f(flag: boolean) {
  if (flag) {
    const result = await first();
    use(result);
  } else {
    const result = await second();
    use(result);
  }
}`,
    'a hoist inside a loop body': `async function f(items: string[]) {
  for (const item of items) {
    const result = await load(item);
    use(result);
  }
  for (let index = 0; index < items.length; index++) {
    const value = await load(items[index]);
    use(value);
  }
}`,
    'two awaited declarations read later': `async function f() {
  const user = await getUser();
  const organization = await getOrganization();
  return [user, organization];
}`,
    'an awaited value read several times': `async function f() {
  const response = await request();
  expect(response.status).toBe(200);
  const result = await response.json();
  return [response.headers, result];
}`,
    'a hoist in a try block': `async function f() {
  try {
    const result = await run();
    return result;
  } finally {
    done();
  }
}`,
    'an exported top-level await': `export const settings = await loadSettings();`,
    'a name of an enclosing scope declared after the block': `async function f(flag: boolean) {
  if (flag) {
    const rows = await first();
    return rows.length + rows.at(0);
  }
  const rows = await second();
  return rows.length;
}`,
    'a shadowing hoist whose only read is its own site': `async function f(data: string) {
  if (data) {
    const data = await load();
    return data;
  }
  return data;
}`,
    'the same name in a nested function': `async function f() {
  const result = await load();
  const run = async () => {
    const result = await other();
    return result;
  };
  return [result, run];
}`,
  };

  for (const [label, code] of Object.entries(clean)) {
    test(label, () => {
      expect(audit({ code }).findings).toEqual([]);
    });
  }

  test('a tsx file with JSX parses', () => {
    const code = `export const View = async () => {
  const result = await load();
  return <div>{result}</div>;
};`;
    expect(audit({ code, filePath: 'src/view.tsx' })).toEqual({ findings: [], hoistCount: 1 });
  });

  test('a file that does not parse is a failure, not a clean file', () => {
    const result = audit({ code: 'async function f( { await' });

    expect(result.findings).toEqual([]);
    expect(result.failure?.file).toBe('src/subject.ts');
  });
});

describe('AwaitHoistAudit - repository and CLI', () => {
  test('lists tracked TypeScript files and skips dependencies, build output, generated code and fixtures', () => {
    const root = makeRepository({
      files: {
        'src/a.ts': 'export const a = 1;',
        'src/b.tsx': 'export const b = 1;',
        'src/c.mts': 'export const c = 1;',
        'src/types.d.ts': 'export type T = 1;',
        'src/readme.md': '',
        'dist/a.ts': '',
        'src/generated/a.ts': '',
        'test/fixtures/a.ts': '',
        'packages/x/node_modules/y/index.ts': '',
      },
    });

    expect(AwaitHoistAudit.listFiles({ root }).sort()).toEqual([
      'src/a.ts',
      'src/b.tsx',
      'src/c.mts',
    ]);
  });

  test('the CLI exits 1 on the BANA output and 0 on clean code; --json carries every finding', () => {
    const dirty = makeRepository({ files: { 'src/service.ts': BANA_OUTPUT } });
    const clean = makeRepository({ files: { 'src/service.ts': BANA_CORRECT } });

    const dirtyRun = spawnSync('bun', [CLI, dirty, '--json'], { encoding: 'utf8' });
    const cleanRun = spawnSync('bun', [CLI, clean], { encoding: 'utf8' });
    const report = JSON.parse(dirtyRun.stdout);

    expect(dirtyRun.status).toBe(1);
    expect(report.summary).toEqual({ shadow: 0, duplicate: 0, unused: 1, 'multi-use': 0, swap: 1 });
    expect(report.repositories[0].findings[1]).toMatchObject({
      file: 'src/service.ts',
      line: 3,
      column: 11,
      name: 'lock',
      reason: 'swap',
    });
    expect(cleanRun.status).toBe(0);
    // the clean run still looked at the two hoists
    expect(cleanRun.stdout).toContain('1 files, 2 await declarators, 0 finding(s), 0 unparsed');
  });

  test('the CLI refuses no root and an unknown flag', () => {
    expect(spawnSync('bun', [CLI], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync('bun', [CLI, '.', '--fix'], { encoding: 'utf8' }).status).toBe(2);
  });
});
