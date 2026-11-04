---
title: "@venizia/dev-configs/checks"
description: "Every export of @venizia/dev-configs/checks, from the built declarations (generated)."
---

# `@venizia/dev-configs/checks`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

37 exports, 37 with TSDoc.

## `CatalogCheck`

*class*

Checks that `catalog:` references and version ranges in package manifests agree with the root `workspaces.catalog`.

```ts
export declare class CatalogCheck {
    /** Reads the root catalog and every manifest the options name, and reports everything wrong with their ranges. */
    static find(opts?: ICatalogOptions): Promise<ICatalogReport>;
}
```

Source: `packages/dev-configs/src/checks/catalog.ts`

## `DeadTestCodeCheck`

*class*

Finds support files under `__tests__` (fixtures, helpers) that no tracked file refers to, using `git grep` in the given repository.

```ts
export declare class DeadTestCodeCheck {
    static find(opts: {
        root: string;
    }): IDeadTestCodeCandidate[];
}
```

Source: `packages/dev-configs/src/checks/test-dead-code.ts`

## `GLOBAL_PATTERNS`

*const*

Node globals survive verbatim into a `target: 'browser'` bundle, so a gate reading only module
specifiers reports clean on `process.env.NODE_ENV`. Each pattern must be anchored: a bundle
legitimately contains identifiers like `processQueue`. A lookbehind that rejects a preceding dot
also rejects `globalThis.process`, so every access path needs its own pattern.

`severity` separates a read that throws from one that cannot. Optional chaining is not itself the
difference: `process?.env` throws a ReferenceError when `process` is a free identifier, while
`globalThis.process?.env` is an ordinary property read on an object that always exists.

`guarded` means "reported, never fatal". Bare `process?.` sits there because this probe matches
bundled text and has no scope information: hono's `getColorEnabled` writes
`const { process, Deno } = globalThis;` and then `process?.env`, which is a local binding and
perfectly safe, and no regex can tell that apart from a free global. Failing on it would make the
gate cry wolf on a dependency; the unguarded `process.` and `globalThis.process.` forms stay
fatal, and those are the ones that are unambiguously browser-breaking.

Exported for `probe.test.ts` to assert against directly, alongside {@link PurityProbe.stripBundlerPathComments}.

```ts
export declare const GLOBAL_PATTERNS: Array<{
    name: string;
    pattern: RegExp;
    severity: TProbeSeverity;
}>;
```

Source: `packages/dev-configs/src/checks/purity/probe.ts`

## `ICatalogOptions`

*interface*

Options of `CatalogCheck.find`: which manifests to check besides the workspace packages' `package.json`, and how presets and pinned files are treated.

```ts
export interface ICatalogOptions {
    /**
     * The repository root: where the root `package.json` and the globs resolve.
     *
     * @default process.cwd()
     */
    root?: string;
    /**
     * Manifests to check, beside the workspace packages' `package.json`. A glob relative to the root.
     *
     * @default []
     */
    globs?: string[];
    /**
     * Files that are not published manifests but carry `dependencies` and `devDependencies` the
     * release resolves (a VULCAN preset): `catalog:` is allowed in their `peerDependencies`, because a
     * library preset gives one name one catalog range. A file belongs here when its path starts with
     * this prefix, for example `presets/`.
     */
    presetPrefix?: string;
    /**
     * Manifests outside the workspace (a wiki with its own lockfile): `catalog:` does not resolve
     * there, so a catalogued dependency must be pinned to exactly the catalog's version instead.
     *
     * @default []
     */
    pinned?: string[];
}
```

Source: `packages/dev-configs/src/checks/catalog.ts`

## `ICatalogProblem`

*interface*

Guards dependency versions against the root `workspaces.catalog`.

A catalogued dep is referenced as `catalog:` and resolved at publish time by `bun publish`, which
substitutes the real range while packing. `npm publish` does NOT - it ships `catalog:` verbatim
and the manifest is unresolvable for every consumer, which is how 0.1.1-9 / -6 / -4 broke.

```ts
export interface ICatalogProblem {
    file: string;
    message: string;
}
```

Source: `packages/dev-configs/src/checks/catalog.ts`

## `ICatalogReport`

*interface*

Result of `CatalogCheck.find`: every problem found, how many catalog entries exist and how many a manifest references.

