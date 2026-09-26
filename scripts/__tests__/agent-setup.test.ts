import { afterEach, describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const REPO = resolve(import.meta.dir, '..', '..');
const AGENTS_RELATIVE = join('.agents', 'plugin', 'claude', 'agents');
const TRACKED_AGENTS = join(REPO, AGENTS_RELATIVE);

const WRITE_TOOLS = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'];
const READ_TOOLS = ['Read', 'Bash', 'Grep', 'Glob'];

/** The contract table of the framework roles: each role agent's model and exact tools. */
const ROLE_CONTRACT: Record<string, { model: string; tools: string[] }> = {
  'ignis-dev': { model: 'opus', tools: WRITE_TOOLS },
  'ignis-test': { model: 'opus', tools: WRITE_TOOLS },
  'ignis-reviewer': { model: 'opus', tools: READ_TOOLS },
  'ignis-security': { model: 'opus', tools: READ_TOOLS },
  'ignis-docs': { model: 'sonnet', tools: WRITE_TOOLS },
};
const ROLE_AGENTS = Object.keys(ROLE_CONTRACT);
/** A role never dispatches a subagent; these tools would let it. */
const DISPATCH_TOOLS = new Set(['Agent', 'Task']);
const READ_ONLY_AGENTS = ['ignis-reviewer', 'ignis-security'];

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const listAgentFiles = (opts: { dir: string }): string[] => {
  if (!existsSync(opts.dir)) {
    return [];
  }

  return readdirSync(opts.dir)
    .filter(name => name.endsWith('.md'))
    .sort();
};

const readFrontmatter = (opts: { file: string }): Record<string, unknown> => {
  const matched = readFileSync(opts.file, 'utf8').match(FRONTMATTER_PATTERN);
  if (!matched) {
    return {};
  }

  const parsed: unknown = Bun.YAML.parse(matched[1]);
  return isRecord(parsed) ? parsed : {};
};

/** Claude Code accepts `tools` as a comma-separated string or a YAML list. */
const toolsOf = (opts: { frontmatter: Record<string, unknown> }): string[] => {
  const { tools } = opts.frontmatter;
  const items = Array.isArray(tools) ? tools : typeof tools === 'string' ? tools.split(',') : [];

  return items.map(item => String(item).trim()).filter(item => item.length > 0);
};

// ---

const sandboxes: string[] = [];

/**
 * A copy of the repo layout setup needs. The copied setup resolves its root from its own location, so
 * it writes into the sandbox - never the developer's real `.claude/`. HOME points inside the sandbox
 * too, so nothing reaches the real home either.
 */
const makeSandbox = (opts: { agents: 'tracked' | Record<string, string> }): string => {
  // realpath: on macOS tmpdir() sits behind a symlink, so link targets would not compare equal.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ignis-agent-setup-')));
  sandboxes.push(root);

  mkdirSync(join(root, '.agents', 'plugin'), { recursive: true });
  mkdirSync(join(root, 'home'));
  cpSync(join(REPO, '.agents', 'plugin', 'setup.ts'), join(root, '.agents', 'plugin', 'setup.ts'));
  cpSync(join(REPO, '.agents', 'plugin', 'claude'), join(root, '.agents', 'plugin', 'claude'), {
    recursive: true,
  });
  cpSync(join(REPO, 'AGENTS.md'), join(root, 'AGENTS.md'));

  const agentsDir = join(root, AGENTS_RELATIVE);

  if (opts.agents !== 'tracked') {
    rmSync(agentsDir, { recursive: true, force: true });
    mkdirSync(agentsDir, { recursive: true });

    for (const [name, content] of Object.entries(opts.agents)) {
      writeFileSync(join(agentsDir, name), content);
    }
  }

  return root;
};

const runSetup = (opts: { root: string }): { exitCode: number; output: string } => {
  const result = Bun.spawnSync(
    ['bun', join(opts.root, '.agents', 'plugin', 'setup.ts'), 'claude'],
    {
      cwd: opts.root,
      env: { ...process.env, HOME: join(opts.root, 'home') },
      stdin: 'ignore',
    },
  );

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
};

/** Every entry in `<root>/.claude/agents`, with where it points. */
const installedAgents = (opts: {
  root: string;
}): Record<string, { symlink: boolean; target: string }> => {
  const dir = join(opts.root, '.claude', 'agents');
  if (!existsSync(dir)) {
    return {};
  }

  const out: Record<string, { symlink: boolean; target: string }> = {};

  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const symlink = lstatSync(path).isSymbolicLink();
    out[name] = { symlink, target: symlink ? realpathSync(path) : path };
  }

  return out;
};

