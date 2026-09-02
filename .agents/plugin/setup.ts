#!/usr/bin/env bun
/**
 * Per-developer agent setup: tool file -> tracked AGENTS.md symlink, tracked skills -> agent skills
 * dir, and for Claude the shared `.agents/plugin/claude/settings.json` merged into `.claude/settings.json`.
 * All targets are gitignored, so run it on every clone: `bun .agents/plugin/setup.ts [claude]`.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..');
const SKILLS_SRC = join(ROOT, '.agents', 'plugin', 'skills');
const CLAUDE_SETTINGS_SRC = join(ROOT, '.agents', 'plugin', 'claude', 'settings.json');
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '';

type TDict = Record<string, unknown>;

const isDict = (value: unknown): value is TDict => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/** Object-of-entries keys: shared wins entry by entry, so a developer's own `permissions.allow` survives a shared `permissions.deny`. */
const MERGE_ONE_LEVEL = ['permissions', 'hooks', 'enabledPlugins', 'env'];

type Agent = {
  key: string;
  label: string;
  toolFile: string; // filename that symlinks to AGENTS.md; "" means the tool reads AGENTS.md natively
  skillsDir: string | null; // where to install skills; null = no Claude-compatible skill dir
  note?: string;
};

const AGENTS: Agent[] = [
  { key: 'claude', label: 'Claude Code', toolFile: 'CLAUDE.md', skillsDir: join(ROOT, '.claude', 'skills') },
  {
    key: 'gemini',
    label: 'Gemini CLI',
    toolFile: 'GEMINI.md',
    skillsDir: null,
    note: 'Gemini reads GEMINI.md; the skills here are Claude-format, so they are not installed.',
  },
  {
    key: 'cursor',
    label: 'Cursor',
    toolFile: '',
    skillsDir: null,
    note: 'Cursor reads AGENTS.md natively - no tool file needed.',
  },
  {
    key: 'codex',
    label: 'Codex CLI',
    toolFile: '',
    skillsDir: null,
    note: 'Codex reads AGENTS.md natively - no tool file needed.',
  },
  { key: 'other', label: 'Other (enter the filename)', toolFile: '?', skillsDir: null },
];

// ---

const green = (value: string): string => `\x1b[32m${value}\x1b[0m`;
const dim = (value: string): string => `\x1b[2m${value}\x1b[0m`;
const bold = (value: string): string => `\x1b[1m${value}\x1b[0m`;

const isSymlink = (opts: { path: string }): boolean => {
  try {
    return lstatSync(opts.path).isSymbolicLink();
  } catch {
    // Nothing at this path - not a symlink. Nothing to report.
    return false;
  }
};

/** Replaces an existing symlink, never a real file - a hand-written CLAUDE.md must survive. */
const linkSafely = (opts: { linkPath: string; target: string }): 'created' | 'relinked' | 'skipped-realfile' => {
  const { linkPath, target } = opts;

  const existingSymlink = isSymlink({ path: linkPath });

  // existsSync follows symlinks, so a broken symlink reads as absent - check both.
  if (existsSync(linkPath) || existingSymlink) {
    if (!existingSymlink) {
      return 'skipped-realfile';
    }

    rmSync(linkPath);
    symlinkSync(target, linkPath);

    return 'relinked';
  }

  symlinkSync(target, linkPath);

  return 'created';
};

/** Skills may be grouped into discipline subfolders; a skill is any dir holding a SKILL.md. */
const findSkillDirs = (opts: { dir: string }): string[] => {
  const { dir } = opts;

  if (!existsSync(dir)) {
    return [];
  }

  const out: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const full = join(dir, entry.name);

    if (existsSync(join(full, 'SKILL.md'))) {
      out.push(full);
      continue;
    }

    out.push(...findSkillDirs({ dir: full })); // recurse into group folders
  }

  return out;
};

const installSkills = (opts: { skillsDir: string }): number => {
  const { skillsDir } = opts;

  const sources = findSkillDirs({ dir: SKILLS_SRC });
  if (!sources.length) {
    return 0;
  }

  mkdirSync(skillsDir, { recursive: true });

  let count = 0;

  // Skills link in flat (Claude Code discovers `<skillsDir>/<name>/SKILL.md`), even when the
  // source is grouped by discipline under `.agents/plugin/skills/<group>/`.
  for (const source of sources) {
    const result = linkSafely({ linkPath: join(skillsDir, basename(source)), target: resolve(source) });

    if (result === 'skipped-realfile') {
      console.log(`  ${dim('!')} skill ${basename(source)} exists as a real directory - left untouched.`);
      continue;
    }

    count++;
  }

  return count;
};