```ts
export interface ICatalogReport {
    problems: ICatalogProblem[];
    entries: number;
    referenced: number;
    /** Set when there is no `workspaces.catalog` to check against. */
    noCatalog: boolean;
}
```

Source: `packages/dev-configs/src/checks/catalog.ts`

## `IControlEntry`

*interface*

A positive control is a test that proves a gate can fail: a fixture that must be refused, a broken
subject the check must catch. Deleting one makes the gate pass for the wrong reason, so the trim-tests
method keeps a committed registry of them and fails when one disappears.

```ts
export interface IControlEntry {
    /** The gate the control belongs to; reported with a failure. */
    gate: string;
    /** Repository-relative path of the test file. */
    file: string;
    /**
     * `test`: `file` is a test file and `titlePattern` is matched against its titles.
     * `file`: `file` is a NEGATIVE FIXTURE, a file a test needs to be absent from the result (a class the
     * scanner must ignore). It only has to exist: without it the test's "not found" assertion passes for the
     * wrong reason.
     *
     * @default 'test'
     */
    kind?: 'test' | 'file';
    /** A regular expression matched against the TITLES (suite and case) in that file. Not used by `file` entries. */
    titlePattern?: string;
    /**
     * At least this many titles must match.
     *
     * @default 1
     */
    min?: number;
}
```

Source: `packages/dev-configs/src/checks/test-controls.ts`

## `IControlProblem`

*interface*

One registry entry that failed its check, with the reason.

```ts
export interface IControlProblem {
    entry: IControlEntry;
    message: string;
}
```

Source: `packages/dev-configs/src/checks/test-controls.ts`

## `IControlsReport`

*interface*

Result of `TestControlsCheck.run`: how many registry entries were checked and which failed.

```ts
export interface IControlsReport {
    checked: number;
    problems: IControlProblem[];
}
```

Source: `packages/dev-configs/src/checks/test-controls.ts`

## `IDeadTestCodeCandidate`

*interface*

Support files of the tests (fixtures, helpers, probes) that no other file refers to. The second
step of the trim-tests method. The output is CANDIDATES: a fixture can be loaded by a path built at
run time or by scanning a folder, so a candidate is deleted only after the package suite is green
without it.

```ts
export interface IDeadTestCodeCandidate {
    file: string;
    /**
     * `unreferenced`: neither its name nor its path under `__tests__` appears in another file, nor does
     * its folder. `folder-referenced`: only its folder path does, so a scan of that folder may load it.
     */
    kind: 'unreferenced' | 'folder-referenced';
}
```

Source: `packages/dev-configs/src/checks/test-dead-code.ts`

## `ILedger`

*interface*

The mutation ledger: every line to replay.

```ts
export interface ILedger {
    mutants: ILedgerLine[];
}
```

Source: `packages/dev-configs/src/checks/test-mutate.ts`

## `ILedgerLine`

*interface*

One ledger line: a candidate test that the survivor test makes redundant, or one that proves nothing (`vacuous`).

```ts
export interface ILedgerLine {
    id: string;
    /** Repository-relative test file that is deleted. */
    candidate: string;
    /**
     * Run only the cases whose name matches (`bun test -t`).
     *
     * @default the whole file
     */
    candidateName?: string;
    /** Repository-relative test file that stays. */
    survivor: string;
    survivorName?: string;
    /**
     * The break. An array applies every edit together: a survivor in the package that owns the code
     * loads its `src`, a candidate in another package loads that package's `dist`, so one break is two edits.
     */
    mutant: IMutant | IMutant[];
    /** The source line the mutant stands for, `path:line`; recorded, not used by the replay. */
    srcLine?: string;
    /**
     * `red`: the candidate must fail. `vacuous`: it must stay green under `mutant` AND `secondMutant`.
     *
     * @default 'red'
     */
    expectCandidate?: 'red' | 'vacuous';
    secondMutant?: IMutant | IMutant[];
}
```

Source: `packages/dev-configs/src/checks/test-mutate.ts`

## `ILedgerResult`

*interface*

Result of replaying one ledger line; `ok` is false when the claim does not hold, with the reason in `problem`.

```ts
export interface ILedgerResult {
    id: string;
    survivorRed: boolean;
    candidateRed: boolean;
    /** Only for a `vacuous` line: whether the candidate also stayed green under the second mutant. */
    candidateGreenUnderSecond?: boolean;
    ok: boolean;
    problem?: string;
}
```

Source: `packages/dev-configs/src/checks/test-mutate.ts`