const expectLinkedToTracked = (opts: { root: string; names: string[] }): void => {
  const installed = installedAgents({ root: opts.root });

  expect(Object.keys(installed).sort()).toEqual([...opts.names].sort());

  for (const name of opts.names) {
    const link = join(opts.root, '.claude', 'agents', name);
    const tracked = join(opts.root, AGENTS_RELATIVE, name);

    expect(installed[name]?.symlink).toBe(true);
    expect(resolve(dirname(link), readlinkSync(link))).toBe(tracked);
    expect(realpathSync(link)).toBe(realpathSync(tracked));
  }
};

const FIXTURE_AGENTS: Record<string, string> = {
  'probe-alpha.md':
    '---\nname: probe-alpha\ndescription: fixture\ntools: Read\nmodel: sonnet\n---\n\nAlpha.\n',
  'probe-beta.md':
    '---\nname: probe-beta\ndescription: fixture\ntools: Read, Bash\nmodel: opus\n---\n\nBeta.\n',
};

describe('agent setup - claude installs the tracked agents', () => {
  afterEach(() => {
    for (const directory of sandboxes.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('every file in .agents/plugin/claude/agents is linked into .claude/agents', () => {
    const root = makeSandbox({ agents: FIXTURE_AGENTS });

    const run = runSetup({ root });
    expect(run.exitCode).toBe(0);

    expectLinkedToTracked({ root, names: Object.keys(FIXTURE_AGENTS) });
  });

  test('the tracked role agents are the ones linked', () => {
    const tracked = listAgentFiles({ dir: TRACKED_AGENTS });
    expect(tracked).toEqual(expect.arrayContaining(ROLE_AGENTS.map(name => `${name}.md`)));

    const root = makeSandbox({ agents: 'tracked' });

    const run = runSetup({ root });
    expect(run.exitCode).toBe(0);

    expectLinkedToTracked({ root, names: tracked });
  });

  test('running setup twice leaves the same links', () => {
    const root = makeSandbox({ agents: FIXTURE_AGENTS });

    expect(runSetup({ root }).exitCode).toBe(0);
    const first = installedAgents({ root });

    const second = runSetup({ root });
    expect(second.exitCode).toBe(0);

    expect(installedAgents({ root })).toEqual(first);
    expectLinkedToTracked({ root, names: Object.keys(FIXTURE_AGENTS) });
  });

  test('a real file already in .claude/agents is left untouched, as for skills', () => {
    const root = makeSandbox({ agents: FIXTURE_AGENTS });
    const own = join(root, '.claude', 'agents', 'probe-alpha.md');
    mkdirSync(dirname(own), { recursive: true });
    writeFileSync(own, 'my own agent\n');

    expect(runSetup({ root }).exitCode).toBe(0);

    expect(lstatSync(own).isSymbolicLink()).toBe(false);
    expect(readFileSync(own, 'utf8')).toBe('my own agent\n');

    const beta = join(root, '.claude', 'agents', 'probe-beta.md');
    expect(existsSync(beta) && lstatSync(beta).isSymbolicLink()).toBe(true);
  });
});

describe('agent definitions - .agents/plugin/claude/agents', () => {
  test('the five role agents exist', () => {
    expect(listAgentFiles({ dir: TRACKED_AGENTS })).toEqual(
      expect.arrayContaining(ROLE_AGENTS.map(name => `${name}.md`)),
    );
  });

  const everyAgent = [
    ...new Set([
      ...ROLE_AGENTS,
      ...listAgentFiles({ dir: TRACKED_AGENTS }).map(name => basename(name, '.md')),
    ]),
  ];

  test.each(everyAgent)(
    '%s has name, description, tools and model, name matches the file, and no dispatch tool',
    agent => {
      const file = join(TRACKED_AGENTS, `${agent}.md`);
      expect(existsSync(file)).toBe(true);

      const frontmatter = readFrontmatter({ file });

      expect(frontmatter.name).toBe(agent);
      for (const key of ['description', 'model']) {
        const value = frontmatter[key];
        expect(typeof value === 'string' && value.trim().length > 0).toBe(true);
      }
      const tools = toolsOf({ frontmatter });
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.filter(tool => DISPATCH_TOOLS.has(tool))).toEqual([]);

      const contract = ROLE_CONTRACT[agent];
      if (contract) {
        expect(frontmatter.model).toBe(contract.model);
        expect(tools).toEqual(contract.tools);
      }
    },
  );

  // An omitted `tools` inherits every tool, so an empty list is as writable as one naming Edit.
  test.each(READ_ONLY_AGENTS)('%s lists neither Edit nor Write in tools', agent => {
    const file = join(TRACKED_AGENTS, `${agent}.md`);
    expect(existsSync(file)).toBe(true);

    const tools = toolsOf({ frontmatter: readFrontmatter({ file }) });

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.filter(tool => /Edit|Write/.test(tool))).toEqual([]);
  });
});
