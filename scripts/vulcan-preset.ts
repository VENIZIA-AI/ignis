/**
 * Writes the publishable VULCAN preset of @venizia/ignis. The template in
 * presets/ignis names its dependencies the way package.json does
 * (`workspace:*`, `catalog:`); this resolves each to the exact workspace version and the root
 * catalog range, read from disk at call time, and writes packages/core-server/dist/vulcan-preset.
 * Usage: bun scripts/vulcan-preset.ts
 */
import { Glob } from 'bun';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const TEMPLATE_FOLDER = 'presets/ignis';
const OUTPUT_FOLDER = 'packages/core-server/dist/vulcan-preset';
const DEPENDENCY_BLOCKS = ['dependencies', 'devDependencies', 'peers'];
const CATALOG_MARKER = 'catalog:';
const WORKSPACE_MARKER = 'workspace:';
const FILES_FOLDER = 'files';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = (opts: { file: string }): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync(opts.file, 'utf8'));

  if (!isRecord(parsed)) {
    throw new Error(`[readJson] ${opts.file} is not a JSON object`);
  }

  return parsed;
};

const toStringRecord = (opts: { value: unknown }): Record<string, string> =>
  isRecord(opts.value)
    ? Object.fromEntries(
        Object.entries(opts.value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

/** The catalog of the root manifest, top level or inside object-form `workspaces`. */
const readCatalog = (opts: { manifest: Record<string, unknown> }): Record<string, string> => ({
  ...(isRecord(opts.manifest.workspaces)
    ? toStringRecord({ value: opts.manifest.workspaces.catalog })
    : {}),
  ...toStringRecord({ value: opts.manifest.catalog }),
});

/** The workspace globs of the root manifest, array form or `{ packages }` form. */
const readWorkspaceGlobs = (opts: { manifest: Record<string, unknown> }): string[] => {
  const { workspaces } = opts.manifest;
  const globs = Array.isArray(workspaces)
    ? workspaces
    : isRecord(workspaces) && Array.isArray(workspaces.packages)
      ? workspaces.packages
      : [];

  return globs.filter((glob): glob is string => typeof glob === 'string');
};

/** Package name to the version in its package.json, for every workspace package. */
const readWorkspaceVersions = (opts: {
  root: string;
  manifest: Record<string, unknown>;
}): Map<string, string> => {
  const versions = new Map<string, string>();

  for (const glob of readWorkspaceGlobs({ manifest: opts.manifest })) {
    for (const file of new Glob(`${glob}/package.json`).scanSync({ cwd: opts.root })) {
      const { name, version } = readJson({ file: join(opts.root, file) });

      if (typeof name === 'string' && typeof version === 'string') {
        versions.set(name, version);
      }
    }
  }

  return versions;
};

const resolveRange = (opts: {
  name: string;
  range: string;
  catalog: Record<string, string>;
  versions: Map<string, string>;
}): string => {
  const { name, range } = opts;

  if (range === CATALOG_MARKER) {
    const resolved = opts.catalog[name];

    if (resolved === undefined) {
      throw new Error(
        `[buildPreset] ${name} is "${CATALOG_MARKER}" but the root catalog has no entry for it`,
      );
    }

    return resolved;
  }

  if (range.startsWith(WORKSPACE_MARKER)) {
    const resolved = opts.versions.get(name);

    if (resolved === undefined) {
      throw new Error(`[buildPreset] ${name} is "${range}" but no workspace package has that name`);
    }

    return resolved;
  }

  return range;
};

export interface IBuildPresetResult {
  written: string[];
  /** One `name: marker -> value` line per dependency a marker was resolved for. */
  resolved: string[];
}

export const buildPreset = (opts: { root: string; outDir: string }): IBuildPresetResult => {
  const templateDir = join(opts.root, TEMPLATE_FOLDER);
  const manifest = readJson({ file: join(opts.root, 'package.json') });
  const catalog = readCatalog({ manifest });
  const versions = readWorkspaceVersions({ root: opts.root, manifest });
  const template = readJson({ file: join(templateDir, 'preset.json') });
  const resolved: string[] = [];
  const preset: Record<string, unknown> = { ...template, files: `./${FILES_FOLDER}` };

  for (const block of DEPENDENCY_BLOCKS) {
    preset[block] = Object.fromEntries(
      Object.entries(toStringRecord({ value: template[block] })).map(([name, range]) => {
        const value = resolveRange({ name, range, catalog, versions });

        if (value !== range) {
          resolved.push(`${name}: ${range} -> ${value}`);
        }

        return [name, value];
      }),
    );
  }

  rmSync(opts.outDir, { recursive: true, force: true });
  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, 'preset.json'), `${JSON.stringify(preset, null, 2)}\n`);
  cpSync(join(templateDir, FILES_FOLDER), join(opts.outDir, FILES_FOLDER), { recursive: true });

  const copied = [
    ...new Glob('**/*').scanSync({ cwd: join(opts.outDir, FILES_FOLDER), dot: true }),
  ];

  return { written: ['preset.json', ...copied.map(path => join(FILES_FOLDER, path))], resolved };
};

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  const outDir = join(root, OUTPUT_FOLDER);
  const { written, resolved } = buildPreset({ root, outDir });

  for (const line of resolved) {
    console.log(`  ${line}`);
  }

  console.log(`vulcan-preset: wrote ${written.length} files to ${relative(root, outDir)}`);
}