## `IMutant`

*interface*

Replays the mutation proof of the trim-tests method. A ledger line says: "this test (the
candidate) is redundant because that test (the survivor) already catches the same break". The
replay applies the break (the mutant) to a file, runs the survivor and the candidate, and puts the
file back. The survivor must go red. The candidate must go red too, unless the line says it is
vacuous and a second mutant leaves it green as well.

The mutant edits the file the test really loads: the package's own `src` for a test that imports
through the `@/` alias, or the `dist` of the dependency for a test that reaches another package
through its `exports`. A rebuild is never needed.

```ts
export interface IMutant {
    /** Repository-relative file to edit (a `src` file, or a `dist` file of a dependency). */
    file: string;
    /** Text that must occur exactly once in the file. */
    find: string;
    replace: string;
}
```

Source: `packages/dev-configs/src/checks/test-mutate.ts`

## `IPurityClaim`

*interface*

A package whose published entry points carry a browser-purity claim.

The ROW SET IS NEVER AUTHORED. It is read from the package's own `exports` map, so a sub-path
added to a manifest is probed the moment it is published.

```ts
export interface IPurityClaim {
    /** Directory under `packages/`, and the token `devz check purity <token>` filters on. */
    package: string;
    /**
     * Sub-paths (as spelled in `exports`) when the claim covers only PART of the published surface.
     * Omit it and the whole surface is claimed. Every sub-path named here must still exist in
     * `exports`; a rename fails the derivation loudly rather than quietly dropping a row.
     */
    subpaths?: string[];
    /** `external` for one sub-path - see {@link IPurityEntry.external}. Keyed as spelled in `exports`. */
    external?: Record<string, string[]>;
    /**
     * Entries that CANNOT be browser-pure, keyed as spelled in `exports`, valued by the conditions
     * that are impure. The waiver is exact in BOTH directions: a listed entry that turns out to be
     * pure fails as loudly as an unlisted one that is not. Deriving still owns the ROW SET, so a
     * sub-path added later is claimed pure by default and has to earn its line here.
     */
    impure?: Record<string, string[]>;
}
```

Source: `packages/dev-configs/src/checks/purity/manifest.ts`

## `IPurityEntry`

*interface*

One built entry file that the browser-purity gate probes; rows are derived from the package `exports` map, not written by hand.

```ts
export interface IPurityEntry {
    label: string;
    package: string;
    /** Repository-relative path to the built file the `exports` map points at. */
    entry: string;
    /**
     * Specifiers to pass through as `bun build --external`. Only for a third-party dependency whose
     * OWN packaging is out of this gate's remit - e.g. one that relies on its `package.json` `browser`
     * field remap, which the downstream app's bundler (Vite, ...) honours and `bun build` does not.
     * Never for the repository's own source: an external hides that file from the module graph
     * entirely, so using it on our own code would let a real leak through unseen rather than prove
     * anything pure. Enforced by {@link PurityManifest.assertNoWorkspaceExternal}, not left to this comment alone.
     */
    external?: string[];
    /**
     * This row is EXPECTED to be impure, so failing is its passing state. Derived from
     * {@link IPurityClaim.impure} - never authored on a row directly.
     */
    expectImpure?: boolean;
}
```

Source: `packages/dev-configs/src/checks/purity/manifest.ts`

## `IPurityOptions`

*interface*

What a repository may tune about the engine; everything else is the engine's contract.

```ts
export interface IPurityOptions {
    /**
     * When set, every claimed sub-path must publish its runtime entries below this prefix (for
     * example `./dist/esm/`): a browser bundler needs an ES module, so a CommonJS-only entry makes
     * the claim unconsumable. Omit it for a repository that publishes a single build.
     */
    esmEntryPrefix?: string;
    /**
     * Package-name prefix of this repository's own packages; an `external` may never start with it.
     *
     * @default '@venizia/'
     */
    workspaceScope?: string;
}
```

Source: `packages/dev-configs/src/checks/purity/manifest.ts`

## `IPurityReport`

*interface*

Result of `PurityCheck.run`: the verdict rows and how many were checked, failed and waived.

```ts
export interface IPurityReport {
    rows: IPurityRowVerdict[];
    failed: number;
    waived: number;
    checked: number;
}
```

Source: `packages/dev-configs/src/checks/purity/run.ts`

## `IPurityResult`

*interface*

