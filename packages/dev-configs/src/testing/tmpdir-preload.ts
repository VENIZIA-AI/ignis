/**
 * Test preload: `[test] preload = ["@venizia/dev-configs/testing/tmpdir-preload"]` in a bunfig makes
 * a bare `bun test` keep its temp folders in the repository, like `make test` does.
 */
import { useRepoTmp } from './repo-tmp';

useRepoTmp();