/** Shared entries always win; a settings file that is not valid JSON is reported and left alone. */
const installClaudeSettings = (): { ok: boolean; message: string } => {
  if (!existsSync(CLAUDE_SETTINGS_SRC)) {
    return { ok: true, message: 'no shared Claude settings to install' };
  }

  const shared = JSON.parse(readFileSync(CLAUDE_SETTINGS_SRC, 'utf8')) as TDict;
  const targetDir = join(ROOT, '.claude');
  const target = join(targetDir, 'settings.json');

  let current: TDict = {};
  if (existsSync(target)) {
    try {
      current = JSON.parse(readFileSync(target, 'utf8')) as TDict;
    } catch (error) {
      return {
        ok: false,
        message: `${target.replace(HOME, '~')} is not valid JSON - left untouched (${String(error)}). Fix it, then re-run setup.`,
      };
    }
  }

  const merged: TDict = { ...current };
  for (const [key, sharedValue] of Object.entries(shared)) {
    const mine = current[key];
    merged[key] =
      MERGE_ONE_LEVEL.includes(key) && isDict(mine) && isDict(sharedValue)
        ? { ...mine, ...sharedValue }
        : sharedValue;
  }

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`);

  const hookEvents = Object.keys(isDict(shared.hooks) ? shared.hooks : {});

  return {
    ok: true,
    message: `.claude/settings.json updated - hooks: ${hookEvents.join(', ') || 'none'}`,
  };
};

const pickAgent = async (opts: { argv: string[] }): Promise<Agent> => {
  const fromArg = opts.argv[0]?.toLowerCase();

  if (fromArg) {
    const found = AGENTS.find((agent) => agent.key === fromArg);
    if (found) {
      return found;
    }

    console.error(`Unknown agent "${fromArg}". Options: ${AGENTS.map((agent) => agent.key).join(', ')}`);
    process.exit(1);
  }

  console.log(bold('\nWhich agent are you setting up?\n'));
  AGENTS.forEach((agent, index) => {
    console.log(`  ${green(String(index + 1))}) ${agent.label} ${dim(agent.note ?? '')}`);
  });

  const answer = (prompt('\nEnter a number') ?? '1').trim();
  const index = Number(answer) - 1;

  if (Number.isNaN(index) || index < 0 || index >= AGENTS.length) {
    console.error('Invalid choice.');
    process.exit(1);
  }

  return AGENTS[index];
};

// ---

const agent = await pickAgent({ argv: process.argv.slice(2) });
console.log(`\n${bold(`Setting up: ${agent.label}`)}\n`);

// 1. Tool file -> AGENTS.md symlink
let toolFile = agent.toolFile;
if (toolFile === '?') {
  toolFile = (prompt('Tool file name to link to AGENTS.md (e.g. CLAUDE.md)') ?? '').trim();
}

if (toolFile) {
  // Relative target so the link survives the repo being cloned anywhere.
  const result = linkSafely({ linkPath: join(ROOT, toolFile), target: 'AGENTS.md' });

  switch (result) {
    case 'skipped-realfile': {
      console.log(`  ${dim('!')} ${toolFile} already exists as a real file - left untouched.`);
      console.log(`  ${dim(' ')} Delete it and re-run if you want it to track AGENTS.md.`);
      break;
    }

    case 'relinked': {
      console.log(`  ${green('✓')} ${toolFile} -> AGENTS.md (relinked)`);
      break;
    }

    default: {
      console.log(`  ${green('✓')} ${toolFile} -> AGENTS.md`);
      break;
    }
  }
} else {
  console.log(`  ${green('✓')} ${agent.label} reads AGENTS.md directly - no tool file needed.`);
}

// 2. Skills
if (agent.skillsDir) {
  const count = installSkills({ skillsDir: agent.skillsDir });

  if (count) {
    console.log(`  ${green('✓')} ${count} skill(s) linked into ${agent.skillsDir.replace(HOME, '~')}`);
  } else {
    console.log(`  ${dim('!')} no skills found in .agents/plugin/skills - nothing to link.`);
  }
} else if (agent.note) {
  console.log(`  ${dim('!')} ${agent.note}`);
}

// 3. Shared Claude settings - the session hook that prints the rules. `.claude/` is gitignored, so
//    the shared keys are merged into each person's file and anything personal is left alone.
if (agent.key === 'claude') {
  const { ok, message } = installClaudeSettings();
  console.log(`  ${ok ? green('✓') : dim('!')} ${message}`);
}

console.log(
  `\n${green('Done.')} Your agent now reads the project's AGENTS.md, rules and knowledge bundle.\n`,
);