Outcome of probing one entry: `ok` is the verdict, `builtins` and `globals` are what made it fail, `sizeBytes` is the bundle size.

```ts
export interface IPurityResult {
    entry: string;
    ok: boolean;
    sizeBytes: number;
    builtins: string[];
    globals: string[];
    /** Node-global reads that cannot throw in a browser. Reported, never fatal. */
    guardedGlobals: string[];
    /**
     * Specifiers this probe run excluded from its own module graph. Always echoed back, on both the
     * passing and failing path - an entry that externalises something is measuring less than an entry
     * that does not, and that must stay visible next to the result, not be a silent input.
     */
    external: string[];
    buildError?: string;
}
```

Source: `packages/dev-configs/src/checks/purity/probe.ts`

## `IPurityRowVerdict`

*interface*

One row of the `--json` verdict: nothing machine- or time-specific, so two runs on one commit diff empty.

```ts
export interface IPurityRowVerdict {
    label: string;
    entry: string;
    verdict: TPurityVerdict;
    sizeBytes?: number;
    builtins?: string[];
    globals?: string[];
    guardedGlobals?: string[];
    external?: string[];
    buildError?: string;
}
```

Source: `packages/dev-configs/src/checks/purity/run.ts`

## `ITestFileWeight`

*interface*

Time and counts of one test file from a JUnit report.

```ts
export interface ITestFileWeight {
    label: string;
    file: string;
    milliseconds: number;
    cases: number;
    assertions: number;
    skipped: number;
    slowestCase: string;
    slowestMilliseconds: number;
}
```

Source: `packages/dev-configs/src/checks/test-weight.ts`

## `ITestWeightInput`

*interface*

Reads the JUnit report of `bun test --reporter=junit` and says where the test time and the test
count are: per file, per package, the heaviest files, duplicates by name, files that assert nothing,
and skips. The first step of the trim-tests method (`.agents/knowledge/process/trimming-tests.md`).

The numbers are only as good as the run that made them: a `--parallel` run times each file under
contention, so a file that takes 7 s there can take 1 s alone. Re-time a suspect file alone.

```ts
export interface ITestWeightInput {
    /** Names the report in the output: the package. */
    label: string;
    xml: string;
}
```

Source: `packages/dev-configs/src/checks/test-weight.ts`

## `ITestWeightReport`

*interface*

Result of `TestWeightCheck.analyseJunit`: totals, per-package sums, the heaviest files and the suspect ones.

```ts
export interface ITestWeightReport {
    files: ITestFileWeight[];
    totalMilliseconds: number;
    totalCases: number;
    totalAssertions: number;
    totalSkipped: number;
    perLabel: Array<{
        label: string;
        files: number;
        cases: number;
        milliseconds: number;
    }>;
    /** Heaviest first. */
    heaviest: ITestFileWeight[];
    /** How many of the heaviest files hold 80% of the time. */
    filesFor80Percent: number;
    /** Files that take under 100 ms, and what they cost together. */
    lightFiles: {
        count: number;
        milliseconds: number;
    };
    /** The same suite and case name in more than one file. */
    sameNameAcrossFiles: Array<{
        name: string;
        files: string[];
    }>;
    zeroAssertionFiles: string[];
    skippedFiles: Array<{
        file: string;
        skipped: number;
    }>;
}
```

Source: `packages/dev-configs/src/checks/test-weight.ts`

## `ModuleCyclesCheck`

*class*

The `devz check module-cycles` command: prints the import cycles of a built ESM directory and returns the exit code.

```ts
export declare class ModuleCyclesCheck {
    /**
     * `devz check module-cycles <dir> [--max <n>]`: prints the cycles of a built ESM directory and
     * returns 1 when there are more than `max` (no bound by default), 2 on a usage error.
     */
    static run(opts: {
        args: string[];
        print: (line: string) => void;
        printError: (line: string) => void;
    }): number;
}
```

Source: `packages/dev-configs/src/checks/module-cycles.ts`

## `ModuleGraph`

*class*

The relative-import graph of a built ESM directory; build it with `fromDirectory` and read its import cycles with `cycles()`.

```ts
export declare class ModuleGraph {
    private readonly root;
    private readonly edges;
    private constructor();
    static fromDirectory(opts: {
        dir: string;
    }): ModuleGraph;
    /** Strongly connected components with more than one member, as repo-relative paths. */
    cycles(): string[][];
    private static walk;
    private static resolveRelative;
}
```

