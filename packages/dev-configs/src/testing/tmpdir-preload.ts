/**
 * Test preload: `[test] preload = ["@venizia/dev-configs/testing/tmpdir-preload"]` in a bunfig makes
 * a bare `bun test` keep its temp folders in the repository, like `make test` does. Bun reads only the
 * `bunfig.toml` of the folder it runs in, so a root file applies to a run from the root, not to `bun test`
 * run inside a package: there, pass `--preload @venizia/dev-configs/testing/tmpdir-preload` in the `test` script.
 */
import { useRepoTmp } from './repo-tmp';

useRepoTmp();
