/**
 * Test preload: `[test] preload = ["@venizia/dev-configs/testing/tmpdir-preload"]` in a bunfig makes
 * a bare `bun test` keep its temp folders in the repository, like `make test` does. Bun reads only the
 * `bunfig.toml` of the folder it runs in: put the line in the `bunfig.toml` of every package that runs
 * tests, a root file does not apply to `bun test` run inside a package.
 */
import { useRepoTmp } from './repo-tmp';

useRepoTmp();
