#!/usr/bin/env bun
/**
 * Interactive per-developer agent setup for the IGNIS repo.
 *
 * Two things a fresh clone needs before an AI agent understands the project:
 *   1. A tool file (CLAUDE.md, GEMINI.md, ...) symlinked to the single tracked AGENTS.md,
 *      because most agents read their own filename, not AGENTS.md. These files are gitignored,
 *      so each developer creates their own here.
 *   2. The project skills, symlinked from the tracked `.agents/plugin/skills/` into the agent's
 *      skills directory (also gitignored).
 *
 * The repo stays agent-agnostic: AGENTS.md is the only tracked instruction file, and nothing
 * here assumes a particular vendor.
 *
 * Usage:
 *   bun .agents/plugin/setup.ts            # interactive - pick your agent
 *   bun .agents/plugin/setup.ts claude     # non-interactive
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..');
const SKILLS_SRC = join(ROOT, '.agents', 'plugin', 'skills');
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '';

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

/**
 * Create a symlink at `linkPath` pointing to `target`, replacing an existing symlink but never a
 * real file - a developer who keeps a hand-written CLAUDE.md must not lose it.
 */
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

console.log(`\n${green('Done.')} Your agent now reads the project's AGENTS.md and knowledge bundle.\n`);