Source: `packages/dev-configs/src/checks/module-cycles.ts`

## `ProbeSeverities`

*class*

What a matched global means: ERROR is fatal, GUARDED is reported and never fatal.

```ts
export declare class ProbeSeverities {
    static readonly ERROR = "error";
    static readonly GUARDED = "guarded";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TProbeSeverity;
}
```

Source: `packages/dev-configs/src/checks/purity/probe.ts`

## `PURITY_SCRATCH_DIR`

*const*

Where the probe keeps its metafile, relative to the `cwd` it is given: the repository's own scratch, never the system temp.

```ts
export declare const PURITY_SCRATCH_DIR = ".agents/local/tmp";
```

Source: `packages/dev-configs/src/checks/purity/probe.ts`

## `PurityCheck`

*class*

The `devz check purity` command: probes every published entry of the claimed packages and reports a verdict per row.

```ts
export declare class PurityCheck {
    /**
     * Probes every row of the claims and returns the report. `print` receives the human report line by
     * line, in the exact shape the repository scripts printed before the engine moved here.
     */
    static run(opts: {
        root: string;
        claims: IPurityClaim[];
        options?: IPurityOptions;
        /** Only the rows of this package; a token that matches nothing is a broken gate and returns `undefined`. */
        filter?: string;
        /** The claims file, repository-relative, named in the hint printed for a stale waiver. */
        claimsFile: string;
        print: (line: string) => void;
        /** Where the no-match message goes (stderr for the command): it is an error, not a report line. */
        printError: (line: string) => void;
    }): Promise<IPurityReport | undefined>;
}
```

Source: `packages/dev-configs/src/checks/purity/run.ts`

## `PurityManifest`

*class*

Derives the rows of the purity gate from the `exports` map of each claimed package, then runs the guards on them.

```ts
export declare class PurityManifest {
    /**
     * A code-level guard, not just the JSDoc on `external`: it is an escape hatch from this gate, and a
     * hatch with no lock is one bad edit away from hiding a real leak - `external: ['@venizia/ignis-helpers']`
     * on a red entry would silently turn it green by removing the exact root-barrel import this gate
     * exists to catch from the module graph, rather than proving it absent.
     *
     * A plain `Error`, not `getError`: the engine runs from the repository root through `devz`, outside
     * every workspace package, and has no logger to resolve.
     */
    static assertNoWorkspaceExternal(opts: {
        manifest: IPurityEntry[];
        workspaceScope?: string;
    }): IPurityEntry[];
    /**
     * Public for the tests, which have to drive a claim that no longer matches its package's
     * `exports` map - the staleness guard is the whole point of deriving, and it cannot be asserted
     * through a built manifest, which by construction is never stale.
     */
    static deriveEntries(opts: {
        claim: IPurityClaim;
        root: string;
    }): IPurityEntry[];
    /**
     * A browser claim is only honest if a browser bundler can actually consume the entry. A CommonJS
     * entry forces every consumer into a workaround, so the claim carries the obligation: every claimed
     * sub-path must publish its runtime entries below `esmEntryPrefix`. Checked here rather than trusted
     * to a comment, for the same reason as {@link PurityManifest.assertNoWorkspaceExternal} - the failure is otherwise
     * invisible until someone tries to bundle the package downstream.
     */
    static assertBrowserEsmEntry(opts: {
        claims: IPurityClaim[];
        root: string;
        esmEntryPrefix: string;
    }): IPurityClaim[];
    /** The rows of a whole repository: every claim derived from its package's `exports`, then the guards. */
    static build(opts: {
        claims: IPurityClaim[];
        root: string;
        options?: IPurityOptions;
    }): IPurityEntry[];
}
```

Source: `packages/dev-configs/src/checks/purity/manifest.ts`

## `PurityProbe`

*class*

Bundles a built entry for the browser with `bun build` and reports the Node builtins and Node globals that reach the bundle.

```ts
export declare class PurityProbe {
    /**
     * Public so `probe.test.ts` can assert against the literal collision string directly, without
     * spawning `bun build` - a fixture whose OWN entry-path comment happens to reproduce the collision
     * is not something a filename choice can be relied on to keep reproducing.
     */
    static stripBundlerPathComments(opts: {
        text: string;
    }): string;
    /**
     * The CLI, not `Bun.build()`: the in-process bundler resolves this workspace's symlinked
     * dependencies to directories and dies on them.
     */
    static probeEntry(opts: {
        entry: string;
        cwd: string;
        external?: string[];
        /** @default join(cwd, PURITY_SCRATCH_DIR) */
        scratchDir?: string;
    }): Promise<IPurityResult>;
}
```

