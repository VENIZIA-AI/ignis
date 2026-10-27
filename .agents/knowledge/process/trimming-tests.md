---
type: Playbook
title: Trimming tests
description: How to remove tests without losing coverage - measure, classify, prove each deletion with a mutation, delete, re-measure; the four devz check tools and the baseline of IGNIS 0.4.4.
resource: packages/dev-configs/src/checks/test-mutate.ts
tags: [process, test, mutation, devz]
---

## When to use it

You want fewer or faster tests and you must not lose coverage. The rule: **a test is deleted only when a named surviving test goes red under the same break**, shown by a mutation. A test that cannot be shown redundant stays. The positive controls of every gate stay in any case (step 6).

The tools are `devz check` commands of `@venizia/dev-configs` (Bun-only), so a repository other than IGNIS runs the same steps.

## Steps

1. **Measure.** Per package, with JUnit output, and the CI step times:

   ```bash
   cd packages/<pkg> && NODE_ENV=test bun test ./src --parallel \
     --reporter=junit --reporter-outfile=<repo>/.agents/local/tmp/<pkg>.xml
   gh run view <run id> --json jobs      # step durations of a CI run
   devz check test-weight .agents/local/tmp/*.xml
   ```

   `test-weight` prints totals, time per package, the heaviest files, how many files hold 80% of the time, files under 100 ms, the same suite and case name in more than one file, files with zero assertions, and skips. A `--parallel` run times every file under contention (16 workers): a file that shows 7 s there can take 1.2 s alone. Re-time any suspect file alone (`bun test <file>`) before judging it.
2. **Classify the candidates** into five kinds:
   - (a) duplicates: the same suite and name in two files, or two files covering the same lines (coverage prefilter, step 3);
   - (b) tests pinned to internals, and **type-only placeholders** (`@ts-expect-error` followed by `expect(true).toBe(true)`: the type check already catches them). `as never`, `as any`, `spyOn` and `toHaveBeenCalledTimes` counts are signals to read, not verdicts; `readFileSync` of a `.ts` file is a poor signal (gates read `dist` on purpose);
   - (c) slow tests, from the alone-timings (real timers and spawned processes are the usual cause);
   - (d) flaky tests (an assertion on wall-clock time or process-wide memory);
   - (e) dead test code: `devz check test-dead-code` lists support files under `__tests__` that no other file refers to by name or by path. They are candidates: delete one, run the package suite, keep it if anything fails or loads it by a path built at run time.
3. **Coverage prefilter.** Run the candidate and its proposed survivor with `bun test --coverage --coverage-reporter=lcov --coverage-dir=<scratch>`; the candidate's covered lines should be a subset of the survivor's. In the lcov a package's own sources appear as `src/...ts` and a sibling package as `../<pkg>/dist/esm/....js`: compare like with like. This only nominates candidates.
4. **Mutation proof, one ledger line per deletion.** Write `{ candidate, survivor, mutant }` and replay it:

   ```bash
   devz check test-mutate .agents/local/tmp/ledger.json
   ```

   The mutant is a textual edit (`find` occurs exactly once, `replace`). The file it edits depends on how the test reaches the code:
   - a test that imports its package through the `@/` alias runs that package's `src`: edit the `src` file;
   - a test in package B that reaches package A resolves A through its `exports`, which point at `dist/esm`: edit A's `dist` file. No rebuild: `make <pkg>` rebuilds every dependency first;
   - one break that two tests see through different files is an array of edits applied together.

   The replay saves each file with a checksum, applies the edits, runs `bun test` for the survivor and for the candidate (`-t <name>` limits it to one case), restores, and verifies the restore. A name that matches no case, a `find` that occurs twice, or a leftover backup from an interrupted run stops the replay. Required: the **survivor goes red**. The candidate should go red too; if it stays green under the mutant, add a `secondMutant`; if it stays green under that too, the candidate checks nothing about that code: write `"expectCandidate": "vacuous"`. A type-level test cannot go red under bun; its proof is `make typecheck` failing under a type mutant.

   ```json
   { "mutants": [ {
       "id": "message-template-missing-keys",
       "candidate": "packages/kernel/src/__tests__/middlewares/error-envelope.test.ts",
       "candidateName": "fills every occurrence of a key, and reports each missing key once",
       "survivor": "packages/inversion/src/__tests__/error-filled-text.test.ts",
       "survivorName": "fills every occurrence of a key, and reports each missing key once",
       "srcLine": "packages/inversion/src/modules/error/message-template.ts:23",
       "mutant": [
         { "file": "packages/inversion/src/modules/error/message-template.ts", "find": "missing.add(key);", "replace": "" },
         { "file": "packages/inversion/dist/esm/modules/error/message-template.js", "find": "missing.add(key);", "replace": "" }
       ]
   } ] }
   ```

   Replayed on 2026-10-28: `ok   message-template-missing-keys: survivor red, candidate red`, and `git status` clean afterwards. That is the model line for a cross-package duplicate.
5. **Delete, re-measure, report.** One pull request per package or per kind. It carries the ledger lines, and the before and after numbers of its package. Update every citation of a removed test path in `.agents/knowledge` and `docs/wiki/content` (rule P-03); `git grep` for the old path must find nothing.
6. **Keep the controls.** A positive control is a test that proves a gate can fail. `scripts/checks/controls.json` lists them as `{ gate, file, titlePattern, min }`, where `titlePattern` is a regular expression over the suite and case titles of that file and `min` is how many must match. `make controls-check` (`devz check test-controls scripts/checks/controls.json`) fails when one is gone or renamed; it reads the files, it runs nothing. A change that adds a control to a gate adds its line.

## Baseline - IGNIS 0.4.4 (develop `439f3f0d`, 2026-10-28)

| What | Value |
|---|---|
| Test files, cases, assertions (8 packages; `filter` has none) | 544, 7,047, 135,238 |
| Local wall time of the suites (`make test-<pkg>`) | about 52 s: helpers 4.7, kernel 17.1, connectors 12.9, core-server 8.5, core-worker 5.7, dev-configs 1.8, boot 1.3, inversion 0.1 |
| CI job "Build, test and lint" (run 40438119743) | 291 s: Build 93, tests 86 (kernel 18, connectors 33, core-server 16, core-worker 9, helpers 7), Lint 27, Clean install 35, Examples type-check 25, Preset smoke 12 |
| Files under 100 ms | 236 of 544, together 3.2% of the time |
| Largest single item | `kernel/events/event-bus.test.ts`: 17.0 s alone, real timers |

What the baseline teaches: deleting cheap tests does not speed CI (half the files cost 3.2% of the time); a file that looks slow in the parallel run may be contention, so re-time it alone; the time is in a few files with real timers and spawned processes.

## Related

- [Testing](/process/testing.md)
- [Debugging](/process/debugging.md)
