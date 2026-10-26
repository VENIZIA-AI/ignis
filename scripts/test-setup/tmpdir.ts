/**
 * Bun test preload: a test run keeps its temp folders and Node's compile cache inside the
 * repository, as the root Makefile does for `make`. It covers a bare `bun test`, where nothing
 * exported TMPDIR. `os.tmpdir()` reads TMPDIR when it is called, so setting it here is early enough,
 * and child processes inherit it. Wired in by `[test] preload` in bunfig.toml (root and packages).
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dir, '../..');

process.env.TMPDIR = join(repositoryRoot, '.agents/local/tmp');
process.env.NODE_COMPILE_CACHE = join(repositoryRoot, '.agents/local/cache/node-compile');
mkdirSync(process.env.TMPDIR, { recursive: true });