Source: `packages/dev-configs/src/checks/purity/probe.ts`

## `PurityVerdicts`

*class*

The outcome of one row, as the text report and the JSON verdict both name it.

```ts
export declare class PurityVerdicts {
    static readonly PASS = "pass";
    static readonly FAIL = "fail";
    static readonly WAIVED = "waived";
    static readonly MISSING = "missing";
    static readonly STALE_WAIVER = "stale-waiver";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TPurityVerdict;
}
```

Source: `packages/dev-configs/src/checks/purity/run.ts`

## `SplitReport`

*class*

The `devz check split-report` command: prints the file-splitting report for one package, or every package that has a `src/` folder.

```ts
export declare class SplitReport {
    /** `distDir` is the built ESM folder inside a package (`dist/esm`, or `dist` where one build is published); `print` takes the report line by line. */
    static run(opts: {
        packageDir: string;
        distDir?: string;
        print?: (line: string) => void;
    }): void;
    /** Every packages/* and examples/* directory that has a src/ folder. */
    static defaultTargets(opts?: {
        root?: string;
    }): string[];
    private static section;
    private static facts;
    /** abstract.ts + base.ts pairs are the format; exactly one of each is one concept. */
    private static isAbstractBasePair;
    private static walk;
    private static foldersWithoutIndex;
}
```

Source: `packages/dev-configs/src/checks/split-report.ts`

## `TestControlsCheck`

*class*

Verifies that every positive control in the registry still exists: its file is present and, for a test entry, enough test titles match its pattern.

```ts
export declare class TestControlsCheck {
    /**
     * The titles in a test file: the first string argument of `test`, `it`, `describe` and of the
     * second call of `test.each(rows)('title', ...)`, with their `.only`/`.skip`/`.if(...)` forms.
     * A `test.each` title is returned as written (`%s` and all): the registry patterns are regular
     * expressions, so the expansion does not matter.
     */
    static listTitles(opts: {
        source: string;
        fileName?: string;
    }): Promise<string[]>;
    /** Checks every entry of the registry against the test files it names. */
    static run(opts: {
        root: string;
        controls: IControlEntry[];
    }): Promise<IControlsReport>;
}
```

Source: `packages/dev-configs/src/checks/test-controls.ts`

## `TestMutateCheck`

*class*

Replays the mutation ledger of the trim-tests method: applies each break, runs the survivor and candidate tests, and restores the file.

```ts
export declare class TestMutateCheck {
    /** Replays every line; never throws for a green survivor (that is a result), only for an unusable ledger. */
    static replayLedger(opts: {
        root: string;
        ledger: ILedger;
        scratch?: string;
    }): ILedgerResult[];
    /** The report lines of a replay, one per ledger line and a closing tally. */
    static formatLedgerResults(opts: {
        results: ILedgerResult[];
    }): string[];
}
```

Source: `packages/dev-configs/src/checks/test-mutate.ts`

## `TestWeightCheck`

*class*

Reads JUnit reports of `bun test` and shows where the test time and the test count are.

```ts
export declare class TestWeightCheck {
    /** Reads the JUnit reports of a test run into one weight report: which files carry the time, and what looks wrong. */
    static analyseJunit(opts: {
        reports: ITestWeightInput[];
    }): ITestWeightReport;
    /** The report as the lines `devz check test-weight` prints. */
    static formatReport(opts: {
        report: ITestWeightReport;
        top?: number;
    }): string[];
}
```

Source: `packages/dev-configs/src/checks/test-weight.ts`

## `TProbeSeverity`

*type*

`error` or `guarded`: whether a matched Node global fails the probe or is only reported.

```ts
export type TProbeSeverity = Extract<(typeof ProbeSeverities)[keyof typeof ProbeSeverities], string>;
```

Source: `packages/dev-configs/src/checks/purity/probe.ts`

## `TPurityVerdict`

*type*

One of the `PurityVerdicts` values: `pass`, `fail`, `waived`, `missing` or `stale-waiver`.

```ts
export type TPurityVerdict = Extract<(typeof PurityVerdicts)[keyof typeof PurityVerdicts], string>;
```

Source: `packages/dev-configs/src/checks/purity/run.ts`
