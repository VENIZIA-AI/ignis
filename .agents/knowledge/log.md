# Knowledge log

Append one entry per change to the bundle. Newest first. Keep entries short: what changed and why,
not how.

This file and `index.md` are reserved OKF filenames - they carry no `type:` frontmatter and are not
counted as concepts.

## 2026-09-15 (c) - presignPut signs extra headers, and the commit writes its MetaLink row

`presignPut` takes `tagging` and `contentLength`, both SIGNED. A tag merely sent is a tag S3
ignores, so a step gated on reading it back fails silently. Bun's `S3FilePresignOptions` has a method
and an expiry and nothing else, so the URL is now built by `buildPresignedUrl` - query-signed SigV4,
checked against the signature AWS publishes for its documented example. `contentLength` stays an
exact number, not a ceiling: the equality limit in [[object-storage]], not an oversight.

`upload-commit` writes the MetaLink row the ordinary upload writes, through one shared builder. The
two paths had diverged since `directUpload` shipped and the symptom was a client rendering an empty
state with no error. Labels ride the query, because the token carries no business fields; a failed
row is a code in a 200 body, because the object is already committed by then.

No unique constraint on `(bucketName, objectName)`: counted on a real table, 1027 of 1038 objects
with more than one row were one image attached to a product and to its variants. A row is one
(object, owner) pairing. That leaves `recreate-metalink` non-atomic on purpose - without a unique
index, two transactions both read "no row" and both insert, and `FOR UPDATE` locks nothing that does
not exist.

## 2026-09-15 (b) - the storage signing model gets a concept, and direct upload gets a page

New concept [[object-storage]]: what a SigV4 signature actually covers, the three upload paths, and
why a POST policy is not a presigned PUT. The load-bearing line is one rule - what is inside the
signed description is locked, what is outside is free, and there is no middle, because HMAC answers
identical or different and never within range. A size ceiling therefore cannot come from signing a
request; it has to come from signing a document that carries a grammar (`content-length-range`,
`starts-with`).

That rule also explains `endpoint: { default, public }`: `host` is inside the description, so a URL
signed against an internal name cannot be rewritten later.

Wiki gains `extensions/components/static-asset/direct-upload` - configuration, the browser side, and
each safeguard with its reason - plus a runnable page at `content/public/direct-upload-demo.html`
that performs all three round trips and prints them. The demo exists because step 2 leaving without
touching the backend is the one claim a reader cannot check by reading.

A 403 at step 2 is most often the bucket's CORS rules, not the policy. That is recorded in the page
because it is the failure that costs an afternoon.

## 2026-09-15 - one endpoint option, two audiences

`IBunS3HelperOptions.endpoint` is `{ default, public? }`; `publicEndpoint` is gone. The shape change
is the small half. The behaviour was wrong: `publicEndpoint ?? endpoint` won for EVERYTHING, so an
application that set it sent its own list, copy and tagging calls out through the public host -
working by accident, hairpinning every byte through the edge, and impossible against a read-only CDN.

Each call site now states its audience through `objectEndpoint({ bucket, audience })`, and `audience` is `S3Audiences` - a const class with `SCHEME_SET` and `isValid`, not a raw string-literal union (C rule: an enumerable string is a const class plus `TConstValue`). `default` takes
the `S3Client`, every bucket operation, `copyObject` and tagging; `public` takes `presignGet`,
`presignPut` and `presignPost`, and falls back to `default` when unset.

Two hosts exist because `host` is inside every SigV4 signature: a URL signed against an internal name
cannot be rewritten later, so the public host is chosen AT SIGNING TIME rather than patched after.

Measured with a `fetch` double recording the URL actually attempted, not by reading the code - a
mutation forcing the bucket branch onto `public` turns that test red. Blast radius in the downstream
repository: 5 `new BunS3Helper` sites break at COMPILE (asset 2, helpdesk, ledger, taxation), and
none of them set `publicEndpoint`, so the behaviour change reaches nobody there.

## 2026-09-14 - six changes: the asset surface, a component's options, and an inject target behind an import cycle

**Direct upload lands, as a signed POST policy.** `controller.directUpload` registers
`POST {base}/upload-policy` and `POST {base}/upload-commit`; absent, neither exists. NOT a presigned
PUT, and the research killed that shape before it was built: a signed PUT binds `content-length` to an
EXACT value, so "at most 2 MB" is inexpressible and every retry is an opaque 403. A policy carries
`content-length-range`.

The commit is claimed with an HMAC over `{bucket, key, expiresAt}`, verified BEFORE any storage call -
so a caller cannot name an object it was never granted, and the route is not a name prober. The token
carries no business fields on purpose: whose upload it is belongs to the application, not to a token
IGNIS signs.

A policy only authorizes `pending/<generated>`; commit copies server-side to the final key, which
therefore appears in NO policy and cannot be replaced afterwards. Removing the temporary object is
cleanup, not the commit: it is best-effort and logs, because failing the request would tell the caller
their upload did not work when it did. `onCommit` runs BEFORE the copy so a throwing hook leaves the
object under the prefix for a lifecycle rule. `authorize` is a REQUIRED property - a route handing out
a write credential has no safe default.

Two storage methods came with it: `presignPost` and `copyObject` (`x-amz-copy-source`, so 500 MB never
travels through this process). `buildSignedRequest` now takes extra headers to SIGN - anything outside
`SignedHeaders` is refused by S3. A trap worth keeping: every field the browser posts must ALSO be a
policy condition, or S3 rejects the form it just signed.

**The asset download route drops its plural.** `GET {base}/downloads/{objectName}` is now
`GET {base}/download/{objectName}`, reversing half of the 09-08 route move. `download` is one action
on one object; `/buckets` and `/objects` stay plural because each names a listable collection.
Position is untouched - the action sits BEFORE the key, forced by Hono. Measured in BANA: `/downloads/`
appears 0 times, and their hand-written controller already serves `/download/{objectName}{.+}`, so the
singular spelling is the one their clients already learned.

**Trap, and it applies to every route test:** a 404 assertion on a path passes for a WRONG path too.
Renaming the segment to `/downloadX/` turned 2 of 3 assertions red; the 404 one stayed green.

**`GET /health/stats` declares `x-health-key`.** `RouteConfigs.STATS` had `responses` and no
`request`, so the API reference rendered no input and a gated route could not be called from it. The
parameter is optional: a host with no `stats.secretKey` runs an open route, and marking it required
would make the reference lie to that host.

**The MetaLink table belongs to the application.** `TMetaLinkConfig` constrained `Schema` to
`typeof BaseMetaLinkModel.schema`, a concrete table type carrying `schema: undefined`, and
`TStaticAssetsComponentOptions` never took a type argument. A column-identical table under another
Postgres schema was refused at compile time with `Type '"commerce"' is not assignable to type
'undefined'`, and no application-side escape existed. The constraint is now `TMetaLinkCompatibleSchema`
- any table whose ROW carries the MetaLink fields - and the options type takes the table as a type
argument. A table missing a field is still refused; the `as unknown as` workaround people reach for
silences that check too. `createMetaLink` now returns `data: TTableObject<Schema>`, the row, which is
what the component always read.

`examples/vert` had its whole `useMetaLink: true` block commented out behind a stale TODO, so IGNIS
shipped no working example of it. It is back, through a `@provide` on `PlatformComponent`, on disk
storage so the example runs with no extra infrastructure.

**A generic option type is not enough; the CLASS has to be generic.** Making `TMetaLinkConfig` and
`TStaticAssetsComponentOptions` generic fixed `bind<TStaticAssetsComponentOptions<S>>()` and left
`component(Ctor, { options })` failing with TS2345 - that path infers the options from the class, so
`StaticAssetComponent extends BaseComponent<TStaticAssetsComponentOptions>` could only carry options
for the shipped table. Found by the downstream consumer after the release, not by this repository:
the two instructions we shipped were mutually exclusive. `StaticAssetComponent<Schema>` now carries
it. Inside `AssetControllerFactory` the table is erased to `AnyType` on purpose - every read and write
there is on MetaLink columns, and a generic threaded through 700 lines of handler buys nothing the
option types do not already check.

**A component reads its options in `binding()`.** `BaseComponent` stores what
`application.component(Ctor, { options })` handed it on `this.configuredOptions`, set before
`binding()` runs. Every component that wanted its options used to override `configure()` to keep a
copy, each under its own field name. `StaticAssetComponent` takes options that way now;
`STATIC_ASSET_COMPONENT_OPTIONS` stays because an artifact index carries classes and no options, so a
component registered through `configs.artifacts` has no other channel.

**`@inject({ target })` takes a function returning the class.** The function runs when the container
resolves, so a class a barrel makes unreachable at module load is still nameable. There is no async
form: `Container.instantiate` is synchronous and ends in `new cls(...args)`, and the target is only
read to look up a key recorded on the class.

**Measured, and it reframes the problem:** a barrel import cycle kills `@inject({ key })` exactly as
hard. `emitDecoratorMetadata` turns the parameter's type annotation into an eager value reference
(`typeof X === 'undefined' ? Object : X`), and `typeof` on a temporal-dead-zone binding throws, so
TypeScript's own guard does not help. The thunk covers the decorator argument only - the annotation
must come from an `import type` alias as well. Both halves are in the fixture at
`packages/inversion/src/__tests__/cycle-barrel/`. `design:paramtypes` cannot be turned off:
`kernel/src/base/metadata/persistents.ts` reads it.

**The resolver vocabulary moved down to inversion.** `TResolver`, `TAsyncResolver`,
`TValueOrResolver`, `TValueOrAsyncResolver`, `resolveValue` and `resolveValueAsync` now live in
`@venizia/ignis-inversion`, beside the container that branches on them; `@venizia/ignis-helpers/common`
re-exports all six. helpers already depended on inversion, never the reverse, so this is the only
direction that compiles.

**An application lists none of its own artifacts.** `injectable` - the one function every stereotype calls -
records the class as it decorates it, and `registerConfiguredArtifacts` registers that list when
`configs.artifacts` is absent. Discovery happens at IMPORT time, never at boot: a class exists at run
time only because something imported it, and a compiled single-file binary has no source tree to
walk. The generated index already imports every decorated class, so `import './generated/artifacts'`
for its side effects is the whole wiring.

Discovery is OFF until `configs.discoverArtifacts: true`, and that is a correction of the first shape
this took. Reading an ABSENT `artifacts` as "register everything" looked elegant and is a trap: a
downstream `createAppConfig` omits the key on purpose (`packages/core/src/common/app-config.ts:39`,
`...(artifacts ? { artifacts } : {})`), and one of its 18 call sites - `search/src/migrations/bootstrap.ts:83`
- relies on it to register nothing. That application would have swallowed every decorated class in the
binary, with no compile error and no warning. The flag and `artifacts` compose: both set registers the
union, de-duplicated, which is how an application discovers its own classes and still takes a library
index. `@model` is recorded then skipped: it has a binding namespace but no index field.

Several applications in one process share the discovered list, so a class with no `when` registers in
all of them. `when` already receives `{ application }` (`artifact-index.ts:162,223`), so the run-mode
gate answers the second question with no new API. Measured on `examples/vert` with a probe:
`configs.artifacts = undefined`, 2 services + 10 repositories + 3 controllers + 1 datasource + 1
component - the same 17 classes its generated index listed. No class inside IGNIS carries a
stereotype, so discovery never turns on a framework component by itself.

Kernel's `inject` wrapper had a SECOND copy of `TInjectOptions` still typed `TClass<AnyType>`, so the
thunk form type-checked in inversion and failed in every application - the wrapper is what
applications import. It now reuses inversion's type through a distributive `Omit`, and a kernel test
covers the thunk through the wrapper. A bare `Omit` on that union collapses the two branches into one
shape declaring both.

**The container counts what it hands out.** `bootChecks.binding.doVerify` catches a dependency
injected but never registered; the reverse - a class registered that nothing injects - was silent, so
a hand-written artifact list could only grow. `BaseContainer.get` is the one choke point every
resolution passes through, so it counts there: `startResolutionCounting`, `stopResolutionCounting`,
`getResolutionCounts`, and `RestApplication.getUnresolvedBindings({ tags })` on top.

Counting is OFF by default, and the measurement is why: 2 million resolutions ran at 89 ns each with
it off and 96 ns with it on, on the one method every injection passes through. Reading the report
without having started throws - naming every binding is a wrong answer, not an empty one.

Starting is also the reset, and it must happen after `initialize()`: `doVerify` reads every service
and repository at boot, so counting across boot reports empty for the wrong reason. A count of zero is
evidence, not a verdict: an unread binding may be an allow-list entry or a technical floor. No warning, no boot
gate, no deletion. A static scan cannot replace this - one downstream service resolves five
repositories by building the key at run time, which no grep sees.

**Asset options take a resolver where they took a value.** `controller.bucket`, `metaLink.model` and
`metaLink.repository` are `TValueOrAsyncResolver`, and `TResolveObjectName` is renamed
`TObjectNameResolver` - verb-first named an action where every other type names a thing. The
repository is resolved at EVERY call, never once per handler: an application may rebind it between two
of them, and a copy held across them answers from the old binding.
## 2026-09-13 - the knowledge bundle and the wiki get synced against source, and the drifts each exposes

Full sync over `8cd8f96a..HEAD` applied 101 findings across 41 files in the knowledge bundle. A second
pass covered `docs/wiki/`, which the knowledge sync does not reach, fixing about 241 confirmed drifts
across 114 pages, each with a `file:line` witness.

Corrections from the package sync:

- Kernel boot now has eleven steps, not nine: `registerConfigurations()` and `verifyBindings()` are
  new, gated by `configs.bootChecks.binding.doVerify` (`boot-sequence.ts:10,16`).
- `RestComponent` moved to the kernel; core re-exports it, so `@venizia/ignis` still resolves it.
- Call-site options reach a component through `configure()`, not a pre-bound key - `BaseComponent` does
  not consume them, a component must override it itself.
- Tests run from `src/__tests__/`; `boot`'s `dist/cjs/__tests__` path is dead, it does not exist.
- `MinioHelper` ships again (`8edba6ae`, `@deprecated`) - the concept wrongly said removed; see 09-08
  below.
- `%o`, `%O` and no-placeholder log arguments ARE redacted, reversing the earlier claim.
- Two new error catalogs in helpers, `StorageErrors` and `UrlSafetyErrors`, augment `IErrorKeyRegistry`
  against `@venizia/ignis-inversion` since `declare module` only augments the imported module name.
- `root-barrel-dependencies.test.ts` fails on a bare import missing from `package.json`.
- `examples/vert` registers through `beConfigs.artifacts`, not `preConfigure()`; of fourteen repository
  suites only one actually runs.
- `examples/typesense-search` provisioning is gated behind `APP_ENV_AUTO_PROVISION_COLLECTION`, off by
  default.

Dedup: `packages/helpers.md` and `overview/onboarding.md` now point at the generated table in
`overview/monorepo-layout.md`, replacing stale hand-written lists. Curation gap: 9 playbooks against a
target of 10.

Wiki-audit defects:

- Three tutorials taught a boot sequence that crashes: `application.start()` alone skips `init()`, the
  only caller of `registerCoreBindings()`, so built-in components throw `Binding key: @app/instance is
  not bounded in context!`. Only the quickstart page got it right.
- `ALLOW_EMPTY_ENV_VALUE` was documented backwards: empty values are PERMITTED by default; `false`/`0`
  turns the check on.
- Services were documented as singletons; `service()` binds `BindingScopes.TRANSIENT`, so cached
  service-field state is lost. Controllers really are singleton.
- A filter recipe dropped ~98% of its rows: chunking without a `limit` let `find()` fall back to
  `DEFAULT_LIMIT`, returning 10 per chunk instead of 500.
- Storage pages were a whole API behind: all six taught the flat `{ bucket, name }` shape and the
  already-removed client-metadata content-type path.
- `PolicyDefinition` was documented with one `domain` column; there are two, `domain_type`/`domain_id`
  - a migration built from that page was wrong.
- Amazon SES is a shipped mail provider missing from all six mail lists, which told readers to
  hand-roll a transport.

New gate `make wiki-anchors-check` reads ids from the BUILT html, not a recomputed slug, since VitePress
does not slugify like GitHub - a reimplemented slugifier had invented and hidden failures. It found 22
links pointing at dead `#fragment`s already shipped.

`.agents/plugin/skills/update-wiki/SKILL.md` was rewritten: every path pointed at `packages/docs/wiki/`,
which does not exist. It now names the real wiki paths and routes style to
`conventions/docs-writing-style.md`.

The wiki audit deferred two code defects, both closed the same day. First: `ignis-artifacts` could not
see `@configuration` - `boot/src/generator/common/constants.ts` mirrored the kernel's `ArtifactTypes`
but omitted its first member, so a `@configuration` class scanned, matched nothing, and vanished
silently. Fix: four values added, including an `EMIT_ORDER` entry placed first; every generated index
now gains `configurations: []`, harmless since the field is optional.

Second: `examples/vert/scripts/seed-user-policies.ts` inserted into a nonexistent `domain` column (the
table has `domain_type`/`domain_id`); `tsc` passed since it is a raw SQL string.

Also fixed: `IDSConfigs` renamed to `IDataSourceConfigs` across examples and wiki (changelogs keep the
old name, since they record history). `best-practices/architectural-patterns.md` told readers to
hand-register every artifact in `preConfigure()`, contradicted by `bootChecks.binding.allowManual:
false` - the sample now uses `configs.artifacts`.

Gates held green across all three passes: `docs:build`, `wiki-source-links`, `wiki-anchors`,
`test-boot`, `lint-examples`, `test-scripts`, `okf-check`.

## 2026-09-12 - an unguarded stats route warns at boot

`HealthCheckReporter.isStatsUnguarded` is new: true when the route is mounted, has no `secretKey`, and
the ambient env is outside `DEVELOPMENT_ENVS`. `HealthCheckComponent.binding()` turns a true into one
`warn`; nothing about what the route serves changes.

The sharp edge: `stats.enable` as an explicit boolean answers FIRST, and `NODE_ENV` is never consulted
- a value set to open the route locally opens it in production too. Found live: `curl` returned 200
with service version, `runtime`, `NODE_ENV` and memory, unauthenticated.

A BLANK `secretKey` deliberately does NOT warn - it fails closed, so the route refuses everything; only
`undefined` means open, which is why `blankToUndefined` is the WRONG tool for it.

BANA's shape avoids this by construction: `stats: { enable: Boolean(secretKey), secretKey }` - no key
means the route is never mounted.

## 2026-09-12 - a blank env value now reads as unset everywhere

`ApplicationEnvironment.get()` (`packages/helpers/src/modules/env/app-env.ts`) now normalises a
present-but-empty value (`KEY=`) to `undefined`, so `defaultValue` applies, but only when the caller
supplied one - a `get()` with no default still returns `''` unchanged. Blast radius: 10 call sites in
IGNIS, 89 in BANA; `'0'` and `'false'` are never normalised.

Ten framework constants bypassed this by reading `process.env` directly with `??`:
`APPLICATION_ENV_PREFIX`, the default timezone, winston/pino settings, `App.APPLICATION_NAME`, the
banner reader. Each now uses the new `blankToUndefined(process.env.X) ?? fallback` helper, not `X ||
fallback`, which would swallow `'0'`.

`APPLICATION_ENV_PREFIX` empty is a SECURITY finding: the prefix becomes `''`, so `key.startsWith('')`
matches everything and `ApplicationEnvironment` copies the WHOLE of `process.env` into its map - proven
by running it, `keys()` returned `PATH`, `HOME`, host tokens.

`validateEnvs()` no longer throws on an empty prefixed value: the default FLIPPED, unset
`ALLOW_EMPTY_ENV_VALUE` now means allowed, a host opts in with `false`/`0`. Phat's call - refusing to
boot over a blank line fought a reader that already resolves it; a required name left empty now fails
at USE, not boot. `APPLICATION_ENV_PREFIX` and `ALLOW_EMPTY_ENV_VALUE` are deliberately not in
`EnvironmentKeys`, since both are bootstrap variables read straight off `process.env`.

Trap: the first prefix test passed VACUOUSLY, since `every()` on an empty key list is true; such
assertions now check the list is populated first. Controls were restored from a `cp` backup, never `git
checkout`, since the files carried uncommitted work.

`int()` is UNCHANGED by decision (Phat): stays total, `0` for unparseable. The BANA-reported defect is
dead code in the caller idiom `int(x) ?? fallback`, never nullish. Measured with balanced-paren
matching, not regex: IGNIS has **0** such sites, BANA has 6; an earlier regex reported 3, one a FALSE
POSITIVE from stopping at the first inner paren of a nested call.

`EnvironmentKeys` drops `APP_ENV_OAUTH2_VIEW_FOLDER` and `APP_ENV_DATASOURCE_NAME` (0 readers in either
repo), leaving 15 names. `APP_ENV_JWT_SECRET` survived only because
`examples/supabase/src/application.ts:92` still reads it - Phat overrode the standing
no-usage-does-not-justify-deletion rule after seeing the measurement, precedent for asking first, not
deleting on a zero count alone.

Scope note: `examples/` still holds ~40 of the same `process.env.X ?? default` shape, left alone since
examples ship to nobody. `scripts/release.ts`: publish-verification window goes 4 -> 10 minutes, `npm
view` gains `--prefer-online`.

## 2026-09-12 - a cluster takes autoConnect

`IRedisClusterHelperProps` gains `autoConnect`, the field single and sentinel already had and cluster
did not. `RedisClusterHelper` now builds `{ enableOfflineQueue: true, lazyConnect: !autoConnect,
...opts.clusterOptions }` instead of forwarding `clusterOptions` verbatim. Default `autoConnect: true`
keeps existing callers byte-identical.

Precedence is DELIBERATELY the inverse of sentinel: the two defaults sit below the caller spread, so
`clusterOptions` still wins - both BANA call sites already set their own timing through it. Control:
the "explicit clusterOptions still win" case in `cluster.helper.test.ts`.

`enableOfflineQueue: true` was already the live ioredis 5.11.1 default; stating it means an upgrade
cannot silently move it. Cluster still does not call `buildDefaultOpts` (a separate, deliberate
decision).

Scope note: BANA asked IGNIS to also own an env-driven `createRedisHelperFromEnv`. Phat REFUSED - those
env names are BANA conventions; IGNIS supplies the mechanism, not where values come from.

## 2026-09-11 - a build stamp baked in at compile time, and a two-tier health check

`ignis-build-info generate` (new bin in `@venizia/ignis-boot`, beside `ignis-artifacts`) resolves a
build stamp - service, version, commit, branch, builtAt - from CI variables first, then `git`, then
`package.json`, writing a `ts` const or a `json` record.

`git` runs through Bun Shell (`Bun.$`), never `node:child_process`. Two traps, each guarded by a test:
`.cwd(root)` ties the stamp to the package, not the invoking workspace; `result.exitCode` must be
checked, because on a repository with no commit `git rev-parse --abbrev-ref HEAD` prints the literal
`HEAD` on stdout while exiting 128. It degrades to `unspecified` when `Bun` is undefined on plain Node.

The stamp is PUSHED into `BuildInfoRegistry` at the entrypoint, never read back at run time, since a
compiled binary ships no `node_modules`, `.git` or readable `package.json`. `IBuildInfo`/
`TBuildInfoRecord` live in `@venizia/ignis-helpers/core`. Resolution order: `stats.buildInfo` >
`BuildInfoRegistry.get()` > `getAppInfo()`.

`GET /health` answers `{ status, timestamp }` only. `GET /health/stats` carries build + process +
memory and is CLOSED by default outside `DEVELOPMENT_ENVS` (`Environment.ambient`, never `current`,
which masks an unset `NODE_ENV` as `development`). A first cut used `!== 'production'`, which opened
the route on `staging`, `uat` and any container that forgot `NODE_ENV`. Refusal is `context.notFound()`
- byte-identical to an unmounted route. `stats.secretKey` gates it through `X-Health-Key`; a bad key
gets 404, not 401.

The gate lives on the CONTAINER, not the class. A first cut used a `private static context`, which
leaked across nested applications - the last app to boot decided for every one before it.

The startup banner read `APP_ENV_DS_MIGRATION` while `EnvironmentKeys` and everyone else set
`APP_ENV_APPLICATION_DS_MIGRATION` - nothing read what everyone wrote, so the banner always printed
`postgres`. The mismatched constants are DELETED, not renamed; `printStartUpInfo` now reads
`EnvironmentKeys` at CALL time.

`application.component(Ctor, { options })` reached no component until now. `HealthCheckComponent` and
`MailComponent` now override `configure()` to bind the argument before `super.configure()`.

## 2026-09-11 (b) - atlas grows repo mode for any workspace family

Repo mode now accepts any `@venizia/<family>-workspace` checkout and names the server
`<family>-atlas`. ARDOR runs the same atlas over its own corpora.

## 2026-09-10 - @configuration and type-safe component options

Introduced the `@configuration` class artifact and type-safe options pass-through in
`application.component(Ctor, { options })` and `application.dataSource(Ctor, { options })`.

`@configuration({ after?: TClass[] })` runs at `REGISTER_CONFIGURATIONS`, before
`REGISTER_DATA_SOURCES` and `REGISTER_COMPONENTS`, and supports lazy injection through `@inject({
target })`. Ordering is topological on declared `after` dependencies; cycles throw immediately with the
cycle path, and an unregistered `after` name is refused at registration.

`TMixinOpts` gains `options?: Options`, type-checked against the class generic; `registerDynamicBindings`
passes it straight to `instance.configure(options)`.

## 2026-09-09 - a dependency can name its class

`@inject({ target: SomeService })` joins `@inject({ key })` as a union option - a call site states one
or the other, never both, across constructor parameters and properties.

The key is RECORDED ON THE CLASS under `Symbol.for('ignis:binding-key')`, not derived at resolve time.
Deriving `<namespace>.<Class>` from artifact metadata was wrong in three shapes: hand-registered classes
carry no metadata (86 BANA sites, 47 classes); a declared `binding` renames the key away from the class
name; a call-site `TMixinOpts.binding` is never written back to the class.

Every registration now asserts its namespace. `Binding` tags only when the key has more than one
dot-separated part, so a namespace-less key binds untagged - never drained, never verified. Measured:
BANA declares no empty namespace; an EARLIER pass of this work reported one at `sms-otp-sender.ts:7`,
and that reading was WRONG.

`getOwnMetadata` means a subclass resolves nothing rather than borrowing its parent's binding - four
BANA repositories that inject their datasource by class depend on this.

Inferring from `design:paramtypes` was rejected, not overlooked: it becomes `undefined` with NO error
when an app's tsconfig `extends` a package path under bun.

## 2026-09-08 - storage reshapes end to end: safe content-type, catalogued errors, one S3 client, then MinioHelper returns deprecated

A stored upload no longer renders on the API origin: served content type is decided from the object
NAME through an allow-list, never from what a backend reports - on minio the uploader's own claim was
echoed back, which is stored XSS. Bun derives a multipart part's type from the FILENAME and ignores the
declared `Content-Type` header, so the attack arrives through the extension.

A missing object throws a catalogued `core.storage.object_not_found` (404); before, `disk` answered 400
and `bun-s3` answered 500. `DiskHelper` read and deleted OUTSIDE its bucket for a name of
`../secret.txt` - only `upload` had ever validated the name.

`listObjects` made ONE `list` call, silently truncating any bucket past 1000 keys; it now follows the
continuation token. `useRecursive` was ignored entirely on bun-s3, and `maxKeys: 0` read as unlimited on
both backends.

`Promise.all` over a caller-supplied list is a caller-sized burst: `upload`, `removeObjects` and
`RedisHelper.publish` now go through the repository's existing `executePromiseWithLimit`.

`IUploadResult` was `{ bucketName, objectName }`; now `{ bucket: { name }, object: { key, size,
contentType } }`, so a caller needs no second `getStat`. `metaLink`/`metaLinkError` became a
discriminated union. Five renames, all compiler-caught: `isBucketExists` -> `hasBucket`,
`getFile`/`getFileStream` -> `getObject`/`getObjectStream`, `getFileType` -> `getMediaType`,
`setObjectTags` -> `replaceObjectTags`.

Two route paths moved without a compile error: `POST /upload` -> `POST /objects`, `GET /download/{key}`
-> `GET /downloads/{key}` (the plural is reversed again on 2026-09-14, see above). The action stays
BEFORE the key, forced by Hono - a suffix route after a `{.+}` catch-all never matches.

`MinioHelper` was removed the same day (`BunS3Helper` with a MinIO endpoint replaced it), then REVERTED
(`2949e555`): `@venizia/ignis-helpers/minio` and `MinioHelper` publish again as `@deprecated`, so a
MinIO consumer need not absorb the storage reshape in one upgrade. The restored class meets the NEW
interface (`hasBucket`, `getObject`, catalogued 404); presign and tagging stay unimplemented.

## 2026-09-08 (b) - a namespace that would lose its tag is refused, and zod's deprecated alias is gone

`BindingNamespaces.createNamespace` now throws on a name holding `.` or whitespace, or an empty one.
`Binding` tags itself with the first dot-separated segment of its key, so a namespace with a second
segment produced a binding no boot step could drain by tag - bound, never configured, no error
anywhere.

`z.ZodTypeAny` is gone from the source: zod 4 deprecates it in favour of `z.ZodType`, identical types,
so the 26 sites were a rename. A type-aware `@typescript-eslint/no-deprecated` pass over all nine
packages now reports zero deprecated usages.
## 2026-09-07 - the asset seam closes at both ends: one configured bucket, and presign plus tagging

Two changes let an application drop its own S3 class.

Controller: `controller.bucket` takes a string or a per-request function. A fixed bucket produces `/assets/{objectName}` with no `/buckets/{bucketName}` segment, and the bucket-management routes disappear since they mean nothing with a fixed bucket. `rawObjectPath` is separate: by default `{objectName}` is one segment, so a nested key travels percent-encoded and the raw form 404s. Both are needed to serve links like `/assets/photos/2024/f.jpg`. `defineRoutesBefore` registers an application's own routes ahead of every built-in route, because Hono matches in registration order and a literal path must beat the catch-all.

Helper: `IStorageHelper` gains `presignPut`, `presignGet`, `getObjectTags`, `replaceObjectTags`. `BaseStorageHelper` implements all four by throwing with its own class name - a backend with no transport for them must say so, since returning undefined reads as a valid empty link or tag set. Bun's `S3Client` has `presign` natively but no tagging method, so tagging goes over signed HTTP through `buildSignedRequest`, which gained a `query` option: SigV4 signs the query string as its own canonical component, and folding `?tagging` into the path signs wrong. The signer now percent-encodes each path segment too - `fetch` encodes a key with a space or non-ASCII text on the wire, so signing the raw key produced 403 SignatureDoesNotMatch.

## 2026-09-07 - Atlas answers about code and releases; the last four copied-code seams close

Atlas grew from two tools to five. `symbol { name, package? }` reads `.agents/knowledge/reference/symbols.json`, generated by `scripts/atlas-symbols.ts` from every package's built `.d.ts` (the same surface `public-surface.ts` snapshots), plus a one-line signature and a `file:line` naming SOURCE, decoded from the `.d.ts.map` (path arithmetic is only the fallback). A single-identifier `search` query that matches a symbol carries it as a top-level field. `version { cwd? }` compares a project's installed `@venizia/*` versions against what the build knows. `changes { package?, from?, to? }` lists changelog entries between two versions, keyed by release date from `scripts/atlas-releases.ts`.

Two rulings: the default `changes` window walks back to the newest version of an EARLIER day, because several releases of one package can land on one day and the naive predecessor answers nothing; `version.snapshot` lists only packages that exist today (`livePackages`), while `changes` still reads a retired package's history. A changelog's packages are inferred by four rules in order - `packages:` frontmatter, a Details table's `Package` column, `@venizia/ignis...` mentions, then `packages/<dir>` paths - so prose in a `Package` column never invents a package; 9 of 118 files legitimately name none. A version window is keyed by COMMIT position (`order`, first-parent history), not by date: four kernel releases shipped on 2026-09-06, and a date window between any two of them is empty. `version` also reads a workspace root's `overrides`/`resolutions`.

Four extension seams closed the copied-code list BANA measured. `BaseKafkaHelper`'s members are `protected`. A worker application takes `configs.projectRoot`; because core-worker is browser-pure it cannot import `ModuleUtility` (node builtins at module level), so the `globalThis` slot moved to `ProjectRootRegistry` on `@venizia/ignis-helpers/core`, shared by both hosts. Every CRUD read verb (`find`, `count`, `findOne`, `findById`) ANDs `getBaseWhere()` into the request where; it is public, not protected, because a protected member on the factory's anonymous returned class fails declaration emit with TS4094. The static-asset controller takes `resolveObjectName` and `defineExtraRoutes`, threaded through the component options.

## 2026-09-07 - two AES tests asserted a probabilistic outcome

`TC-018`/`TC-019` decrypted with a wrong secret and asserted "throws" and "returns the input". A wrong key is not a deterministic failure: the IV is random per encrypt, and about one in 256 leaves valid PKCS#7 padding, so the cipher returns garbage instead of throwing. Measured with a probe in the package: 76 of 20000 runs, 0.38 percent - enough to redden a full-suite run every few hundred runs. Both tests now fail on a malformed message, which always fails, and a third test asserts the property that always holds: a wrong secret never yields the plaintext. Rule for a crypto test: assert the security property, or force a failure the algorithm cannot accidentally satisfy.

## 2026-09-07 - Atlas recognised the wrong repository as its own checkout

`isRepositoryCheckout` asked for two directories, `docs/wiki/content` and `.agents/knowledge` - a layout IGNIS invented and its consumers copy. BANA has both but no `docs/wiki/content/changelogs`, so repo mode was chosen in their repository and the loader threw `ENOENT` before the first JSON-RPC line; the MCP client reported `CONNECTION_CLOSED` and the packaged snapshot beside the binary was never reached. A marker must identify the repository, not its shape: the check now also requires the changelog directory and a root `package.json` named `@venizia/ignis-workspace`. Fixed in atlas 0.1.0-4; regression tests build a foreign-manifest root and assert it is not a checkout.

## 2026-09-07 - two stale claims corrected against the source

`WorkerApplication` was documented as having no `initialize()`, with "the only implementation is `BaseApplication`'s, in core-server". Wrong since `ac7fd020` (2026-08-18): `RestApplication` implements it as one line handing `getBootSequence()` to `runBootSequence()`, and the worker inherits it - `startServing()` calls it, and a test subclass calls `super.initialize()`. What a worker really lacks is what core-server composes AROUND the nine kernel steps: `printStartUpInfo`, `validateEnvs`, `hydrateSecrets`, `wireSecretRotatables`, the scope-filter check.

The changelog `2025-12-18-repository-validation-security` also ended on a stray opening fence left by the 2026-06-14 docs refactor, which swallowed its last section out of the Atlas index and rendered it as code; closing it removed the only warning the server printed at startup.

## 2026-09-06 - one-release batch: `projectRoot` readers, conditional index entries, generator ignore warning, `setListHeaders` from offset and total

Five framework changes land together in one chain (Phat's rule: small releases, not one per item, never bundle unrelated features - all five are seams BANA copied code to work around); a sixth item, `check` comparing the body, already shipped in boot 0.2.0-14.

`configs.projectRoot` (core-server) gains real readers: `ServerApplication.getProjectRoot()` calls `ModuleUtility.setProjectRoot()` (globalThis slot `ignis:project-root`), so `loadSync`/`assertInstalled` and the gRPC adapter resolve peers under `<projectRoot>/node_modules` - previously the binding was write-only and 16 BANA packages overrode the method to change a value nothing read.

`configs.artifacts` accepts `{ when, index }` entries (`IConditionalArtifactIndex`; `ArtifactIndexHelper.flatten` is async and takes `application`): the run-mode gate belongs here because `registerArtifacts` runs before `preConfigure` - a worker that gated controllers there mounted 7 unauthenticated routes.

`ignis-artifacts generate|check` print one `warning:` line per decorated class hidden by a USER `--ignore` glob (`ArtifactScanner.scanWithReport`); defaults stay silent. `check` compares the body below the header line, so a flag change alone is not drift.

`BaseRestController.setListHeaders` takes `{ offset, total }` beside `{ range }` (derived with `buildDataRange`); `toContentRange` is exported. Testing guide gained "one invocation per project" (env file, scope, preload).

## 2026-09-06 - atlas minor-findings round: level-aware logging, page-only snippets, one layout module

`StderrLogger` now honours a threshold (`APP_ENV_LOGGER_LEVEL`, default `info`), read once per instance, so debug lines from `ChunkStore`/`Chunker` no longer reach a client by default. `search()` now fetches `snippet()` only for the page it returns, not every matching row (`a*` 85-90ms -> 35-40ms on the real corpus); the snippet drops its `[`/`]` highlight markers. `symbols` keeps only identifier-shaped tokens (camelCase/PascalCase/snake_case/SCREAMING_CASE/dotted), dropping plain prose swept in from fenced code. `common/layout.ts` is now the one place owning the checkout markers and the snapshot directory name, replacing three separate copies. `--root` is validated: given explicitly and not a checkout, the server exits 2 naming the directory instead of silently falling back to a packaged snapshot; given with no value, exit 2 with usage instead of silently using `cwd`. `FreshnessGuard`'s constructor now fingerprints before it builds, matching `getStore()`, so a file added during the initial build is no longer permanently invisible. `initialize` negotiates `protocolVersion` against three supported versions instead of echoing anything a client sends. No changelog - a fix round on unreleased Minor findings, not a user-facing feature.

## 2026-09-06 - helpers declares `@hono/zod-openapi` as a peer; generator header prints the real command

The packed `@venizia/ignis-atlas` died outside the workspace on `Cannot find module '@hono/zod-openapi'` from the helpers root barrel: `error/schemas.ts` imports it, and helpers listed it only in `devDependencies` (kernel, connectors, core-server, core-worker all declare it as a peer). Now a peer (`^1.5.1`) plus `root-barrel-dependencies.test.ts`, which walks the static import closure of `src/index.ts` and reported exactly this package before the fix. In boot, `ArtifactIndexEmitter` lost the fixed `HEADER` string; `renderHeader({ root, out, ignore, exportName })` prints the flags the CLI ran with (BANA writes `src/_artifacts.ts` with `--ignore`, and the header pointed at `src/generated/artifacts.ts`). Changelog `2026-09-06-helpers-peer-and-generator-header`.

## 2026-09-06 - `configs.server` carries `Bun.serve` options

BANA's commerce package copied the whole of `startBunModule` (40 lines, frozen at the 2026-08-21 kernel) to add one line, `idleTimeout: 60`. `IServerApplicationConfigs.server` now takes `idleTimeout` and `maxRequestBodySize`; `getServerRuntimeOptions()` drops unset keys so Bun's defaults survive, `startBunModule` spreads the result into `Bun.serve`, and `startNodeModule` warns that the group is ignored. Core-server only - the kernel stays free of Bun types. Changelog `2026-09-06-bun-serve-options`.

## 2026-09-06 - bare `@repository()` inherits the parent's model and datasource; console-fallback warning moves to the first log line; `ignis-artifacts` is quiet

BANA's index adoption (iden-2) has 54 repository subclasses that only add methods. `repository(metadata?)` now takes an optional argument: with none, it reads the nearest decorated parent's `model`/`dataSource`/`operationScope` through the prototype chain (own metadata does not exist yet at decoration time) and declares its own artifact metadata with no registration options, so the generator lists the subclass and it registers under its own name; no parent throws at decoration, naming the class (`kernel/src/base/metadata/persistents.ts`).

In helpers, `LoggerResolver` warns about the console fallback inside the console resolver (first routed line), not in `resolve()` - the old placement fired during the barrel import because `applicationEnvironment` (a `BaseHelper`) is constructed before `logger/factory` evaluates. The `ignis-artifacts` CLI imports `common/install-quiet-logger` first (`QuietLogger`: debug/info dropped, warn+ to stderr). Changelog `2026-09-06-repository-inheritance-and-quiet-cli`.

## 2026-09-06 - `applicationEnvironment` and `ModuleUtility`'s registry shared across module copies; `configs.path.base` guard

BANA proved seven long-red invoice tests came from two `applicationEnvironment` instances in one process (the TypeScript test through `import` -> dist/esm, `@nx/core/dist` through `require` -> dist/cjs). Both now live in `globalThis` under `Symbol.for('ignis:application-environment')` and `Symbol.for('ignis:module-registry')`, the pattern `LoggerFactory` already used. The test that proves it loads the module twice through `require` plus `delete require.cache[path]` - Bun does NOT create a second copy for a `?query` URL, so that form is not a positive control.

`RestApplication` now throws at construction when `configs.path.base` is not a string (a consumer's `process.env.X!` produced `undefined` and the failure surfaced inside `@hono/zod-openapi`'s `route()` at `start()`). Rule for new code: module-level state in helpers goes behind a `Symbol.for('ignis:...')` slot; in kernel behind `SingletonRealm`. Changelog `2026-09-06-shared-singletons-across-module-copies`.

## 2026-09-06 - `ignis-docs-mcp` and `ignis-knowledge` retire; `@venizia/ignis-atlas` is the one MCP server

Both retrieval MCP servers are gone. `ignis-docs-mcp` (`docs/wiki/mcp-server`, 10 tools, Fuse.js fuzzy search, changelogs excluded, uncapped whole-file reads) and `ignis-knowledge` (`.agents/knowledge-tools/mcp.ts`, `okf_search`/`okf_list_concepts`/`okf_get_concept`, presence-only ranking) are both replaced by one new package, `@venizia/ignis-atlas` (`packages/atlas`). Two tools, `search` and `get`, cover both: `bun:sqlite` FTS5, BM25 ranking, budgeted responses, a citation on every hit.

Repo mode indexes the wiki, the changelogs and this bundle from the live tree, and re-checks freshness before every call (measured under 1 ms). Npm mode (`bunx @venizia/ignis-atlas`) runs the same engine over a packaged snapshot of the wiki and the changelogs only - this bundle is never shipped. Golden ranking test: 7 of 7 on the real corpus, 364 documents, 4165 chunks, an index build around 265 ms.

`.mcp.json` now starts `ignis-atlas`. Every `okf_search`/`okf_list_concepts`/`okf_get_concept`/`ignis-docs-mcp` mention across `AGENTS.md`, this bundle and the wiki is updated to `search`/`get`. New concept: [atlas](/packages/atlas.md). Changelog: [ignis-docs-mcp is replaced by @venizia/ignis-atlas](/changelogs/2026-09-06-ignis-atlas).

## 2026-09-05 - core-server drops its unused `@venizia/ignis-boot` dependency; `make lint-scripts` covers `scripts/purity/`

`packages/core-server/src` had no import of `ignis-boot` since the runtime boot API was removed, so the `dependencies` entry only forced every consumer to install it. Removed; `boot` is now a leaf off `helpers` that applications declare themselves for `ignis-artifacts`, `make build-all` names it explicitly, and the chain concepts read `... -> kernel -> connectors -> core`. `make lint-scripts` now globs `scripts/**/*.ts` (it skipped `scripts/purity/`; the four files were formatted).

## 2026-09-05 - opt-in boot checks: `verifyBindings` step, no-hand-registration strict mode, app-wide no-override

Asked for by BANA's identity lane (iden-1) for the artifact-index migration, approved by the PO. `configs.bootChecks.binding.doVerify` adds `BootSteps.VERIFY_BINDINGS` after `postConfigure` (server sequence: 15 steps, `verifyBindings` before `validateScopeFilterSupport`): `get` every binding in the `services` and `repositories` namespaces, collect, throw once with every failing key - a made-up `@inject` key or a `when`-excluded dependency fails the boot instead of the first request. `configs.bootChecks.binding.allowManual: false` makes `registerArtifact` throw when called inside `preConfigure()`/`postConfigure()` while `configs.artifacts` is set (the hooks run under `runApplicationHook`, so index and framework registrations are exempt). `configs.bootChecks.binding.allowOverride: false` makes `assertNoBindingCollision` default `allowOverride` to `false` (an explicit `true` on the decorator or at the call site still wins); `bind()`, `set()` and `@provide` never pass through the guard, so runtime rebinding is untouched - the PO approved this once that was measured.

The three form one `binding` group of required booleans (the PO reshaped it from three `should*` flags mid-task); without the group nothing is checked. One proposal was declined on purpose: index entries as option objects (no consumer once iden-1 found the "shared class with two conditions" was two same-named classes).

Tests: `kernel/__tests__/applications/boot-checks.test.ts`; step-count assertions moved 8/9 -> 9 and 14 -> 15 in `boot-sequence.test.ts`, `layering.test.ts`, core-server `lifecycle.test.ts`. In the same change, `registerArtifacts` handed index resolution (flatten, `when`, `order`) to `ArtifactIndexHelper` (`applications/artifact-index.ts`, a `BaseHelper` singleton kept out of the barrel), and `when` conditions of one kind now evaluate concurrently instead of awaited one by one - `rest.ts` went 609 -> 554 lines, still over the 500-line prompt on purpose: what remains is the application's own lifecycle (boot orchestration, registration, HTTP shell). `artifact-index.test.ts` holds a positive control for the concurrency (a `when` that waits for a later one).

## 2026-09-05 - list-response contract: `respond` takes a range, `setListHeaders`, `ResponseFormats`; `POST /search` sends the list headers

`respond` and `normalizeCountData` moved up from `AbstractCrudController` to `BaseRestController` (no caller outside it). `respond({ context, format, payload, range? })` is the ONE response call - with `range` it also writes `Content-Range` (a `respondList` was built first and folded back in on the PO's call: one method with options, not a specialised sibling); `setListHeaders({ context, range, count })` serves bodies that are not the envelope; `format` is the const class `ResponseFormats` (`OBJECT`/`ARRAY`, `TResponseFormat`) instead of string literals; the option `responseData` is now `payload` (BANA: 6 `normalizeCountData` call sites rename). The CRUD `find()` passes its range.

`AbstractSearchController.search()` used to answer with a bare `context.json()` and no header - the one place in the repo setting `Content-Range` was the CRUD read tier - so it now sets the list headers (`start` from `filter.skip`/`filter.offset`, raw mode from the engine's `offset` or `page` x `per_page`; `total` from `found`), body unchanged; `isFoundExact` in the body stays the only "found is an estimate" signal (an `X-Response-Count-Exact` header was built and then dropped on the PO's call the same day).

Contract locked by the PO on 2026-09-05: `total` exact and never `*`, `X-Response-Count` = rows of this response, `X-Response-Format: array`, `{ count, data }` or the bare array on `x-request-count: false`, no list depends on `/count` (the factory verb stays opt-in). Not adopted: window counts (measured 1.9 s at 237k rows by BANA). Tests: `kernel/__tests__/controllers/list-response.test.ts`, `connectors/__tests__/search/controllers/factory.test.ts`.

## 2026-09-04 - evening dependency pass: every in-range update taken, three majors held with reasons

`bun outdated --filter '*'` listed 32 rows. The 23 in-range ones moved via `bun update` (catalog `hono` ^4.13.7 and `@hono/zod-openapi` ^1.6.3 rewritten by it; pglite 0.5.8, kafka client 2.11, dotenvx 2.23, react 19.2.8, vite 8.2.2 and friends in the lockfile). Two range changes measured green: `meilisearch` peer `^0.59.0 || ^0.60.0` (dev 0.60.0), and the exact PGlite override 0.5.8 (the pin stays exact - Drizzle store identity - only the number moved; gotcha updated). Held: `bullmq` 6 (backend factory, repeatables removed, ioredis optional peer), `ioredis` 6 (RESP3 default), `typescript` 7 (no JS API), `@libsql/client` 0.18, `@scalar` 0.12.

Trap met on the way: `bun update --filter '*'` also raised 28 `peerDependencies` floors; all restored to HEAD except the two deliberate ones (gotcha added). `@platformatic/kafka` 2.11 (dev) surfaced that 2.10 removed the module-scope `require()` the `platformaticRequirePlugin` hoists: the two negative-control tests in `kafka/bundler.test.ts` now assert the upstream fix (no bare specifier, binary boots without the plugin); the plugin stays, inert on >= 2.10 and needed for 2.8-2.9 (peer range `^2.6.1`); wiki `compile-binary.md` says so.

## 2026-09-04 - boot peer `typescript` narrowed to `^5.0.0 || ^6.0.0`; eslint floor 10.10.0

`bun outdated` offered TypeScript 7.0.2 as an in-range update for `@venizia/ignis-boot`'s peer `>=5.0.0`. Measured: `typescript@7.0.2` exports only `version` and `versionMajorMinor`, while the artifact scanner calls `ts.createSourceFile`, `ts.forEachChild`, `ts.SyntaxKind`, so a 7.x install would have crashed `ignis-artifacts`. Peer narrowed to the two majors that carry the JS API (same range as dev-configs); `packages/boot.md` and the wiki bootstrapping reference say so. TypeScript itself stays 6.0.3 (typescript-eslint 8.69 still peers `<6.1.0`). eslint catalog ^10.10.0, lint-all clean. The peer change is a published manifest: it ships with the next boot release.

## 2026-09-04 - `@types/bun` ^1.4.1; the 1.4.1 WebSocket pause/resume API is client-side, nothing to mirror

Catalog `@types/bun` moved to ^1.4.1 the hour it was published, so the types match the Bun CI installs. build-all, lint-all, helpers and core-server suites unchanged. Measured in bun-types 1.4.1: `pause()`, `resume()` and `isPaused` live on the client `WebSocket` and the TCP `Socket`, not on `ServerWebSocket`, which helpers' `IWebSocket` mirrors - `getBufferedAmount()` there predates 1.4.1. The only server-side addition is `binaryType: 'blob'` in the handler config, which the mirror does not expose because the `message` handler type would have to follow it. No mirror change.

## 2026-09-04 - Bun 1.4.1 follow-ups: make test targets run `--parallel`; class-rename gotcha splits by build mode

`make test-<package>` / `make test-all` are now the one home of the test flags (`BUN_TEST_FLAGS`, default `--parallel`) and CI calls them. Bun 1.4.1 stopped `--isolate` leaking between files; every suite is green under it with unchanged counts (helpers 1461 + 16 skip, core-server 1309 + 1 skip, connectors 1238 + 1, kernel 197, core-worker 85, inversion 41, boot 9). Speed is a wash (helpers 11.0s against 11.9s, core-worker slower); the gain is isolation. `testing.md` step 3 corrected: boot runs its `src/__tests__` sources, not compiled dist tests. Gotcha "renamed classes": 1.4.1 fixed the plain build (`X2` gone) but not `--minify-syntax` (`X_1`), which every compiled binary uses, so the `Class.name` key rule stays. WebSocket `pause`/`resume`/`bufferedAmount` mirrors wait for `@types/bun@1.4.1` (`@types/bun@1.4.0` pins `bun-types@1.4.0` exactly).

## 2026-09-04 - supabase import purity waiver dropped; the gate needs Bun >= 1.4.1

The connectors release (run 33859305837) failed the purity gate with "STALE WAIVER": `connectors/postgres/supabase [import]` is browser-pure under Bun 1.4.1, which the release workflow installs via `bun-version: latest`, while Bun 1.4.0 still fails the row with `drizzle-orm/supabase` unresolved. The waiver in `scripts/purity/manifest.ts` is gone; the row is measured (21/21 pure, 7 waived on 1.4.1; exactly that row red on 1.4.0). `packages/connectors.md` waiver table now lists seven rows; `process/build-system.md` item 8 names all six claiming packages; gotcha recorded.

## 2026-09-04 - dependency floors raised; audit 126 -> 6 with reasons

Every catalog range moved to its latest compatible release (hono 4.13.5, zod 4.5.4, @hono/zod-openapi 1.6.2, pg 8.23.0, typesense 3.0.6, bullmq 5.81.4, @scalar/hono-api-reference 0.11.16, tsc-alias 1.9.4, @types/bun 1.4.0, eslint 10.9.1, prettier 3.9.6); docs-mcp `@mastra/*` minors; `eslint-plugin-unicorn` 74 and `@vitejs/plugin-react` 6 (dev only) kept because lint and the example build stayed green. bun-types 1.4 forced `IWebSocket.send` / `IBunServer.publish` to concrete binary types (gotcha recorded). Not bumped: ioredis 6 (BullMQ needs 5), @scalar 0.12 (apps pin 0.11.11), @libsql/client 0.18 (broke the sqlite example types). Audit: 126 -> 6; the six that stay are named with reasons in the changelog and in gotchas. Lockfile refreshed (it was stale against the manifests). Consumers pinning exact versions raise their overrides per the migration guide table.

## 2026-09-03 - file split: last multi-topic hubs; `split-report` covers examples by default

Task F2 closed the file-split epic's last three multi-topic hub files and made `split-report` scan `examples/*/src` by default, alongside `packages/*/src` (previously `examples/` needed an explicit argument).

`helpers/modules/secrets/common/types.ts` (13 exports) split into `common/types/{lease,helper,registration,timer}.ts` plus an index barrel: `lease.ts` holds `ISecretLease`, `ISecretRotationEvent`, `TSecretRotationHandler`, `ISecretRotatable`; `timer.ts` holds `IClock`, `TTimerHandle`, `ITimerAdapter`; `registration.ts` holds `ISecretHydrateEntry`, `ISecretLeaseEntry`, `ISecretsRegistration`; `helper.ts` holds `IGetSecretOptions`, `ISecretsHelper`, `ISecretsHelperOptions` and is the one parent file, importing both `./lease` and `./timer`; `registration.ts` needs neither sibling, only `../constants`.

`helpers/modules/socket/socket-io/common/types.ts` (13 exports) split into `common/types/{client,hooks,server}.ts`: `client.ts` (`IHandshake`, `TSocketIOClientState`, `ISocketIOClient`, `IOptions`, `ISocketIOClientOptions`) imports no sibling; `hooks.ts` (the four `TSocketIO*Fn` handler types) imports `./client`; `server.ts` (the three `ISocketIOServer*Options` interfaces plus `TSocketIOServerOptions`) imports `./hooks` - chained `client -> hooks -> server`.

`kernel/base/models/common/types.ts` (12 exports) split by kind as well as topic. Six pure id types - `NumberIdType`, `StringIdType`, `BigIntIdType`, `IdType`, `TEntityId` with its `entityIdBrand` symbol, `TIdSchemaType` - moved to `common/types/id.ts`. Six runtime values moved to two new code files: `ErrorSchema`, `idParamsSchema`, `jsonContent`, `jsonResponse` (zod/OpenAPI builders) to `common/schemas.ts`; `toEntityId`, `snakeToCamel` to `common/utilities.ts`. Six importers repointed to the barrel `@/base/models/common`.

Final ruling on all ten hub candidates `split-report` has flagged since wave 0:

| File | Exports | Verdict | Why |
|---|---|---|---|
| `helpers/modules/secrets/common/types.ts` | 13 | split | four topics: lease/rotation, helper contract, hydrate/lease registration, clock/timer |
| `helpers/modules/socket/socket-io/common/types.ts` | 13 | split | three topics: client shape, event/auth hooks, server options |
| `kernel/base/models/common/types.ts` | 12 | split | id types vs. zod/OpenAPI runtime code - a kind split, not only a topic split |
| `filter/common/types.ts` | 11 | kept | one filter-query DSL, no internal seam |
| `inversion/common/types.ts` | 11 | kept | 27 lines - a small utility-type grab bag |
| `inversion/modules/error/common/types.ts` | 15 | kept | one error DSL |
| `helpers/modules/crypto/common/constants.ts` | 12 | kept | one hashing/KDF constants family |
| `helpers/modules/logger/hf/common/constants.ts` | 14 | kept | one binary ring-buffer record layout |
| `helpers/modules/tree/common/types.ts` | 11 | kept | one generic tree-walk API |
| `kernel/base/repositories/common/constants.ts` | 13 | kept | six related const classes, a family |

Gate: helpers 1461/16/0, kernel 197/0, core-server 1309/1/0 (the true, unchanged baseline - D1's fix round added `removed-members.test.ts`). Lint clean across helpers, kernel, core-server, examples. Cycles 0 on helpers and kernel `dist/esm`. Surface fresh - no export added or removed. `split-report` hub candidates: helpers 5 -> 3, kernel 2 -> 1; `examples/vert` now appears in the report with no argument.

## 2026-09-03 - file split epic, waves 0-5: tooling, then kernel, core-server, helpers, connectors group, and vert examples

Wave 5 alone is 15 commits on 2026-09-03, every one a `refactor(examples)` splitting one vert test service into case groups - the range is what to read, not the individual hashes.

Six waves split every hub file the repository had. Wave 0 built the tools; waves 1-4 split one package group each; wave 5 split the example application's test services.

Wave 0 - tools. `make split-report` lists hub candidates, stray `types.ts`/`constants.ts`, scope folders without a barrel, files over 500 lines and import cycles per package - informational, never a gate. `bun scripts/module-cycles.ts <dist/esm> --max 0` fails on an import cycle in a built ESM tree. `make surface-gen`/`make surface-check` read the TypeScript compiler API over every package's built `.d.ts` and freeze every exported symbol into `reference/public-surface.md`; a split that changes the surface fails the gate, an intended API change reruns `surface-gen`. Positive control: appending a symbol to `packages/filter/dist/cjs/index.d.ts` turned the check `stale ... exit=1`, `make filter` restored `fresh ... exit=0`. Baseline import-cycle count per package's `dist/esm`: inversion 1 (`app-error.js <-> message-code.js`), every other package 0.

Wave 1 - kernel (eleven tasks). Split every hub file `split-report` flagged, one topic per file, except two: `base/repositories/common/constants.ts` (13 exports, six related const classes, a family) and `base/models/common/types.ts` (12 exports, unsplit until task F2 above). Split: `base/auth/authorize/common/constants/` and `common/types/` (by topic); `base/auth/authenticate/common/types/` and `common/constants/` (by topic); `base/repositories/common/types/` (contracts, options, results); `base/controllers/common/types/` (controller, route, context - `controllers/context.ts` now imports its own common folder relatively, not through `@/`); `base/applications/common/{constants.ts,types/}`; `helpers/inversion/common/{constants.ts,types/}`; `common/statuses/` (one file per entity - common, migration, role, user - instead of one file with six classes). Three stray `types.ts` files (mixins, services, app-error middleware) moved under `common/`. `RouteConfigResolver` on `controllers/factory/definition.ts` is the one surface addition: seven exported route-config functions became public aliases of private statics on the class.

Rule: a file that composes its siblings may import all of them without tripping the over-split rule; the three parents are `authenticate/common/types/options.ts`, `repositories/common/types/contracts.ts`, `controllers/common/types/controller.ts`. Gotcha: an incremental `bun run build` after a `types.ts` file becomes a `types/` folder leaves the stale `types.js` on disk beside the new folder, and tsc-alias resolves the barrel import to that stale file - only a clean rebuild (`make <package>`) is safe to trust after a split. Gate: kernel 197/0, core-server 1311/1/0, connectors 1238/1/0, lint 0, module cycles 0, surface fresh, okf check OK, docs build clean.

Wave 2 - core-server (three tasks). `components/mail/common/types/` split the mail component's 32-declaration hub into five topic files (`message`, `options`, `template`, `verification`, `queue`) and moved `MailProviders`/`TMailProvider` into `common/constants.ts`. One class per file landed in `mail/services/generators/`, `api-reference/ui/` and `auth/authorize/adapters/scoped-casbin/` (with its own `common/` folder). Two stray `types.ts` files (`base/applications/types.ts`, `auth/authorize/adapters/types.ts`) moved under `common/`. Lesson (`DEFAULT_SCHEMA`): a module-private `const` moved into its own `common/constants.ts` needs an export to cross the new file boundary, and a naive `export *` folder barrel then carries that export to the package root; `make surface-check` caught the leak (surface grew by one symbol), fixed by a named re-export of the other four `common` types from `scoped-casbin/index.ts` instead of `export * from './common'`. `core-server/connectors/{postgres,sqlite}/drivers/` deliberately keep no `index.ts`: each driver file is an alias barrel for one `@venizia/ignis-connectors/<engine>/<driver>` sub-path carrying an optional peer, and a folder barrel would let one `export *` drag every peer into the root - `split-report` keeps flagging them and that is expected. Gate: core-server 1311/1/0, lint 0, surface fresh, okf check OK, docs build clean.

Wave 3 - helpers (six tasks). `common/types.ts` (31 exports) split into `common/types/{utility,class,const-value,resolver,field-mapping,injection}.ts` plus an index barrel; `resolveValue`/`resolveValueAsync`/`resolveClass` (and the `isClass` re-export) moved to `common/resolvers.ts`. `logger/winston/` split into `formats.ts` (`WinstonFormatFactory`), `logger-factory.ts` (`WinstonLoggerFactory`), `common/constants.ts`. `logger/pino/` split into `destination.ts`, `backing.ts`, `common/constants.ts`; `pino/define.ts` is gone. `worker-thread/` split by role: `worker/{abstract,base}.ts`, `thread/{abstract,base}.ts`, `bus/{abstract,base}.ts`, `bus/handler/{abstract,base}.ts`, `common/types.ts`. `queue/kafka/common/types/` and `socket/websocket/common/types/` each split an 18-export hub by topic. Seven stray `types.ts` files (`env`, `pool`, `storage`, `network/http-request`, `network/http-request/fetcher`, `queue/internal/hf`, `queue/internal/sequential`) moved under `common/types.ts` each. No public export added or removed.

Lesson: an importer list built only from `from '...'` statements misses inline `import('./types').X` expressions and `@/modules/<scope>/types` alias imports in tests - the `file-splitting` convention now carries the grep and names a clean rebuild as the real completeness check. Stayed out of scope: four files over 500 lines (`queue/kafka/consumer.ts`, `redis/base/abstract.helper.ts`, `socket/socket-io/server/helper.ts`, `socket/websocket/server/helper.ts`) and five hub candidates, ruled one topic each despite export count - `crypto/common/constants.ts` (hashing/KDF family), `logger/hf/common/constants.ts` (binary ring-buffer layout), `tree/common/types.ts` (generic tree-walk API) stay; `secrets/common/types.ts` and `socket/socket-io/common/types.ts` split later, in task F2. Gate: helpers 1461/16/0, kernel 197/0, core-server 1311/1/0, lint 0, module cycles 0, surface fresh, okf check OK, docs build clean.

Wave 4 - connectors, core-worker, boot, filter, inversion (five tasks plus a 4.6a link-rot repair and a 4.7 follow-up). Typesense's `types.ts` (18 exports) split into `common/{constants,types/{schema,search,client,options}}`; `internal/connector-internal.ts` split into `internal/{guards,mappers,outcomes,connector-internal}`. Meilisearch's and search-core's stray `types.ts` files moved under `common/`. 4.7 then split the three connectors hub files still flagged: search-core's `common/types.ts` (13 exports) into `common/{constants,types/{collection,document,embedding,field}}`, and the postgres/sqlite `common/types.ts` pair (15 exports each) into matching `common/types/{table,enrichers}` folders. `core-worker`'s `transport/shared.ts` (534 lines, two classes) split into `transport/shared/{transport.ts, common/{constants,types}}` behind a by-name `index.ts` barrel - never `export *`, which would have leaked five package-private symbols to the public surface. `boot` and `filter` each gained the `common/index.ts` barrel their `generator/common`/`schemas/common` folders were missing. `inversion`'s `error/types.ts` moved to `error/common/types.ts`, and its `message-code.ts` <-> `app-error.ts` import cycle was cut one-way (`message-code.ts` no longer imports `app-error.ts`); `MessageCode` now throws through a private `errorFactory` field `src/index.ts` registers.

Two lessons. A module-level registration survives a tree-shaking bundler only from a module the package's `sideEffects` array lists: the first fix put `MessageCode.useErrorFactory(...)` at the bottom of `app-error.ts`, which `sideEffects` never names, so a bundle importing only `MessageCode` dropped the whole module and `MessageCode.build` fell back to a bare `Error` with no `statusCode`; the fix moved the call into `src/index.ts`, backed by a subprocess-bundled test pinning the identity. Doc paths rot silently across a lift: the wiki and the knowledge bundle carried 111 dead `packages/core-server/src/...` paths from earlier lifts; `wiki-source-links.ts` (4.6a, swept 281 dead paths, added `make wiki-links-check` to `build-all`) makes the rot a build failure, and this close extended it to a knowledge concept's frontmatter `resource:` field too, catching five more stale values a link-only rule cannot reach.

Stayed out of scope: five connectors files already over 500 lines (a prompt to explain, not a defect), and `inversion/error/common/types.ts` (15 exports, moved into `common/` without a topic split). Gate: inversion 41/0, boot 8/0, helpers 1461/16/0, kernel 197/0, connectors 1238/1/0, core-server 1311/1/0, core-worker 85/0 (filter has no tests); lint clean across all eight packages plus examples; cycles 0 on every `dist/esm` package (inversion's cycle is the one that dropped, 1 to 0); surface fresh; okf check OK (70 files, 68 concepts); wiki build clean (288 pages, 279 links); `wiki-links-check` 0 missing.

Wave 5 - vert examples. Twelve `examples/vert/src/services/tests/*-test.service.ts` files became a runner `service.ts` plus one `<group>.cases.ts` file per case group: 77 files, 261 case methods, twelve folders. Every case-group class extends a new `BaseTestCases`, built from a shared `ITestCaseContext` that `BaseTestService.caseContext()` assembles once per run. Two suites stayed one file each (`field-selection-test.service.ts`, `json-orderby-test.service.ts`) - too small to split. Groups split: `crud` into `create`/`read`/`update`/`delete`/`values`; `operators` (54 cases, the largest group), `user-audit`, `default-filter`; `hidden-properties`, `inclusion`, `transaction`, `json-filter`; `json-update`, `array-operator`, `row-locking`, `advanced-filter-query`. `row-locking` is the one `@service()`-decorated suite and the only one `postConfigure()` runs today; its split regenerated `src/generated/artifacts.ts`. Group names departed from pre-read guesses once case bodies were actually read: `transaction`'s guessed `nested` became `composite` (no savepoint API exists); `json-update`'s guessed `set`/`merge`/`remove` became `paths`/`multi-path`/`integrity` (every case is a dot-path set, none a merge or delete). Every moved case was verified byte-for-byte, allowing only three mechanical rewrites (`this.<repo>` -> `this.context.<repo>`, `this.logCase(` -> `this.context.logCase(`, `this.logger` -> `this.context.logger`) plus dropping `private` from the signature. A fix round gave `operators` and `user-audit` (the two suites with a shared per-case fixture) a common shape: `support.ts` exports the fixture class plus an abstract `XxxCases` holding the fixture instance and its wrapper method.

D1 (deprecated boot API removal, see below) ran interleaved on the same branch. One commit (`63ba805c`) carried an accidental passenger: a concurrent implementer's already-staged, content-identical rename rode along on a bare `git commit` that picked up the whole shared index - confirmed a pure rename, 0 content lines changed, left in history rather than rewritten; every commit after that point used `git commit -- <paths>` instead of a bare `git commit`.

Gate (epic close): vert `build`/`lint`/`check:artifacts`/`compile:linux` exit 0; the compiled binary reaches `postConfigure` (boot step 13/14) and fails only with `ECONNREFUSED` against refused ports, proving DI still resolves after the folder move. `make lint-examples` clean. `split-report` run with an explicit `examples/vert` argument shows no file over 800 lines under `services/tests` (largest: `user-audit/edge.cases.ts`, 582 lines). Whole-repo `make build-all` exits 0; `wiki-links-check` reports 1230 paths checked, 0 missing; wiki builds 289 pages, 280 links, no orphan, no dead link. `make okf-gen && make okf-check` regenerate byte-identical: 70 files, 68 concepts, all conform. Against the wave-0 baseline: cycle count 0 in every package, stray `types.ts` 0 in every package, every scope folder has a barrel except the two intentional driver alias folders in `core-server`. Hub candidates: `connectors`, `boot`, `core-worker`, `core-server`, `dev-configs` at 0; `helpers` (5), `filter` (1), `kernel` (2), `inversion` (2) still carry residuals, out of wave 5's scope and already deliberate. `public-surface.md`'s entire git history is three commits across the whole epic: the baseline, wave 1's `RouteConfigResolver` rename, and D1's removals.

## 2026-09-03 - deprecated boot API removed (D1)

`IArtifactOptions`, `IBootOptions`, `IBootReport`, `IBootPhaseReport`, `TBootPhase`, `BootPhases`, `IBootableApplication` and `boot/src/common/` are gone from `@venizia/ignis-boot`. `BaseApplication.boot()` and `hasWarnedBootDeprecated` are gone from `core-server`; `IApplicationConfigs.bootOptions` and its kernel mirror (`IApplicationArtifactOptions`, `IApplicationBootOptions`) are gone from `kernel`. `BindingNamespaces.BOOTERS` is gone, and so is the dead `base/services/base-crud.ts` placeholder.

User-ordered full removal (`a6d5e5e9`), not a deprecation cycle: measured zero IGNIS usage outside the deleted sites before deleting. BANA carries 3 `.boot()` call sites, 2 `bootOptions` config literals and 16 `override async boot()` sites that now fail to compile. See the [changelog](/changelogs/2026-09-03-deprecated-boot-api-removed).

Fix round 1 (Opus review): `ArtifactScanner.scan()`'s `ignore` option was replacing `DEFAULT_IGNORE` instead of merging with it, contradicting every doc that already described it as additive - fixed the code, not the docs. Added `removed-members.test.ts` pinning `boot`, `booter` and `registerBooters` absent from `BaseApplication.prototype`.

## 2026-09-02 - `ArtifactScanner` is a `BaseHelper` singleton

`packages/boot/src/generator/scanner.ts`: `ArtifactScanner` extends `BaseHelper`, is reached through `ArtifactScanner.getInstance()`, and `scan` plus its private steps and the logger are instance members (user rule: a helper that does work and logs is not a static bag with a static logger). Callers: `generateArtifactIndex`/`checkArtifactIndex` and the scanner tests. Emitted index unchanged (`vert` `check:artifacts` fresh); boot 8/8, lint 0.

## 2026-09-02 - no string literal where a const class exists: `ArtifactIndexFields`, boot's `ArtifactTypes`

The five `selectArtifacts({ field: 'dataSources' })` calls in `RestApplication.registerArtifacts` now read `ArtifactIndexFields.DATA_SOURCES` and so on (new const class in `packages/kernel/src/base/applications/constants.ts`, exported from the barrel); each selected list is bound to a named const before its loop. `@venizia/ignis-boot` mirrors both vocabularies as const classes in `generator/common/constants.ts` (`ArtifactTypes`, `ArtifactIndexFields`; boot cannot depend on kernel) and its scanner, emitter and `EMIT_ORDER` use them; `TArtifactType` is derived from the class, no longer a hand-written union. Rule of thumb, now recorded: a string literal at a call site where a const class exists is a defect, and an inline `await` in a loop head is not written.

## 2026-09-02 - bundled and compiled applications: helpers exports stay defined, `NODE_ENV` stays a runtime read, one logger provider across copies

Found while proving the vert binary: it crashed at import on every commit back to the ESM builds, so none of this is Part 4. Four fixes.

(1) `secrets/factory.ts` imported its two providers with `await import('./x/index.js')`; bun turned everything those modules reach into lazy `__esm` initializers, and the root barrel exported `undefined` for `Environment`, `applicationEnvironment` and `LoggerFactory`. The imports are static now (the optional peers were already behind `ModuleUtility.load`).

(2) `bun build` folds `process.env.NODE_ENV` into the build host's value even under `--compile`; `Environment.ambient` is the destructured, unfoldable read, used by the error middleware, the request spy, the logger debug gate and the examples. Compile scripts add `--env=disable` for third-party code.

(3) A bundle carries helpers twice (ESM for the app, CJS for core), so `LoggerFactory.use()` from the app was invisible to the framework's copy; the provider now lives in `globalThis[Symbol.for('ignis:logger-provider')]`, and vert/rpc-api-server register `WinstonLogger` at the entrypoint because the `createRequire` default cannot resolve in a binary.

(4) bun renames every tsc-emitted decorated class expression (`X` -> `X2`, `X_1` under `--minify-syntax`; `--keep-names` does not help), so vert's eight literal binding keys broke; they are `BindingKeys.build({ key: X.name })` now, and the compile scripts stop minifying identifiers.

Guards: `helpers/src/__tests__/env/bundle-safe-reads.test.ts` (barrel exports through the CLI, ambient read, positive control that the bare read IS folded) and `logger/provider-slot.test.ts`. Measured after: the vert binary boots through 12 steps and fails only at `postConfigure` with `ECONNREFUSED` against refused ports - identical to `bun dist/index.js`. Open: the renamed class names still show in logs and keys (`controllers.JWKSController2`); a build plugin that restores names is the candidate fix. BANA does not compile binaries and still runs tsc output, so none of this reaches them today; their 380 literal keys would break only under a bundler.

## 2026-09-02 - Part 4: decorator-driven artifact registration; `configs.artifacts` boot step; runtime booters retired; examples adopt it

`@injectable` is the root stereotype (`packages/kernel/src/base/metadata/injectable.ts`); `@service`/`@component` are new; `@controller`/`@repository`/`@datasource`/`@model` record the same `IArtifactMetadata` (`binding`, `allowOverride`, `scope`, `order`, `when` returning `ValueOrPromise<boolean>`). `@provide({ key, scope? })` methods become `toProvider` bindings (SINGLETON default) only when the component is registered through an index. `RestApplication.registerArtifacts(index)` registers datasources -> components -> repositories -> services -> controllers across nested indexes, awaiting `when` and stable-sorting by `order`; `BootSteps.REGISTER_ARTIFACTS` is step 5 of 14, between `staticConfigure` and `preConfigure`. `@venizia/ignis-boot` is a TypeScript-AST generator with the `ignis-artifacts generate|check` CLI. Gone: `Bootstrapper`, the four booters, `BootMixin`, `booter()`, `registerBooters()`, `TMixinOpts.args`; `boot()` is a no-op that warns once; `controller()` binds SINGLETON.

Deviations from the plan: the reference app is `examples/vert`, not a helpdesk sample; there is no `imports` option and no `profiles` - composition of indexes and a `when` function replaced both; `@bean` was rejected in favour of `@provide`. Tooling fix on the way: the generated `reference/binding-keys.md` had been empty ("0 keys") because `knowledge-tools/config.ts` still pointed `coreBindings` at `packages/core-server/src/common/bindings.ts`, which moved to the kernel; it now reads `packages/kernel/src/common/bindings.ts` (16 keys across 2 classes).

BANA crosscheck (read-only grep over `packages` and `apps`): no `booter(`, `registerBooters`, `Bootstrapper`, `BootMixin`, `IBootReport`, `TMixinOpts` or `@venizia/ignis-boot` anywhere; `.boot()` in 4 entry points and `async boot(` overrides in 16 files (15 `application.ts` plus `search/src/migrations/bootstrap.ts`) - all compile against the no-op; `bootOptions` in 2 configs (ignored). Hand registration remains their path: 146 `this.controller(`, 353 `this.service(`, 66 `this.component(`, 369 `this.repository(`, 19 `this.dataSource(` - all still valid. No `get<XController>` or `controllers.` key lookup, so `controller()` becoming SINGLETON has no BANA call site to disturb.

`examples/vert` is the reference application for decorator-driven registration. Its `application.ts` no longer calls `this.dataSource/repository/service/controller/component`: the config carries `artifacts: [GeneratedArtifacts, { components: [...framework components] }]`, where `src/generated/artifacts.ts` is emitted by `bun run generate:artifacts` (the boot CLI run from source) and gated by `bun run check:artifacts`, wired into `make lint-examples` through `make artifacts-check`. The five option bindings the framework components read (health-check, authenticate REST/JWT/basic, authorize) moved into a vert-owned `PlatformComponent` as `@provide` methods; the enforcer and strategy registrations stay imperative since they are registry calls, not bindings. `TestController` demonstrates `when` (mounted outside production). `ConfigurationController`, `MetaLinkRepository` and four authorization repositories were decorated but never registered by hand; the index now registers them (bindings only - nothing resolves the repositories at boot). Every example entry point awaits `application.start()` in one try/catch; the `.boot().then(start)` chain and the dead `bootOptions: {}` are gone.

Two side findings: vert's `getUserOrganization` still read the `domain` column that `b16d04cd` replaced with `domainType`/`domainId` (build was red since 2026-08-31 - fixed); and under bun-runs-source a decorated member typed with a value-imported interface keeps that import alive (`design:returntype`), which fails to link against the CJS dist - `PlatformComponent` uses `import type`, and vert's real path (`tsc` then `bun dist`) is unaffected. The emitter now wraps a field wider than prettier's 100 columns one name per line, so the generated file passes `prettier -l` unchanged.

Concepts rewritten: `packages/boot.md`, `architecture/boot-lifecycle.md` (now titled "Artifact registration"; file name kept so links hold). Patched: `application-lifecycle.md` (14 steps, `init() -> start()`, nine kernel step names), `di-container.md` (three inputs to a binding's key/scope/override; `@provide`), `gotchas.md` (Bun TC39 fallback drops `@provide` too; `emitDecoratorMetadata` under Bun turns interface-typed constructor params into runtime imports - core-server declares `experimentalDecorators` alone; `import type` for types on decorated members when bun runs source; the generator never executes a module), `binding-key-namespaces.md` (keys stay with their owner; `BOOTERS` has no writer), `process/adding-a-component.md` (wire through `configs.artifacts` or `@component()`).

## 2026-09-02 - boot sequence refactor: named constants, per-step logging, ambiguity check, collision guard, follow-up fixes

Registration-engine-consolidation, Tasks 1-5, all landed the same day.

`BootSequence.insertAfter` now refuses a duplicated target name with `Ambiguous step`, as it already refused an unknown one (`findIndex` used to splice after the first match silently). `RestApplication.initialize()` delegates to a new protected `runBootSequence()`: one `executeWithPerformanceMeasure` line per step at debug (`Boot step n/N <name>`), an info summary listing every step name, and an error line naming the failed step before the original error is rethrown; `BaseApplication.initialize()` keeps an identical one-line body as a tripwire. Step names are const classes: `BootSteps` (kernel, eight names incl. `registerDefaultMiddlewares`) and `ServerBootSteps extends BootSteps` (core-server, `packages/core-server/src/base/applications/boot-steps.ts`, five server-only names); `IBootSequenceStep.name` stays `string` so an application can add its own steps. The collision guard's `caller` is derived from the method (`this.controller.name`), no longer a literal that had to match by hand. `packages/inversion` gained `tsconfig.build.json`: `build.sh` type-checks `tsconfig.json` (tests included) then emits from the build config, so `dist` no longer carries compiled `__tests__` - `bun test` reports 38 tests instead of 3x that (the npm tarball never shipped them; the cost was the false count and the wasted emit). `TMixinOpts` lost `args` and its `Args` generic - no registration method read it and no caller in IGNIS, examples or BANA passed it; a type-level breaking change against kernel-v0.2.0-13 with no known caller affected. `controller()` binds SINGLETON like `component()` and `dataSource()`, so a second `get('controllers.X')` returns the mounted instance instead of an unmounted twin.

Registration methods gained a same-key collision guard: `TMixinOpts.allowOverride?: boolean`, default `true` to match `bind()`'s historical silent-overwrite behavior. `RestApplication`'s five artifact methods (`component`/`controller`/`service`/`repository`/`dataSource`) and core-server's `booter()` call a shared `assertNoBindingCollision` before binding: with `allowOverride: false` and the key already bound, it throws via `getError` instead of clobbering. `assertNoBindingCollision` is exported from kernel (`packages/kernel/src/base/applications/rest.ts`) rather than duplicated per package. `opts.binding` on `TMixinOpts` is now optional (it always had a derived default).

Follow-ups fixed two regressions and tightened two seams. `registerDynamicBindings` keeps its `onBeforeConfigure`/`onAfterConfigure` options (they shipped in kernel-v0.2.0-13, so rule P-06 rules out removing them on "no caller" alone) and gets back the hook order the refactor had changed: a binding is marked configured before `onAfterConfigure` runs, so the hook sees its own binding as done (the mark is set inside `registerDynamicBindings`'s `onEach`; `drainByTag`'s own mark stays idempotent on the same `Set`). `assertNoBindingCollision` is no longer a kernel export; it is `RestApplication.assertNoBindingCollision()`, protected, with the `container` parameter dropped (always `this`); `booter()` calls it through inheritance. `BootSequence.insertBefore` is removed - zero callers; `insertAfter` stays. Neither of these two had shipped in a tagged release. `BaseApplication.initialize()` is back as a version tripwire, identical to kernel's: a stale kernel without `getBootSequence()` now throws at boot instead of silently running the short kernel sequence. Tests added after four mutations were measured to kill nothing: the collision guard is asserted per method with the `[caller]` prefix, `initialize()` is asserted to RUN `validateEnvs`/`validateScopeFilterSupport` rather than list them, and inversion pins that a second `bind()` on a key replaces the binding (identity, not value).

`BaseApplication` migrated to `getBootSequence()` too, correcting a prior note that it hand-wrote `initialize()`. It overrides `getBootSequence()` instead, prepending `printStartUpInfo`/`validateEnvs`/`registerDefaultMiddlewares`, splicing in `...super.getBootSequence()`, then using `BootSequence.insertAfter` to place `hydrateSecrets` after `preConfigure` and `wireSecretRotatables` after `registerContributedDataSources`. `initialize()` is now purely inherited from kernel's `RestApplication` - so `registerContributedDataSources()` DOES reach a server application, the opposite of what the corrected note said.

Updated: `architecture/di-container.md`, `architecture/application-lifecycle.md` (two passages), `docs/wiki/content/references/base/application.md` (`registerDynamicBindings`, 13-step mermaid, `registerComponents`, `TMixinOpts`), `docs/wiki/content/best-practices/architectural-patterns.md` (13-step box, `service()` sample). Tests: kernel `boot-sequence.test.ts`, `layering.test.ts`, `registration-override.test.ts`; core-server `lifecycle.test.ts`; kernel tests share `src/__tests__/support/recording-logger.ts`.

Verification gate for the whole consolidation: `make kernel`/`make core-server` green, kernel 151/151 and core-server 1307/1307 (+1 skip) tests pass, `make lint-kernel`/`make lint-core-server` clean, BANA (`nx-seller`) grep for `registerDynamicBindings`/`drainByTag`/`getBootSequence`/`registerContributedDataSources`/`BootSequence` returns no hits, `make okf-check` green.
## 2026-09-01 - `registerComponents()`'s nested datasource hook is gone; it's a flat boot-sequence step now

Kernel's `RestApplication.registerComponents()` no longer passes `onAfterConfigure` to re-scan the DATASOURCE namespace after every component. `initialize()` now runs a `getBootSequence()` (`packages/kernel/src/base/applications/boot-sequence.ts`, `IBootSequenceStep` + `BootSequence.insertBefore`/`insertAfter`), adding one explicit `registerContributedDataSources()` step - a flat second `registerDataSources()` sweep - right after `registerComponents()`. A component contributing a datasource at any nesting depth is still caught before `initialize()` returns.

`BaseApplication.initialize()` in core-server has NOT migrated to `getBootSequence()` yet and does not call `registerContributedDataSources()` - a later task in the same plan wires that in. Updated: `architecture/application-lifecycle.md`, `architecture/component-model.md`.

## 2026-08-31 - The two authorization axes, and what `null` means on each

Docs-only, prompted by a consumer applying the docs to the wrong axis.

1. `AuthorizationDomainScopes` is enforcement-axis vocabulary only. A row an application stores under its own `extraVariants` is on a catalog axis the adapter never reads; `ANY_MEMBER` there is inert. Scopes answer "where does this grant apply", never "where is this row visible".
2. `null` means two different things in one column: on a `grant` (`p`) it means `ANY_MEMBER` (requires `g2` membership); on an `assign_role` (`g`) it becomes `*` (matches every request domain, no membership check). The `g` form is the wider one - calling it `ANY_MEMBER` understates it.
3. The two matcher gates are ANDed - neither wins. `g(r.sub, p.sub, r.dom)` (subject holds the role in this domain) and the domain clause are independent; the narrower governs. A grant marked `ANY_MEMBER` on a role assigned only at `Merchant_A` is DENIED at `Merchant_B` even for a member of B. A sibling is reached only via `registerMatchers`'s `gRoleManager.addDomainHierarchy(..., { reversed: true })` - an assignment carrying a parent domain reaches everything under it.

The question arrived as "which one wins", presuming a precedence rule that does not exist; answering it in those terms would have validated the wrong model. Concept: `architecture/authorization-casbin.md`.

## 2026-08-31 - `PolicyDefinition` domain split ships, `metadata` gets typed, adapter SQL gets real-database coverage

**Release A** (`domain` -> `domain_type`+`domain_id`, additive): `extraPolicyDefinitionColumns` gains nullable `domain_type`/`domain_id` (`domain_id` follows the `idType` switch like `subject_id`/`target_id`). `AuthorizationPolicyBuilder` gains `splitDomain` beside `serializeDomain`; `grant`, `customGrant`, `assignRole` write BOTH forms. Only `domain` is read - enforcement unchanged. Ships separately from Release B because a consumer not yet deployed still reads the old column.

- Reason: the table stored one concept two ways - `join_domain`/`domain_inherits` keep a typed pair (what the `domain_closure` CTE joins on) while `grant`/`assign_role` kept a concatenated token, agreement enforced only by a string convention across two files.
- NULL is `ANY_MEMBER`; the literal itself is refused in `domain_type`. `splitDomain` normalizes `ANY_MEMBER` to `domain: 'ANY_MEMBER'` + `domainType: null` - a backfill equality diff must not "fix" this divergence.
- The CHECK's `IS NOT NULL` guard is load-bearing: a NULL `domain_type` makes `NOT IN` evaluate NULL, and a CHECK rejects only on FALSE - the first draft let an id-with-no-type row through. Caught only by running on real Postgres (PGlite).
- The split helper returns TEXT, not a Drizzle `SQL` - a column ref in a `sql` template renders schema-qualified, invalid inside a table-level CHECK.
- The backfill splits on the FIRST underscore, wrong for a domain type whose own name contains one - an argument FOR the split.
- Tests: `core-server/src/__tests__/authorize/policy-domain-split.test.ts` (CHECK exercised on real Postgres); `grant-utility.test.ts` narrows `domainId` at the insert site like `subjectId`/`targetId` already had.

**Release B** (switch read, drop column): `ScopedCasbinAdapter.domainTokenSelection` builds `<Type>_<id>` in SQL from `(domain_type, domain_id)` for every SELECT. `serializeDomain` removed; `extraPolicyDefinitionColumns` no longer declares `domain`. Migration: `ALTER TABLE ... DROP COLUMN domain`, after every consumer is on this release.

- The alias must be emitted RAW (`sql.raw`), never `sql.identifier` - a quoted alias keeps its case while the unquoted `FROM` alias folds to lower case, so `"policyDefinition"` never resolves (`missing FROM-clause entry for table "policyDefinition"`).
- Every existing adapter test passed with that bug in place: they stub `execute` and return row literals, so none ran the adapter's SQL. Added `scoped-adapter-domain-sql-e2e.test.ts` against real Postgres (PGlite) - the only test in the authorize tree that executes the SQL.
- Reported by BANA from a real incident: never verify a backfill with a `SELECT` after `UPDATE` - a pooler or replica read can hit a lagging node and report zero changes over correct data. Count from the write with `RETURNING`.

**Coverage extended to every adapter query shape.** `scoped-adapter-domain-sql-e2e.test.ts` now also drives `queryPrincipalPolicies`, `queryEdgePolicies` (three aliases, two self-joins), and `CustomGrantExpander.queryOperationCatalog` (row-constructor `IN` list plus the resource-node filter) against real Postgres - none of these were previously executed by any test.

- Verified load-bearing with two mutations: `sql.raw(alias)` -> `sql.identifier(alias)` turns 4 of 6 cases red; swapping both `ON` sides in `queryEdgePolicies` (wrong-direction self-join) turns 1 red, token order flips. Run both before trusting an edit here.
- Check the mutation actually landed before reading the result - "broke it and still green" means either the test is blind or the break never arrived, and those lead to opposite actions. BANA nearly rewrote a healthy suite: their mutation failed to compile, their `build.sh` piped through `sed` and swallowed the exit code, so `dist` kept the old build and tests ran on un-mutated code. IGNIS's `build.sh` has `set -e`, no pipes, and a `tsc --noEmit` gate, and these tests import source, not `dist` - not exposed to that exact path. But `make <pkg>` cleans `dist` before building, so a failed build leaves it empty - the local variant of the same disguise.
- RULE: a change to any of these statements is unverified until a case in this file executes it. The bug class - identifier folding, alias resolution, three-valued predicate logic - is invisible to `tsc`, to lint, and to every stubbed test.

**`PolicyDefinition.metadata` typed and extensible.** Was `jsonb('metadata')` with no `$type<>()`, read back as `unknown`; any shape compiled going in. Now carries `TSubsetGrantMetadata` (`{ ops: string[] }`), declared in kernel beside its only writer (`AuthorizationPolicyBuilder.customGrant`); only reader is `parseCustomGrantMetadata`.

- A fixed shape was tried first and rejected - it forces any app with its own metadata onto a separate column. Now a type parameter defaulted to `TSubsetGrantMetadata`, mirroring `ExtraVariant`: `extraPolicyDefinitionColumns<{ idType: 'string' }, IMerchantPolicyMetadata>({ idType: 'string' })`.
- `Metadata` is a type parameter, not an `opts` field - unlike `extraVariants` there is no runtime value to infer a shape from. Consequence: a caller supplying it must also spell `Opts` (TypeScript has no partial type-argument inference).
- Pinned in `grant-utility.test.ts` both ways (custom shape accepted, a shape missing a declared field rejected) - both markers verified load-bearing by deleting each and re-running `tsc`.

## 2026-08-31 - `scopeFilter`: boot-time validation, adoption guidance, and a CORRECTION on `create`

**Boot-time guard.** `connectors/src/common/scope-filter.ts` adds `assertScopeFilterSupported({ asyncContextEnabled })`, called from core-server's `initialize()` after `postConfigure()` (so a component-contributed model is covered). Two configurations were previously silent, and fail in OPPOSITE directions:

1. Search-backed model (`BaseSearchEntity` in the prototype chain): the setting is never read, so the query returns MORE rows - the dangerous case, since a wider result looks like it worked while a missing scope on the relational path DENIES and gets investigated.
2. `asyncContext.enable: false`: `resolve()` takes no arguments, so with no ambient store every call returns undefined, `onMissing` denies, and every query on the model matches zero rows with no flag named anywhere.

Search is reported first when both apply - it needs a code change, the other may be one config line. Detection is by class (`BaseSearchEntity` in the prototype chain), not by datasource. Not breaking in practice: `asyncContext.enable` defaults to true for a server application, so only an explicit opt-out plus a `scopeFilter` declaration trips it. Tests: `connectors/src/__tests__/common/scope-filter-boot.test.ts`.

**Adoption guidance (docs-only, from a BANA design review).**

1. Running `scopeFilter` alongside an existing ownership guard is a TRAP, not a safe migration step. AND-ing the same predicate twice stays correct, which is why it is dangerous: it hides divergence when a subclass overrides one hook but not the other, with no compile error. Corrects verbal advice given earlier the same day ("they do not fight, run them in parallel"), which checked result correctness and missed invariant ownership.
2. `scopeFilter` narrows, a hand-written guard throws - opposite failure profiles. A `where` means a handler that forgets is still scoped, but a legitimate cross-principal write silently does nothing, and `create` is unreachable. A guard that loads the row and throws covers `create` and cannot silently succeed, but is a hole wherever nobody called it, and costs a read per write.
3. `IScopeFilterSettings.resolve` is SYNCHRONOUS - ownership living on a parent row is not expressible; denormalizing the owner column is a data migration, not a refactor.

Files: `docs/wiki/content/changelogs/2026-08-30-row-scope-filter.md`, `packages/connectors.md`.

**CORRECTION: `scopeFilter` never covers `create`, and scoped writes trap admin methods.** The changelog and `packages/connectors.md` had claimed `scopeFilter` "covers every write path whose scope is expressible as a filter clause" - FALSE for `create`: `applyDefaultFilter` appears only in `_update` (persistable.ts:164) and `_delete` (:274), never in `_create` (:76). Structural, since an `INSERT` has no `where` to AND into, but the earlier wording implied protection that does not exist - nothing stops a caller inserting a row owned by somebody else.

Also newly documented: because `update`/`delete` ARE scoped, an admin method legitimately targeting another principal (e.g. `deleteAllForUser({ userId })`) silently narrows to the caller's own rows, deletes nothing, and **reports success** - no throw, no type error, no log line. Guidance: when adding `scopeFilter` to a model, audit every `updateById`/`updateAll`/`deleteBy` taking another principal's id; fix with a repository method passing `dangerouslySkipScopeFilter`, never a request-context flag (a flag settable from any layer makes "where is scope bypassed" unanswerable in one place). No code changed. Files: `docs/wiki/content/changelogs/2026-08-30-row-scope-filter.md`, `.agents/knowledge/packages/connectors.md`.

## 2026-08-31 - `EventBus`: payload-map typing gotcha, and a retry reshape (jitter, per-registration window, tagged `handler`)

**Payload maps silently degrade to an index signature.** Docs + one test, no source change. `EventBus`'s only type safety is `K extends keyof TPayloadMap & string`, only as strong as the map a consumer supplies. A map built from computed keys off a PLAIN OBJECT LITERAL degrades without a word: no `as const` means the key is typed `string`, a computed key of type `string` produces an INDEX SIGNATURE, `keyof TPayloadMap` becomes `string`, and `register`/`publish` accept every name. Reported by BANA after migrating 47 registrations. It survives review because it compiles clean, lint says nothing, tests say nothing, and call sites look checked - a `static readonly` on a class keeps its literal type, so the same codebase had one sound map and one degraded map for a reason invisible at any use site. Detection is a control line: put `// @ts-expect-error` on a bogus key - `tsc` reports the directive UNUSED when degraded, says nothing when sound. Test: `kernel/src/__tests__/events/payload-map-typing.test.ts` (degraded case asserted by a line that compiles WITHOUT a marker). Docs: `docs/wiki/content/changelogs/2026-08-31-event-bus-retry.md`, `packages/kernel.md`.

**Retry reshape**, in `kernel/src/base/events/event-bus.ts`, load-bearing on the class doc's "bounded maximum dispatch time" guarantee (previously "fixed retry" - corrected, no longer true).

1. Every dispatch retry now uses `RetryJitterModes.FULL` (was `NONE`), unconditionally, not caller-facing - prevents many handlers retrying the same lock from waking up in lockstep and re-colliding each round.
2. `register()` gains `retry?: { maxAttempts, baseDelayMs }`, replacing the framework-wide fixed `EventDispatchRetry.MAX_ATTEMPTS = 3` / `BASE_DELAY_MS = 100` with a per-registration override (those constants are now only the default). Bounded by `MAX_ATTEMPTS_CEILING = 10` and `MAX_TOTAL_WINDOW_MS = 30_000` (computed pre-jitter, since jitter only shrinks); either bound crossed throws `getError` at `register()`, never a silent clamp - nothing awaits a fire-and-forget dispatch to notice one.
3. `register()`'s `handlerBindingKey: string` field is REMOVED (no alias - one consumer, days old), replaced by `handler`, a tagged union: `{ type: EventHandlerTypes.BINDING_KEY, key }` (resolved from the container on every retry attempt, so a rebind reaches an attempt already in flight) or `{ type: EventHandlerTypes.FUNCTION, fn }` (captured as a closure at `register()` time - a rebind has nothing to reach). `IEventHandler.handle` widened `Promise<void>` to `ValueOrPromise<void>`, since `RetryHelper.executeWithRetry`'s `execution` wrapper is itself `async` and already catches a synchronous throw the same as a rejected promise.

Tests: `kernel/src/__tests__/events/event-bus.test.ts` - default-retry byte-parity, custom `maxAttempts`/`baseDelayMs` per registration, two registrations on one event honoring different retry settings, both ceilings rejecting independently, non-integer/zero/negative rejected, jitter observed via a stubbed `Math.random` + spied `setTimeout`, both `handler` shapes dispatching, the `BINDING_KEY`/`FUNCTION` rebind-vs-no-rebind mirror pair, a mismatched `type`/field pair pinned as `@ts-expect-error`, and a synchronous handler retried/logged the same as an async one.

## 2026-08-31 - `TEntityId`: an opt-in branded string id

`kernel/src/base/models/common/types.ts` gains `TEntityId` (`string & { readonly [entityIdBrand]: never }`, brand key a module-local `unique symbol`) and its only constructor, `toEntityId({ value })`. Purely additive - no framework type changes, no column is branded, nothing existing needs updating.

Two decisions that look wrong until measured:

1. The brand field is REQUIRED and typed `never`, not optional. An optional brand (`{ b?: symbol }`) is structurally satisfied by a plain `string`, so it would compile while guaranteeing nothing.
2. `TEntityId | string` was measured and REJECTED. The union restores the literals a branded Drizzle column otherwise breaks, but it makes a plain `string` assignable again, erasing the whole point - the OPPOSITE conclusion to `TIsoTimestamp` in filter, where widening with `Date` is deliberate: there the widened member is a distinct type, here it is the very type being excluded.

The cost is not avoidable and is why the type is opt-in per column (`.$type<TEntityId>()`) rather than framework-wide: Drizzle derives `$inferInsert` and `$inferSelect` from the same field, so a branded column rejects every literal - seeds, fixtures, path params - until each converts.

`toEntityId` VALIDATES NOTHING beyond refusing the empty string (an id of `''` collapses a `where` to no condition) - it makes the laundering visible at each boundary, not proof the string is a real id, stated in the doc comment so nobody mistakes it for a guard.

Tests: `kernel/src/__tests__/models/entity-id.test.ts` - the negative cases are the real subject, each `@ts-expect-error` verified load-bearing by deleting it and confirming `tsc` reports at that line. Concept: `packages/kernel.md` (new `## TEntityId` section). Changelog: `docs/wiki/content/changelogs/2026-08-31-entity-id-brand.md`.

## 2026-08-31 - `TWhereValue<V>` admits a `Date` on `isoTimestamp` columns only

`isoTimestamp` columns (`connectors/relational/{postgres,sqlite}/models/common/columns.ts`) read back as `string`, but `toDriver` already accepts a `Date` and converts it - `{ effectiveFrom: { lte: new Date() } }` always ran correctly, until the 2026-08-30 `TWhere<T>` value-typing change made it a compile error, purely because the type could not see the conversion. Widening `TWhereValue<V>` for every `string` would have reopened the exact hole that change closed - comparing an unrelated `text` column against a `Date` is a real bug and must stay one.

Fix: a branded read type, `TIsoTimestamp = string & { readonly isoTimestampBrand: unique symbol }`, added to `filter/src/common/types.ts` (not `connectors` - `filter` has no dependency on `connectors`, and the brand is a pure type with no runtime import). `TWhereValue<V>` widens only a `V` that extends the brand: `V extends TIsoTimestamp ? V | Date : V`, applied to both the bare-scalar position and inside `TWhereOperators<V>`. `isoTimestamp`'s column now declares `data: string | TIsoTimestamp`, a union rather than a bare brand - required, because Drizzle infers `$inferSelect`/`$inferInsert` from the SAME `data` field, and a bare-brand `data` was measured to also block inserting a plain string literal.

The literal brand shape given in the initial ask (`{ __isoTimestamp?: unique symbol }`, optional field, leading-underscore naming) does not work and was changed on both counts: an optional brand field is structurally satisfied by a bare `string` (widening every text column), and the naming-convention lint rule rejects a double-leading-underscore property name. Shipped field: `isoTimestampBrand: unique symbol`, required, no underscore.

Tests: `core-server/src/__tests__/filter-builder/iso-timestamp-where.test.ts` - bare `Date` and `{ lte: new Date() }` compile on an `isoTimestamp` column; `{ plainText: new Date() }` and `{ plainText: { lte: new Date() } }` on a `text` column stay `@ts-expect-error` (both markers verified load-bearing); a string literal and `$inferInsert` with a string literal still work; SQLite's `isoTimestamp` carries the same brand; a `Date` vs. its `.toISOString()` compile to identical SQL text and params via `PgDialect.sqlToQuery`. Does not leak into generated schemas - `drizzle-zod`'s `createSelectSchema`/`createInsertSchema` dispatch on the column's runtime `columnType` string, never on this TypeScript-only brand. Changelog: `docs/wiki/content/changelogs/2026-08-30-typed-where-clauses.md` (new "isoTimestamp exception" section; corrected the `examples/vert` note - `createdAt` is an `isoTimestamp` column, so its `.toISOString()` workaround is no longer required, though harmless to keep).

## 2026-08-31 - `resolveDomainEdges`'s `domains` argument documented as a membership closure, not an `assign_role` closure

Documentation-only - `ScopedCasbinAdapter.resolveDomainEdges` (`core-server/.../adapters/scoped-casbin.adapter.ts`) keeps its exact prior signature, name, and single-function shape. A rename to an array of `domainResolvers` run through `Promise.allSettled` was considered and dropped: the one real consumer's array never held more than one element, the second hierarchy axis that would justify it has no schema yet, and an application can already compose sources with `resolveDomainEdges: async opts => [...(await organizerEdges(opts)), ...(await regionEdges(opts))]`.

What shipped: the hook's doc comment, the `authorization-casbin` concept, and the Authorization API reference now state `domains` is the principal's **membership closure** (`join_domain` rows plus both ends of every `domainEdge` row), never the domains a principal holds a role in via `assign_role`. A principal can hold `assign_role` at a domain it never joined; a hook migrated from an `assign_role`-derived mechanism silently loses access for exactly those principals - no error, no log, and fewer `g3` edges than before. Measured on one production dataset: 17 principals held `assign_role` with no matching `join_domain`, 3 of them pointing at live records. The same three spots gained a one-line composition note pointing at this pattern, not a second hook.

## 2026-08-30 - `@model` row-scope filter (`scopeFilter`) ships: base feature, `include` coverage, and a third `UNRESTRICTED` state

**Base feature.** New `IScopeFilterSettings` (`packages/kernel/src/helpers/inversion/common/types.ts`): `resolve()` returns a per-query `where`; `onMissing` (default `deny`) decides what happens when it returns null/undefined. `RelationalBaseRepository.applyScopeFilter` (`connectors`) AND-composes it into every read and write - including `restore()` - and it is NOT removable via `shouldSkipDefaultFilter`, which stays scoped to `defaultFilter` alone. `onMissing: 'deny'` compiles to an empty `inq` (`sql\`false\``); `'allow'` is the explicit opt-out. New internal-only `dangerouslySkipScopeFilter` (parameter, never on `IExtraOptions`, never wire-reachable) stops `find()`'s own recursive call into `findWithCoreAPI` from AND-composing the scope twice. `getScopeFilterSettings()` mirrors the existing `getDefaultFilter()` override seam.

Search repositories are NOT covered (owner decision, not a gap found late): `search/core`'s `buildQuery`/`compileEffectiveWhere` pipeline never reads `scopeFilter`. Documented in the changelog, the doc comment, and `connectors.md`'s search section - a half-covered security feature is worse than an absent one if a reader assumes the absent half is covered.

Tests: `connectors/src/__tests__/postgres/repositories/scope-filter.test.ts` (unit, SQL-text) and `.../relational/conformance/pglite-scope-filter.test.ts` (PGlite e2e, every verb including `restore()`'s cross-tenant leak proof). Changelog: `docs/wiki/content/changelogs/2026-08-30-row-scope-filter.md`.

**Closed on `include`.** `FilterBuilder.toInclude` read only `defaultFilter` for an included relation - `scopeFilter` never reached a relation loaded through `include`, so a tenant-scoped parent queried with `include` handed back every other tenant's child rows. Fixed by resolving each relation's own `scopeFilter` from its own `@model` settings (new `resolveScopeFilter`) and AND-composing it via a new `applyRelationScopeFilter`, applied BEFORE `defaultFilter` so it survives the relation-level `shouldSkipDefaultFilter` like the parent's does. `toInclude` recurses into a relation's own `include`, so a relation of a relation is scoped by the same path. Extracted the deny predicate (`{ id: { inq: [] } }`) into `ScopeFilterDenial.where()` so the repository and dialect tiers compile "deny" from one definition.

Tests: `pglite-scope-filter-include.test.ts` - a positive control proves a sibling relation with no `scopeFilter` DOES leak the other tenant's rows before asserting the scoped relation excludes them; also covers relation-level `shouldSkipDefaultFilter`, `onMissing: 'deny'` vs `'allow'`, a nested relation-of-a-relation, a throwing resolver propagating, and a byte-identical no-`where` compile for an unscoped relation.

**Third `resolve()` state: `ScopeFilters.UNRESTRICTED`.** A `where`, or null/undefined-denies, could not express "this caller sees everything on this one call". `onMissing: 'allow'` cannot cover it either - declared once per MODEL, so using it for a per-user bypass would unscope every ordinary user whose `resolve()` happens to return nothing. New `ScopeFilters.UNRESTRICTED` (`packages/kernel/src/base/repositories/common/constants.ts`) is a `Symbol.for('@venizia/ignis-kernel:scope-filter-unrestricted')`, not a string or sentinel object, so no request body, query string, or header can ever produce it. `IScopeFilterSettings.resolve` widened to `() => TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED`.

Both enforcement sites (`RelationalBaseRepository.applyScopeFilter`, `FilterBuilder.applyRelationScopeFilter`) check the three branches in the same order: `TWhere` ANDs in; `scopeWhere === ScopeFilters.UNRESTRICTED` (exact identity) returns unscoped; otherwise null/undefined falls through to `onMissing`. The order is the whole safety property: a resolver that forgets a `return` on some branch produces `undefined`, not the symbol, and still denies. Each relation under `include` resolves its own state independently - an `UNRESTRICTED` parent never widens a still-scoped child and vice versa.

New write-path boundary, documented but not code-changed at this point: `scopeFilter` was said to cover every write path whose scope is expressible as a filter clause. Ownership resolved per row, or through a polymorphic reference (`principalType`+`principalId` pointing at a different table chosen at runtime), is NOT expressible as `resolve(): TWhere` - no hook or escape hatch added, since the shape differs enough between applications that a seam built before its shape is known would guess wrong. (This "every write path" framing was corrected the next day - see 2026-08-31: `create` is not covered.)

Tests: `pglite-scope-filter-unrestricted.test.ts` (`UNRESTRICTED` reaches `find`/`findById`/`count`/`updateAll`/`deleteAll`/`restoreById`/`restoreAll`; `undefined` still denies; per-call not cached across three consecutive `find()` calls; a model with no `scopeFilter` stays byte-identical) and `pglite-scope-filter-unrestricted-include.test.ts` (parent `UNRESTRICTED` + child scoped stays scoped; parent scoped + child `UNRESTRICTED` unscopes only the child; three-level nested include, mixed both directions). Pre-existing two-state suites still pass unmodified. Changelog: `docs/wiki/content/changelogs/2026-08-30-row-scope-filter.md`.

## 2026-08-30 - `TWhere<T>` now types the value, not only the column

`packages/filter/src/common/types.ts`: `TWhere<T>` was `{ [key in keyof T]?: any }` - a key not on `T` was already rejected, but any value of any type compiled for a real column (`{ status: 123 }` against a `string` column compiled clean). Added `TWhereOperators<V>` (mirrors all 25 field operators in `common/operators.ts` `QueryOperators`, plus `not`) and `TWhereValue<V> = V | null | TWhereOperators<V>` (`| null` mandatory - it is how a caller writes `IS NULL`); `TWhere<T>` now maps each key to `TWhereValue<T[key]>`. `between`/`notBetween` are now a `[V, V]` tuple, so wrong arity is a compile error too.

Fallout, all fixed: `connectors` - 4 sites (`persistable.ts`, `readable.ts`, `soft-deletable.ts`) build `{ id: opts.id }` against `TWhere<DataObject>` where `DataObject` is a class generic too deep for `tsc` to resolve; tightening the generic constraint was tried and rejected (the default type parameter fails its own tightened constraint, cascading into the postgres/sqlite subclasses) - fixed with a narrow `as TWhere<DataObject>` cast per site instead. `core-server` - `postgres-query-operators-between.test.ts` needed `as any` on its two deliberately-wrong-arity cases to still reach the runtime guard. `examples/vert` - one real error (`Date` against a `string` column, fixed with `.toISOString()`) plus 2 cascades. Does not cover JSON/JSONB columns (`any` in application schemas) or dot-path key typing (needs `$type<>()` first) - deliberately out of scope. New test: `core-server/src/__tests__/filter-builder/where-type-safety.test.ts` (`@ts-expect-error` markers verified load-bearing by temporarily removing each). All of `filter`, `kernel`, `connectors`, `core-server`, `core-worker`, `boot` and all 12 examples green (tsc, `bun test`, eslint, prettier); `make purity` green.

## 2026-08-30 - Tree utilities (`helpers`) and `RecursiveTreeSql` (`kernel`) ship, then gain SQLite support

Per the agent contract `2026-08-31-tree-graph.md`: BANA hand-wrote 15 recursive SQL queries (14 with their own depth guard, 1 without - which hung a production process walking an unbounded parent chain) plus 2 duplicate in-memory tree algorithms. Both moved into IGNIS.

`packages/helpers/src/modules/tree/` (pure - `Map`/`Set`/arrays only, no Drizzle/DI/I/O): `walk.ts` (`TreeWalker`: static `walk`/`walkAsync`/`height`/`heightWhere`/`count`/`collectLeaves`), `builder.ts` (`TreeBuilder`: static `build`/`leaves`/`nonLeaves`/`print`). Named `TreeBuilder` not `GraphHelper` - `build` cuts cycles, so the result is always a tree, and a wider name invites real graph algorithms it does not implement. Kept `walk`/`walkAsync` as distinctly-named methods rather than one with a mode flag - the return types genuinely differ (`void` vs `Promise<void>`). Three behaviors preserved verbatim from production, commented because each is counter-intuitive: `shouldPrune(node, depth)` returning `true` still visits the node, only its children are skipped; `build`'s `seen`-by-`getKey` cycle guard SKIPS a repeated branch rather than throwing, because real hierarchies contain legitimate diamonds; `leaves({ includePath: true })` returns the root-to-leaf chain alongside each leaf.

`packages/kernel/src/base/repositories/sqls/recursive-tree.ts`: `RecursiveTreeSql.walk(opts)` builds a `WITH RECURSIVE` fragment (a Drizzle `SQL`) walking an adjacency-list table up or down from `rootId`, bounded by a MANDATORY `maxDepth` (no default; `<= 0` throws via `getError` at runtime too, since `0` type-checks but silently returns nothing). `table` stays `unknown` - IGNIS cannot see an application's schema, and a type that pretends to know is worse than `unknown`; validated at runtime with `is(table, Table)`, throwing `getError` naming what arrived. `name`/`idColumn`/`parentColumn`/every `columns` entry become SQL identifiers, checked against a strict allowlist (`^[A-Za-z_][A-Za-z0-9_]*$`) before reaching a template, on top of `sql.identifier`'s own quoting. `trackPath: true` emits `path`/`is_cycle` using the standard Postgres cycle-detection idiom, adding `AND NOT r.is_cycle`; `maxDepth` alone already guarantees termination. `RecursiveTreeDirections` (`UP`/`DOWN`) uses the const-class + `TConstValue` idiom.

Tests at ship: 21 new in `helpers/__tests__/tree/`; 23 new in `kernel/__tests__/repositories/sqls/` (generated-SQL shape via `PgDialect().sqlToQuery`, `maxDepth <= 0`/non-integer throws, malicious identifier entries rejected, a non-Drizzle `table` rejected). No live-database execution test at this point - kernel carries no Postgres/PGlite devDependency; verified via SQL-text assertions, consistent with `connectors`' `dialect/*.test.ts` pattern.

**SQLite support added, same day, no new option.** The dialect is now read off `table` itself - `is(table, PgTable)` vs `is(table, SQLiteTable)`, tagged internally by a private `RecursiveTreeEngines` const-class - so `IRecursiveTreeOptions` gained zero new fields. A table belonging to neither engine (tested against a `drizzle-orm/mysql-core` table) throws the same `getError` shape as an invalid table. The `trackPath` cycle guard now has two forms picked by the same `switch (engine)`: Postgres keeps `path` as a native array (`ARRAY[...]`, `= ANY(path)`); SQLite has no array type, so `path` is text delimited on both sides by `char(31)` (ASCII Unit Separator) and membership is `instr(path, char(31) || id || char(31)) > 0` - double-sided delimiting stops a partial match (id `1` inside a path containing `12`). Exact as long as no id value contains a `char(31)` byte - not validated or escaped, documented as the one semantic gap. `depth`'s cast also differs per engine (`::int` vs `CAST(... AS INTEGER)`).

Proved the Postgres path byte-identical: a new test asserts the exact full SQL string against the pre-change output. 23 pre-existing Postgres tests pass unchanged. New: `recursive-tree-sqlite.test.ts` (23 tests, mirroring the Postgres suite, including the `'id"; DROP TABLE users; --'` injection case) and `recursive-tree-dialect.test.ts` (2 tests, MySQL-table rejection). `kernel` green (`bun test` 120/120) and rebuilt; `core-worker`/`core-server` green (85/1274 passing) against the rebuilt `kernel`; `make purity-kernel` still 2/2 pure - the two new subpath imports are the same already-declared optional peer (`drizzle-orm`). Updated `packages/kernel`'s "Recursive tree SQL" section and `docs/wiki/content/changelogs/2026-08-30-tree-and-recursive-sql.md` (corrected from "Targets PostgreSQL" to describe both engines and the delimiter gap).

## 2026-08-30 - Ten more classes extend `BaseHelper` for scoped logging

`ApplicationEnvironment` (`helpers`), `GrpcRequestAdapter`, `SwaggerUIProvider`/`ScalarUIProvider`, `NumericCodeGenerator`/`RandomTokenGenerator`/`DefaultVerificationDataGenerator` (`core-server`), `MeilisearchQueryDialect`/`TypesenseQueryDialect` (`connectors`), `InProcessBffTransport` (`core-worker`) now `extends BaseHelper`, each adding `super({ scope: <ClassName>.name })` as the constructor's first statement. All keep their existing `implements` clause - none needed the `AuthorizationRole`-style exclusion.

Logging added where a real failure path existed: `InProcessBffTransport.fetch`'s `catch (error)` now logs before re-throwing the decoded `ApplicationError` (was silent); `SwaggerUIProvider`/`ScalarUIProvider.render` wrap their optional-peer `await import(...)` in try/catch, log, and throw a `getError` naming the missing package; `MeilisearchQueryDialect`/`TypesenseQueryDialect`'s `compileOperatorClause` log a `warn` immediately before every `throwUnsupportedOperator` call. No logging added to `GrpcRequestAdapter`, the mail generators, or `ApplicationEnvironment` - none had a failure path in scope.

All four packages (`helpers`, `connectors`, `core-server`, `core-worker`) green after rebuild: tsc, `bun test` (1454/1179/1266/85 passing, unchanged), eslint, prettier. `make purity` unchanged at 34/34 pure (8 waived).

## 2026-08-30 - Crypto reshape: `Hash` class replaces `crypto.utility.ts`'s `hash()`, plus a KDF salt override

**`Hash` introduced.** `utilities/crypto.utility.ts`'s `hash(text, options)` had two branches that returned `text` unhashed - a missing SHA256 secret, and any algorithm outside `'SHA256' | 'MD5'` - so a caller that forgot `secret` stored or compared plaintext with no error. Added `Hash` (`packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts`): a `BaseHelper` (not `BaseCryptoAlgorithm`/`ICryptoAlgorithm` - a digest has no inverse). `digest({ message, opts? })` takes no secret; `hmac({ message, secret, opts? })` requires one and throws via `getError` if empty. New const-classes `HashAlgorithms` (`md5`/`sha1`/`sha256`/`sha384`/`sha512`) and `HashOutputEncodings` (`hex`/`base64`/`base64url`), plus `DEFAULT_HASH_OUTPUT_ENCODING` (`hex`).

`crypto.utility.ts`'s `hash()` kept its exact positional signature at this point (published API, ~15 external BANA payment call sites) and delegated to `Hash`, byte-identical (pinned against `node:crypto` directly); the one behavior change was both former passthrough branches now throw. Also replaced the deprecated `crypto.Encoding` type with `BufferEncoding` in `aes.algorithm.ts`, `aes-legacy.algorithm.ts`, `rsa.algorithm.ts` - zero behavior change. Swept the rest of `modules/crypto` for other deprecated Node crypto APIs: none found. Left unchanged and reported: `RSA.generateDERKeyPair({ modulus })` accepts any modulus with no lower bound.

**KDF salt override, same day.** `DEFAULT_KDF_SALT` is a single string shipped in every IGNIS deployment - flagged by a prior sweep, since one precomputed table attacks every deployment deriving a key from a weak passphrase. Changing the default was ruled out - a downstream product already has ciphertext encrypted under it. Added optional `kdfSalt`/`kdfIterations` to `AES`'s `encrypt`/`decrypt` `opts`, threaded through `resolveEncryptKey`/`resolveDecryptKey` (now options-object methods, previously positional) to `BaseCryptoAlgorithm.normalizeSecretKey`. Omitting both reproduces the shipped default byte-for-byte, pinned against a `node:crypto` `pbkdf2Sync` call using literal salt/iteration values. A supplied `kdfSalt` must be at least 16 UTF-8 bytes (`MINIMUM_KDF_SALT_BYTES`, NIST SP 800-132's 128-bit minimum) or `normalizeSecretKey` throws. `LegacyAES` deliberately does NOT get the option - its `normalizeSecretKeyLegacy` is padEnd/truncate, never PBKDF2. `RSA`/`ECDH` don't derive keys via PBKDF2, so neither takes it. Documented the weakness directly on `DEFAULT_KDF_SALT`.

**`hash()` and `crypto.utility.ts` removed outright, later the same day - supersedes the shim above.** The delegating-shim decision is reversed before shipping: `utilities/crypto.utility.ts` and its test are deleted entirely, the barrel no longer exports `hash`. No delegating wrapper, no `@deprecated` alias - `hash()` does not exist. Every caller (~15 external BANA payment call sites) must migrate directly to `Hash.withAlgorithm(...).digest()`/`.hmac()`. Digest bytes are unchanged, so a migrated call site produces the same value a payment gateway already verifies. Docs rewritten accordingly: changelog hashing section from "deprecated, delegates" to "removed" with a migration table for the three known call shapes; the Hashing section of the crypto reference rewritten around `Hash`; `references/utilities/crypto.md` removed outright along with its sidebar/index entries.

## 2026-08-30 - Retry reshape: `retry.utility.ts` becomes `RetryHelper`, moves to `modules/retry/`, aliases fully removed

**Converted to a class.** `packages/helpers/src/utilities/retry.utility.ts` held nine module-level arrow functions instead of the repo's class-oriented convention. Moved all nine (plus the private `RETRY_TIMEOUT_MARKER` symbol) onto a new `RetryHelper` class as static/private-static members, modeled on `LoggerFactory`'s shape. The five public names (`isRetryTimeoutError`, `runWithTimeout`, `computeBackoffDelayMs`, `executeWithRetry`, `executeWithRetryUntil`) are published API with external consumers, so at this point they stay as `@deprecated` module-level `const` aliases assigned from the class. A detached static method loses its `this` binding, so every cross-method call inside the class uses the explicit `RetryHelper.xxx(...)` form, never `this.xxx(...)`. Test count: 37 -> 42 in `retry.utility.test.ts` (5 new alias-delegation tests), 1391 -> 1396 pass package-wide.

**`RetryHelper` added to the browser-pure `/core` surface.** `src/core.ts` had named only the `executeWithRetry`/`executeWithRetryUntil` aliases, so browser consumers could not reach the class. Exporting `RetryHelper` also carries the four operations with no `/core` alias (`runWithTimeout`, `isRetryTimeoutError`, `computeBackoffDelayMs`, private helpers) into the browser as statics - intended, since the class is the API and the standalone aliases are back-compat for existing node code. Verified by `make purity-helpers` (4/4 entries browser-pure).

**Moved to `modules/retry/`, aliases gone for good.** The five module-level aliases had already been dropped from `RetryHelper`'s source in a prior change that never touched the test file or two downstream call sites still importing them bare - `packages/kernel/src/base/events/event-bus.ts` and `.../repositories/core/abstract.ts` - leaving the whole monorepo red (`tsc` failed on the test file; `bun test` in `connectors` threw `SyntaxError: Export named 'executeWithRetry' not found`). Fixed both call sites to `RetryHelper.executeWithRetry`/`RetryHelper.executeWithRetryUntil`.

Completed the pending structural move: `retry.utility.ts` (487 lines, flat) becomes `src/modules/retry/` - `common/constants.ts`, `common/types.ts`, `helper.ts` - matching the `crypto`/`uid` module shape. `src/core.ts` re-exports from these new leaf files instead of `./utilities/retry.utility`, still leaf-path per convention. Test file moved to `__tests__/retry/helper.test.ts`; the `'deprecated module-level aliases delegate to RetryHelper'` block (5 tests) is deleted outright - the risk it guarded died with the aliases it detached. 42 -> 37 tests in this file, 1431 pass package-wide. `make purity-helpers` still 4/4 after rebuild. `connectors`/`core-server`/`core-worker`/`kernel` all green after rebuilding `kernel`'s dist. Updated the `packages/helpers` concept and `references/utilities/retry` + `references/base/repositories/advanced` wiki pages; the wiki page itself was NOT moved - it documents a user-facing concept, and `crypto`/`pool` already live in `modules/` while staying documented under `references/utilities/`.

## 2026-08-30 - New convention: narrow only what the framework owns

`conventions/narrowing-authority.md`, written after `kernel@0.2.0-6` narrowed `PolicyDefinition.variant` to a closed union and broke a consuming application that stored its own edge kind in the same table. The narrowing was right about which values are wrong and wrong about who may extend the set - two separate questions that had been asked as one. Records the extensible-seam shape, why `TKnown | (string & {})` is rejected, why `unknown` beats a type that guesses at an application's schema, and that tightening a boundary type surfaces the whole loose chain feeding it one layer at a time - which reads as a cascade of new failures unless the changelog says otherwise.

## 2026-08-30 - `PolicyDefinition.variant` can be widened per app, `effect` stays closed

`kernel@0.2.0-6` narrowed `variant` (`core-server/.../models/entities/policy-definition.model.ts`) to `AuthorizationPolicyVariants.ALL`'s seven values, closing a real bug class - three wrong vocabularies (`p`/`g`, `group`/`policy`) had shipped before, and `ScopedCasbinAdapter` filters every query with an explicit `variant = ...`, so a wrong value silently selects zero rows (permanent 403, no error). But the narrowing over-reached: it left no way for an app to store its own edge type in the same table, a pattern the adapter was always safe to ignore.

Fixed by adding `extraVariants` to `extraPolicyDefinitionColumns`, e.g. `extraPolicyDefinitionColumns({ idType: 'string', extraVariants: ['merchant_role'] })`. Chose the options-object shape over a second type parameter: `extraPolicyDefinitionColumns` already infers `Opts` from its single argument, and TypeScript has no partial type-argument application. The options object is marked `const` so the extras array infers as a literal tuple with no `as const` needed; the default (no args) stays exactly the seven-value union, pinned as `@ts-expect-error` in `grant-utility.test.ts`.

`effect` (`AuthorizationDecisions`: allow/deny/abstain) did NOT get the same treatment: its value is written straight into the raw casbin policy line and read by casbin's own effect evaluator - an app-defined fourth value would reach the evaluator and produce a decision nobody defined the meaning of, a correctness risk in the enforcement path itself, not a harmless unselected row.

While pinning that `AuthorizationPolicyBuilder.grant()`'s output assigns cleanly to the column, found it did not: `grant()`/`customGrant()` had no explicit return type, and TypeScript's return-type inference silently widened `effect: TAuthorizationDecision` back to `effect: string` (a `TConstValue`-derived literal goes through an indexed-access type and widens on an unannotated return - new gotcha). Fixed by adding explicit return types to both methods in `kernel/.../builders/policy.builder.ts` - a latent, pre-existing gap, not a regression from this change. See the [2026-08-30 changelog](/changelogs/2026-08-30-policy-definition-extra-variants).

## 2026-08-30 - Authorization domain-hierarchy: overlay reaches all three axes, `resolveDomainEdges` hook added, then the shared tree is removed

**Overlay symmetry fix.** `MembershipRoleManager` (`g2`) read only the shared graph while `g` and `g3` read the shared graph plus the per-request overlay. Ancestor resolution is now one `collectDomainAncestors` walk (`enforcers/domain-hierarchy.ts`) used by all three; `registerMatchers()` hands the same overlay `Map` to all three. The asymmetry broke exactly the membership shape the bundle recommends - a single `join_domain` row at the parent. A newly created child domain stayed denied on the membership axis until the next TTL reload while the role axis already allowed it, reading as "the user holds the role and is still refused". Found in cross-team review, not by the suite - every existing membership test used a row per child domain, where the ancestor walk is never needed.

**`ScopedCasbinAdapter.resolveDomainEdges` hook added.** New optional constructor option, not on `ICasbinEnforcerOptions.domainHierarchy` as first proposed - the enforcer never constructs the adapter (an application does), so there is no channel from enforcer options to per-adapter construction. `resolveDomainEdges({ principal, domains })` returns `{ child, parent }[]`, already `<Type>_<id>` tokens, folded into `g3` lines exactly like a real `domain_inherits` row. `domains` is the principal's domain closure, reconstructed from rows `queryPrincipalPolicies` already returns rather than a third query. For a hierarchy an app already owns as a plain foreign key; `domainHierarchy.load` is for a hierarchy that IS authorization data - neither is a fallback for the other.

A throwing hook is caught, logged, and treated as no edges for that load - rows already gathered still load; chosen because a missing `g3` edge can only narrow access, never widen it. A hook edge duplicating a real `domain_inherits` row is harmless, verified: `DomainHierarchyRoleManager.addLink` stores parents in a `Set`, so a duplicate is a no-op. Proven end to end through a real `enforce()` (`scoped-adapter-domain-edge-hook-e2e.test.ts`). Absent, behavior is byte-identical (1291 pre-existing tests unmodified; 8 new added).

**Shared tree removed - one mechanism, not three.** The same fact - a role held, or a grant declared, at a parent domain reaching every domain beneath it - was expressed three times: `g3` lines built per-principal from `domain_inherits` rows, a process-wide shared tree (`ICasbinEnforcerOptions.domainHierarchy` -> `DomainHierarchyStore` -> `addDomainHierarchy` on `g`), and the per-principal `resolveDomainEdges` hook above. The shared tree and the per-principal path were both added in the prior two days; nothing consumed the shared tree. Kept the per-principal path - it reads live on every user-cache miss, is correct across processes because the user policy-line cache is already Redis-backed, and needs no duplicated rows, no TTL, no staleness ceiling.

Deleted outright: `enforcers/domain-hierarchy.ts` (`DomainHierarchyGraph` + `DomainHierarchyStore`), `adapters/domain-hierarchy-loader.ts`, `ICasbinEnforcerOptions.domainHierarchy` (all three fields), and `CasbinAuthorizationEnforcer.invalidateDomainHierarchy()` plus its optional declaration on `IAuthorizationEnforcer`. `addDomainHierarchy` on the `g` axis stays - casbin only accepts a `RoleManager` there - but its instance now reads only the shared per-request overlay `Map`. `DomainHierarchyRoleManager` and `MembershipRoleManager` both dropped their `store` constructor field; `BaseRoleManager.collectAncestors` dropped its `graph` parameter. `CasbinAuthorizationEnforcer.registerMatchers()` now wires the overlay and all three role managers unconditionally for every `isScoped` model - functionally identical when no `g3` edges exist. `ScopedCasbinAdapter`'s public/protected surface is unchanged; `TDomainHierarchyEdge` moved from the deleted loader file into `scoped-casbin.adapter.ts` itself. Test count: 1299 -> 1263 pass in `core-server`. Removed `domain-hierarchy.test.ts` (27 cases) outright; trimmed `domain-hierarchy-enforce-e2e.test.ts` (19 -> 13) and rewired `domain-hierarchy-role-managers.test.ts` (28 -> 26) onto the overlay-only constructors. See the rewritten [2026-08-29 changelog](/changelogs/2026-08-29-casbin-domain-hierarchy) and the updated `authorization-casbin` concept.

## 2026-08-30 - The no-enforcer branch in `authorize()` now fails closed

`AuthorizationProvider.createAuthorizeMiddleware` had one branch ignoring `IAuthorizeOptions.defaultDecision`: when `AuthorizationEnforcerRegistry.hasEnforcers()` was `false`, it called `next()` unconditionally, at `debug` level. Every other inconclusive outcome (an `ABSTAIN` decision) already fell back to `defaultDecision`; this one hard-coded ALLOW.

Fixed to read `options?.defaultDecision ?? AuthorizationDecisions.DENY`. `deny` (the default) throws a new `AuthorizationErrors.ENFORCER_NOT_REGISTERED` (403, `core.authorization.enforcer_not_registered`) naming the actual cause; `allow` still proceeds but now logs at `warn`. `alwaysAllowRoles`, `spec.allowedRoles`, and the voter chain all run earlier and are unchanged - verified a voter/role bypass still short-circuits before this branch.

BREAKING: an application relying on the old fail-open behavior during a rollout now gets 403s unless it sets `defaultDecision: 'allow'` explicitly. Tests: `kernel/src/__tests__/authorize/no-enforcer-decision.test.ts`. `AuthorizationEnforcerRegistry.resolveOptions()` only searches registered enforcers' containers, so with zero enforcers it can never see a real app's bound options regardless of this fix - a separate, pre-existing coupling gap, not touched here. See the [2026-08-30 changelog](/changelogs/2026-08-30-authorize-no-enforcer-fails-closed).

## 2026-08-30 - Search connector contract: `getHealth()` never throws, Typesense imports keep partial progress, `collectionExists()` stops lying

**Contract fix.** Meilisearch and Typesense connectors had drifted from the shared `ISearchConnector` contract in two ways, fixed to match Typesense's already-correct behavior. `getHealth(): Promise<{ ok: boolean }>` must never reject - `BaseSearchConnector.ping()` reads only `.ok` off the result - but Meilisearch's probe ran through `runEngineCall`, turning a failure into a sanitized 503; it now try/catches and resolves `{ ok: false }`, same as Typesense. Typesense's `importDocuments()` promised in its own comment to attach partial progress to every failure, but the `isApplicationError(error)` branch did a bare `throw error`; it now merges `{ totalCount, processedCount, successCount, failCount }` onto `error.extra.details` before rethrowing the SAME error, preserving `statusCode`/`messageCode` - matching Meilisearch's `throwImportFailure`.

Locked down in `connector-conformance.ts`: a required `buildWithFailingHealth` builder asserts `getHealth()`/`ping()` degrade to `{ ok: false }`/`false` rather than throwing - both engines inherit this for free. Engine-specific status-string mapping lives in `meilisearch/connector/lifecycle.test.ts`. Typesense's existing ApplicationError-path import test extended to assert `error.extra.details`.

**`collectionExists()` stops reporting infrastructure failure as absence** - a third instance of the same drift, deliberately owner-decided rather than discovered. `TypesenseConnector.collectionExists` wrapped its engine call in a blanket try/catch and returned `false` on ANY error - network, auth, anything - while `MeilisearchConnector.collectionExists` already tolerated only a genuine not-found via `runEngineCall` + `notFoundFallback`. `ensureCollection()` reads a `false` as "go create it", so reporting "does not exist" when the truth is "could not check" is the wrong shape for a caller whose next move is a write. Checked the Typesense SDK source (`Collection.exists()`) first: it already swallows its own `ObjectNotFound` internally and resolves `false` only for a real absence, rejecting only on infrastructure failure - no not-found case left to tolerate. Typesense now routes the call through `runEngineCall` with no `tolerate` clause; every throw is real and reaches the caller as a sanitized 503, matching Meilisearch.

Locked into `connector-conformance.ts` as a second required builder, `buildWithFailingExistenceCheck` - a third engine joining the suite must answer it too. The principle: a probe whose job is to detect failure must never throw (`getHealth`); a query whose `false` triggers a write must never lie (`collectionExists`) - opposite directions, both intentional. See the extended [2026-08-30 changelog](/changelogs/2026-08-30-search-connector-health-and-import-contract).

## 2026-08-30 - `casbin.enforcer.ts` split: policy-line codec and per-user cache moved out

Pure refactor, zero behavior change (502 tests unmodified, all pass). `CasbinAuthorizationEnforcer` carried six responsibilities under one class; two coupled to the rest only through `this.options` moved to their own files: `PolicyLineCodec` (`enforcers/policy-line-codec.ts`, static methods - extracting a user's lines from an isolated throwaway enforcer, loading a line list into a borrowed enforcer's model) and `UserPolicyLineCache` (`enforcers/user-policy-line-cache.ts`, a `BaseHelper` instance - the Redis cache key, TTL, and the `pendingLineFetches` single-flight map). `CasbinAuthorizationEnforcer` now holds one `UserPolicyLineCache` (lazily, via `requireRedisCache()`) and delegates. Pool lifecycle, the `IAuthorizationEnforcer` contract, and scoped-model wiring stayed put - splitting further would scatter rather than clarify. `casbin.enforcer.ts` is 653 -> 530 lines; public surface and the `loadPolicyLinesIntoModel` protected-override point are unchanged.
## 2026-08-29 - `domainHierarchy`: `g`, `g2` and `g3` gain parent-to-child reach

`ICasbinEnforcerOptions.domainHierarchy` (`{ load, refreshMs?, maxStaleMs? }`, `kernel/src/base/auth/authorize/common/types.ts`) is a new opt-in option; unset, `g`/`g2`/`g3` behave as before and `CASBIN_RBAC_DOMAIN_SCOPED_MODEL` stays byte-identical.

`DomainHierarchyStore` (`core-server/.../enforcers/domain-hierarchy.ts`) owns one shared child-to-parent tree per enforcer, warmed in `configure()` and refreshed on a TTL, loaded once per enforcer not per user. `warmup()` throws on a failed first load.

Three role managers consume it: `DomainHierarchyRoleManager` backs `g3` and, reversed, plugs into casbin's `DefaultRoleManager.addDomainHierarchy()` for `g`; `MembershipRoleManager` backs `g2`. Gains: `g` matches a parent-domain role at a child domain; `g3` extends a parent-domain grant to children; `g2` makes parent-domain membership imply membership in every child, feeding `ANY_MEMBER`.

**Correction: the shared tree is not what makes this fresh.** Freshness rides the existing per-user policy-cache invalidation - `ScopedCasbinAdapter` still emits per-principal `g3` lines from a `domain_closure` seeded by `join_domain` rows, re-read on every cache miss. `registerMatchers()` hands the `g3` manager and the reversed `g` instance the SAME overlay `Map`, since casbin never puts the `g`-axis manager in its own `rmMap`. Application contract: write `join_domain` in the domain-creation transaction, invalidate affected principals' caches only after commit, and invalidate every affected principal, not just the actor.

A `SYSTEM_WIDE` grant bypasses the domain clause before membership or nesting apply - unaffected.

**The precondition check is narrower than it looks.** "No domain plus membership at a parent" measures shape, not exposure - returned 1254 users, none affected. "Any role in that intersection with an `ANY_MEMBER` grant it should not have" returned 8.

A no-domain role assignment was already a wildcard (`g, User, Role, *`, `scoped-casbin.adapter.ts`'s `row.domain ?? '*'`), unaffected; use an explicit domain going forward.

`DomainHierarchyLoader` (`adapters/domain-hierarchy-loader.ts`) builds `load` from `ScopedCasbinAdapter`'s own entity mapping. `PolicyConnectorResolver` (`adapters/connector.ts`) extracts `BaseFilteredAdapter`'s connector-resolution logic for reuse.

**Two operational options followed design review.** `invalidateDomainHierarchy()` (optional on `IAuthorizationEnforcer`) force-reloads the tree, process-local only. `maxStaleMs` bounds stale-serving after a failed reload; past it, `graph` returns EMPTY instead of throwing, so hierarchy access stops but direct grants keep working. Unset is safe only while the domain tree is append-only; reparenting a domain requires setting it.

**A retry-gating defect was caught in review.** `refreshIfStale()` gated on the last successful load, hitting an unhealthy dependency every call. Fixed: gate on `lastAttemptAt`, set regardless of outcome.

## 2026-08-24 - `FilterQuerySchema` / `WhereQuerySchema`

Two composed query shapes in `kernel/src/base/repositories/query-schemas/index.ts`. The CRUD factory's `find`/`findById`/`findOne` now name them instead of rebuilding `z.object({ filter: ... })`.

Measured on the consumer that asked: 47 copies of `z.object({ filter: FilterSchema.optional() }).partial()` and 22 of the `where` equivalent, across 51 files. The 47 are **noise** - `FilterSchema` already ends `.optional()`, so the second `.optional()` and `.partial()` are no-ops that also discard the framework's `.openapi()` description. Deleting them is behaviour-neutral.

The 22 are **not** noise. `WhereSchema` has no trailing `.optional()`, and `resolveCountConfig` requires `where` whenever `isStrict.requestSchema` is set, the default from `factory/controller.ts`. Measured: `GET /x/count` and `?where=` both 400, only `?where={}` passes. **Deliberately left unchanged**; `query-wrapper-schemas.test.ts` pins it so a future change is a decision, not an accident.

`updateBy` and `deleteBy` keep required `where` for a stronger reason - a missing one rewrites or deletes every row - and must never migrate to `WhereQuerySchema`.

Both wrappers stay plain `ZodObject`s so `.extend()` covers composed call sites without a second API; re-applying `.openapi({ description })` returns a NEW schema, letting `findById`/`findOne` keep their own wording.

## 2026-08-22 - console log color is environment-gated

`resolveLoggerColorize()` (`logger/common/constants.ts`) decides, at call time, whether a line may carry ANSI. First match wins: `APP_ENV_LOGGER_COLOR`, then a non-empty `NO_COLOR`, then `NODE_ENV` outside `Environment.DEVELOPMENT_ENVS` - the same fail-closed boundary the error sanitizer uses, since staging and uat ship logs to an aggregator like production.

The return type is `boolean | undefined` on purpose: `undefined` means no opinion. Winston has no terminal detection of its own and reads that as on; the pino path forwards no option, so `pino-pretty`'s `isColorSupported` still suppresses color off a terminal. A plain boolean would force color through a pipe in development.

`ICustomLoggerOptions.colorize` overrides everything, both directions.

**Trap for tests:** `bun test` sets `NODE_ENV=test`, not in `DEVELOPMENT_ENVS`, so the default is OFF under the runner. `default-logger.test.ts` now passes `colorize: true` explicitly, asserting the wiring, not the policy.

## 2026-08-21 - `service` becomes a framework authentication strategy, and a JWKS signing-key leak closed

An Ed25519 assertion per request, verified against the caller's own JWKS; protocol and verifier were proven in a consumer application first.

**Why a FRAMEWORK name.** An application registering `service` under its own package forces every route to import that package; an IGNIS app not depending on it has no way to name the strategy. Measured: 576 route declarations, 201 files needing a new import, five files that could not compile at all. `AuthenticateStrategy.SERVICE` makes the migration a textual substitution, zero new imports.

**What the assertion covers, only this:** the HTTP method and the percent-ENCODED path - not the query string, header or body. It proves which service called, never which tenant it acts on.

Decisions:

- **Path compared as `new URL(context.req.url).pathname`, never `context.req.path`** - Hono hands the latter back DECODED, so a space or non-ASCII slug would 401 permanently while ASCII fixtures passed.
- **Allowlist uses `Object.hasOwn`, not truthiness** - the caller map is a plain object, so `iss: 'constructor'` returns truthy `Function` and reaches `new URL(<function>)` as an uncaught TypeError.
- **`signLifetimeSeconds` and `acceptMaxAgeSeconds` are SEPARATE; only the second is a security control** - the caller already sets `exp`, so the callee's accepted age is the only bound surviving a compromised caller.
- **`clockToleranceSeconds` widens for the FUTURE case**, not the window generally. Measured at tolerance 5: `iat+5s` accepted, `iat+6s` refused.
- **TWO windows, and writing either alone loses the other.** At defaults, clocks agreed: accepted to age 64, refused at 65 (ACCEPTANCE window 65s). Caller running `clockTolerance` fast: still accepted at 69s (REPLAY window 70s). Refusal is `ERR_JWT_EXPIRED` either way - `maxTokenAge` never binds for an honest caller. `clockToleranceSeconds` is a SECURITY knob, widening replay second for second. The number moved three times before settling - 60, then 70, then 65, then both - and lives in two tests.
- **Signer takes PEM only, deliberately** - `importSPKI` refuses a private PEM outright; `jwk` cannot offer that (below).
- **`resolvePrincipal` returns `IAuthUser | null`; the strategy validates `userId`** - `executeAnyMode` calls `setCurrentUser` unconditionally, so a principal without one authenticated then failed at the first write; `executeAllMode` already refused it, closing the gap.

`AuthenticateComponent` now accepts service-only configuration - the old guard "jwt or basic" refused an app that verifies assertions and issues no user tokens.

**The `jwk` format could publish the signing key.** `JWKSIssuerTokenService` served whatever `keys.public` parsed into. `pem` was never exposed. `jwk` was: `keys.public` is `JSON.parse`d into `importJWK`, and a private JWK with `"ext": true` yields an EXTRACTABLE key; `exportJWK` then carries `d` into the document at an unauthenticated URL. Measured on the jose in this tree:

```
ext=true       import OK, export has d: true
ext=false      refused: non-extractable CryptoKey cannot be exported as a JWK
ext=undefined  refused
```

Only an optional input flag stood between a mis-pasted key and a published signing key - a field named `public` must make serving something private impossible, not unlikely.

`assertPublicJWK` refuses `d`, `p`, `q`, `dp`, `dq`, `qi`, `k` in TWO places - at key load, and again immediately before the JWKS document is built, the last place to catch a signing key before `/certs` serves it. Named members, not a blanket scan, since a public JWK legitimately carries `x`, `y`, `n`, `e`.

Present in the published `@venizia/ignis@0.2.0-2`. Found evaluating BANA's service-auth implementation, whose PEM-only signer is immune - the immunity the service strategy inherits.

## 2026-08-20 - `scripts/release.ts` drives the release chain

`make release-plan` prints what needs releasing; `make release ARGS="--yes"` runs it, dispatching `package-release.yml` one package at a time in dependency order and WAITING for each run.

Waiting is the reason it exists: `force-update` runs over the whole workspace (`--filter "@venizia/*"`), so a range going stale mid-flight fails the run - a core-worker release once died on a range belonging to core-server, six minutes after a connectors release made it stale.

Three checks a human dispatching by hand skips:

- **The tree must be clean and pushed** - the workflow checks out the BRANCH, not local HEAD, so uncommitted/unpushed work is not released. Reported, not thrown, under `--dry-run`.
- **It fetches before reading any version** - a stale checkout makes repo and registry look falsely mismatched.
- **A green run is not proof of a publish** - the registry is re-read afterward; the run fails unless the version moved. Publishing happens BEFORE committing, so published-but-uncommitted and green-but-nothing-published are both possible.

It also `git pull --ff-only`s after each package, since the workflow pushes its own release commit.

**Measured on the 2026-08-20 release, dispatched in parallel instead of through this script:** three runs CANCELLED, one FAILED, of nine. `concurrency: { group: npm-release, cancel-in-progress: false }` keeps one pending run, cancelling extras rather than queueing. The failure, `Sync develop` losing a race with a sibling's push, was harmless by design - it sits BEFORE `Publish to NPM`, so the run died with git untouched and nothing published. The retry succeeded; every package landed, but four wasted runs is the cost of not serialising.

Which packages need releasing is derived, never listed: source files changed since that package's own `chore(<pkg>): release v...` commit. An explicit package list is honoured as given; a full sweep releases only what changed.

## 2026-08-19 - the deprecated `Swagger*` aliases are removed

`SwaggerComponent`, `ISwaggerOptions` and `SwaggerBindingKeys` are gone, by explicit decision, not attrition. `SwaggerComponent` first disappeared as a silent side effect inside the auth change; a pre-release audit caught it, it was restored, and only then was removing the family chosen deliberately.

A public export deleted without a changelog line breaks a consumer with nothing to search for. This is a documented breaking change with a migration table; every surface promising the aliases was corrected in the same change - `core-server/README.md`, the api-reference wiki page, this bundle's core-server concept, and the test pinning `SwaggerBindingKeys`.

**All three, not one** - removing only the named symbol would leave a consumer breaking on one of three, the worst of both states. Historical changelogs describing the original rename stay untouched.

Pure rename, no runtime consequence: `SwaggerBindingKeys.SWAGGER_OPTIONS` always held `'@app/api-reference/options'`. Verified before removing: no usage in `packages/*/src`, `examples/*/src`, or BANA.

## 2026-08-19 - service-to-service authentication, phase 1

Requested by BANA as a written change spec, evaluated claim by claim against `packages/*/src`, built after they accepted two overrides.

**The strategy type is open now:** `TAuthStrategy = TConstValue<typeof AuthenticateStrategy> | (string & {})`, the idiom `TDataSourceDriver` already used. The runtime was always open (a `Map<string, ...>`, a `string[]` middleware factory); only the type was closed.

**The widening deletes the only typo guard, so its replacement shipped with it.** Measured: a misspelled strategy fails CLOSED - `strategies.length > 0` passes, the middleware mounts, `resolveStrategy` throws, every request 401s - but `executeAnyMode` catches it at DEBUG level, so nothing surfaces; the compiler was the only thing stopping a typo. `AuthenticationStrategyRegistry.reportUnregistered` now runs while route configs build, at both the REST and gRPC call sites (previously a verbatim-duplicated block; fixing only REST would leave RPC unguarded).

**It REPORTS, it does not throw - the first cut got that wrong.** A pre-release audit caught it: `defineAuthController` hard-codes `strategies: ['jwt']` on four routes registered unconditionally, so an app registering JWT under a custom name died at `registerControllers()`. A route listing several strategies under ANY mode tolerates one that does not resolve, by design. The framework logs at error level; `assertRegistered` remains the throwing method an application can call at its own startup. Pinned by a test building route middlewares for an unregistered `'jwt'` and asserting no throw.

Two traps found by reading the code: an EMPTY strategies array is the framework's own encoding of `authenticate: { skip: true }` (`resolveRouteAuth` returns `{ strategies: [] }`), so rejecting `[]` would break every public route; and the check is skipped while the registry is empty, since route configs build after `preConfigure()`/`registerComponents()` in a real app - an empty registry means a unit test, where no name resolves either way.

`AuthenticateStrategy.isValid` and `SCHEME_SET` know only the two built-ins and now say so; no call site in this repo, but they stay public - the hazard was a future reader wiring `isValid` into the boot check and rejecting application-registered strategies.

**The OpenAPI document had to move with the type.** `buildRouteMiddlewares` emits `security: strategies.map(s => ({ [s]: [] }))`, while `ApiReferenceComponent` registered exactly two schemes. An undeclared scheme is an invalid OpenAPI 3.1 document - the UI renders unknown, a generated client silently omits the credential, and the route publishes as effectively unauthenticated in the contract. `IApiReferenceOptions.securitySchemes` closes it, applied last so an app can override either built-in.

**`verify`/`sign` on the JWT services.** Nothing checked `aud`, `iss` or `algorithms`, so a fleet pointing every verifier at one issuer JWKS accepted a token minted for one service, verbatim, by all. `IJWTVerifyOptions` mirrors jose's `JWTVerifyOptions`. Added beyond the ask: `maxTokenAge` (the real replay window), `typ` (cross-token-type confusion when one JWKS serves user tokens and service assertions), `requiredClaims`.

**The sign precedence was INVERTED against the request, deliberately.** The ask: `sign.issuer`/`sign.audience` as defaults yielding to a payload-supplied claim. Refused - `iss`, `aud`, `sub`, `jti` sit in `JWT_COMMON_FIELDS` and ride the AES envelope in the clear, the framework never calls `generate` itself, so the payload is entirely application-shaped; an overwritable issuer identity is not an identity. Configured values are authoritative; a conflicting payload claim is overwritten with a warn. Per-token variation is now explicit: `generate({ payload, claims: { audience, subject, jwtId } })`.

`JWSTokenService.getSigner` has its own fluent chain, so the same treatment landed in BOTH services - a sign option honoured only by the JWKS issuer would be silently inert.

Two behaviours: **jose's audience matching is OVERLAP, not equality** - `['commerce','inventory']` satisfies `verify.audience: 'inventory'`, so strict single-audience is enforced at issue time. **`maxTokenAge` measures against `iat`, not `exp`** - a token minted now has age 0, so `maxTokenAge: '0 seconds'` does not reject it; a test must backdate `iat`.

**The `applicationSecret` interaction is the finding that mattered most, and neither side had listed it.** `decryptPayload` runs after every successful verify and calls `aes.decrypt` with `doThrow = true` for every claim outside `JWT_COMMON_FIELDS`. A verifier with `applicationSecret` set CANNOT consume a foreign service's token at all, whatever `verify.audience` says - it throws before audience is reached. No framework knob was added: a dedicated verifier instance without `applicationSecret` works today.

## 2026-08-19 - a browser BFF that survives a second tab

`SharedBffTransport` (`packages/core-worker/src/transport/shared.ts`) runs one Worker per ORIGIN instead of per tab, and is now the default for a browser BFF; `WorkerBffTransport` is correct only when the BFF touches no origin-exclusive resource.

The constraint is storage. Measured in Chromium with two tabs of a PGlite/OPFS BFF without this transport: the first tab holds the OPFS access handle and works normally; the second renders its UI but its database never boots, every call failing with `Failed to execute 'createSyncAccessHandle': Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file`. The first tab stays unaffected; closing the lock holder and reloading the second recovers fully, including rows the first tab committed.

The transport elects one tab with the Web Locks API, calls `createWorker()` only in the winner, and forwards every other tab's request over a `BroadcastChannel`. Re-measured: tab 2 reads and writes through tab 1, and closing tab 1 promotes tab 2 in place with no reload.

Design points:

- **Web Locks, not a heartbeat** - the browser releases the lock when a tab goes away, crash included, so there is no stale-leader window.
- **`{ ifAvailable: true }` first, then a second QUEUED request** - the first tells a tab it is a follower without hanging behind the leader; the second is the promotion.
- **`createWorker` is a factory, not a `Worker` instance** - an instance would start the Worker before the election, the thing the election prevents.
- **Promotion rejects everything in flight** rather than replaying it, since those requests went to a leader that is gone and a write may already have applied.
- **`close()` aborts the queued lock request** - otherwise a closed transport stays in the queue and is eventually handed leadership over a tab that could have served.
- **No "new leader is ready" broadcast, deliberately** - it existed, was posted, and could not be consumed safely: `BroadcastChannel` does not order messages across senders, so a request posted around a promotion may still be answered by the new leader, and a follower failing in-flight requests on the announcement would turn successes into errors. The request timeout is the honest answer.
- A host with no `navigator.locks` runs single-tab at no cost: on a plain-http origin, `navigator.locks` and `navigator.storage.getDirectory` are BOTH undefined, both secure-context only.

Bun has `BroadcastChannel` but no `navigator.locks`, so the suite drives a `LockManagerStub`, or every test takes the single-tab branch.

**The stub grants the lock ASYNCHRONOUSLY, and that is load-bearing.** Granting synchronously let the role settle before the constructor returned, closing the window where `close()` races the grant - a real `LockManager` grants from a queued task, and a synchronous stub cannot test that window. Two blockers found there, both in the first cut:

- **`close()` during the election started a worker and held the lock forever.** The `ifAvailable` callback had no `isClosed` guard while the queued branch did; a closed transport called `becomeLeader()`, booted PGlite, took the OPFS handle, and reported itself leader - `close()` had already cleared `releaseLeadership` before `heldUntilClosed()` assigned it, so nothing could resolve it. An origin-wide outage from one transport closed milliseconds after construction.
- **The worker was never terminated, and `close()` released the lock BEFORE tearing down.** `WorkerBffTransport.close()` leaves its worker running since it did not create it, but `SharedBffTransport` DID. Closing on a live page promoted another tab that opened the same database while the old worker still held the exclusive access handle - reintroducing the exact failure the transport exists to prevent. It now terminates the `Worker` before releasing the lock.

Four more in the same pass: `fetch()` did not re-check `isClosed` after awaiting the role; `WorkerBffTransport.fetch` checked `isClosed` before an await, so a request encoded across a `close()` still reached and was EXECUTED by the worker; `becomeLeader()` was not failure-safe, so a CSP-refused `createWorker()` parked every caller forever with no timer; and an undecodable envelope left a follower's promise unsettled - version skew is the realistic trigger, since two builds share one channel by design.

The page-side fetch bridge moved from `examples/browser-bff` into `@venizia/ignis-worker` as `installBffFetch({ transport, basePath })`. It refuses a second install, carries the runtime's own `fetch` properties across (Bun hangs `preconnect` there), and resolves the request URL WITHOUT constructing a `Request`: `new Request(original)` flips `original.bodyUsed` to `true`, so the next read throws "body stream already read" - the example's earlier version broke the pass-through it was deciding about. Bun does not disturb it, so unit tests cannot guard this.

## 2026-08-19 - the framework audit: 52 findings, 18 defects fixed

168 agents raised 52 findings, 34 survived three adversarial lenses, 18 distinct defects were fixed. Behavioural changes a consumer can notice:

- `AxiosFetcher` defaulted `rejectUnauthorized` to **false** - every HTTPS request accepted any certificate. Now `true`; the agent builds once per instance; a caller-supplied `httpsAgent` is no longer overwritten by the `...rest` spread; `rejectUnauthorized` is a declared option. BANA uses this fetcher at 12 sites (VNPay, T-VAN, iiapi) and never set the flag, so a partner endpoint with a bad chain now fails loudly.
- `RequestSpyMiddleware` tested `env !== 'production'`, logging full bodies in `staging`, `uat`, `alpha`, `beta`, `prod` and with `NODE_ENV` unset. Now asks `EnvironmentNames.DEVELOPMENT_ENVS`, matching `BaseAppErrorMiddleware.isProduction`. Pinned by `request-spy-environment.test.ts`.
- `limit` is `int().nonnegative()` on the wire; `assertLimitWithinCeiling` enforces `@model settings.maxLimit` for the relational tier, which read it nowhere before - a negative limit dropped Drizzle's LIMIT clause and returned the whole table.
- `shouldSkipDefaultFilter` is off the wire `InclusionSchema`; stays on the internal `TInclusion` type and repository `options`, where BANA's four call sites use it.
- A malformed `filter`/`where` query string is a 400, not a 500: zod let a `SyntaxError` escape `safeParse` because the bare `JSON.parse` inside the transform bypassed validation.
- `Authorization.RULES` holds a `Map` keyed by enforcer name, and the resolved domain is a local instead of read back off context - one spec's domain used to leak into the next.
- Log redaction now covers `%o`/`%O` and placeholder-less arguments, plus `*Secret`, `*_password`, `connection_string`, `dsn`; `NodeFetcher` logs a body SIZE, never the body.
- Measured performance: redis `mSet` 1921ms -> 1.4ms at 10k keys (spread-in-reduce was O(n^2)); TCP disconnect drain 738ms -> 1.1ms at 5000 clients (`omit` rebuilt the whole registry).

Clean, so an absent finding reads as checked: SQL injection in the query builders, authentication bypass, error-response leakage, transaction correctness, crypto misuse, worker envelope integrity.

Fixes are pinned, each proved against the exact pre-fix file from HEAD, not by reasoning. **A hand-rolled partial revert proves nothing** - reverting only the `domain: domainScope` read left the test passing, because the same fix also made `context.set(Authorization.DOMAIN, ...)` unconditional, neutralising the leak on its own; only `git show HEAD:<file>` reproduced the real defect. `assertLimitWithinCeiling` guarded the top-level `limit` only, so `include[].scope.limit: -1` still dropped the LIMIT clause one level down; `assertFilterLimits` now walks the whole filter, with a SHAPE-only check on a relation's own limit.

New pins: `request-state-isolation.test.ts` and `redaction-coverage.test.ts` (13 of 18 redaction tests fail against pre-fix HEAD).

## 2026-08-19 - the worker package is renamed to `@venizia/ignis-worker`, browser-bff becomes a react-admin app, and `RequestIdGenerator` mints a UUID v4 again

The published package is `@venizia/ignis-worker`; the directory stays `packages/core-worker`. The old name `@venizia/ignis-core-worker` is GONE from npm (`npm view` 404, unpublished not deprecated); only `examples/browser-bff` had imported it.

`examples/browser-bff` is now a react-admin application on `@minimaltech/ra-core-infra`. The integration is one file, `src/bff-fetch.ts`, replacing the global `fetch` so `/api/*` is answered by the Worker - the only seam that does not fork `DefaultRestDataProvider`. Verified in Chrome: list, create, reload-persistence, delete all round-trip.

Two measured traps wiring `ra-core-infra`: `noAuthPaths` matches by EXACT resource name, never a pattern, so `['*']` is a literal and every request then demands a token the Worker never issues; and `CoreRaApplication` resolves its providers with a non-optional `container.get`, throwing before the first render on an unbound key.

`@minimaltech/ra-core-infra@0.0.3-17`'s peer ranges (`@venizia/ignis-inversion: ^0.1.1-6`, `@venizia/ignis-filter: ^0.1.2-0`) don't cover 0.2.0-0, but the four symbols it uses still exist - a stale range, not a break. It also calls `crypto.randomUUID()` unguarded for its tracing header, the same secure-context trap just removed from `RequestIdGenerator`.

**`RequestIdGenerator` mints a UUID v4 again, not a base62 Snowflake.** Snowflake cost 609 ns/op against 51 ns/op for `crypto.randomUUID()` - "UUID must be slower" is backwards; 72% of Snowflake's cost is its BigInt base62 encode loop. The strategy resolves once in the constructor, falling back to an RFC 9562 v4 from `crypto.getRandomValues()`, which no browser gates. Verified in Chrome on a plain-http origin (`isSecureContext: false`): 10,000 ids, all valid, none duplicated. `SnowflakeUidHelper` is UNTOUCHED - BANA mints business ids with it at 23 sites.

## 2026-08-18 - `OpaqueUidHelper`, the short-id counterpart to Snowflake

`packages/helpers/src/modules/uid/opaque.ts`. No time ordering; a chosen length, `prefix` and `delimiter` as `{ enable, value }` toggles, and an alphabet from `UidAlphabets`. Default is 6 Crockford characters, uppercase.

Named for the PROPERTY, not the mechanism - `RandomUidHelper` was the first name and described the implementation. A Snowflake id is transparent (`parseId()` returns the minute and worker); an opaque id returns nothing.

`enable` rather than "empty string means off": a toggle keeps `value` while switched off, so a delimiter can be flipped back on without retyping, and an accidentally-empty prefix is a reportable bug, not a silent no-op.

- **A two-case alphabet cannot be case-folded, and the helper refuses to try.** Uppercasing `BASE58` produces 35 characters, not the 33 an entropy calculation predicts, because lowercase letters fold onto uppercase and drag `I`/`O` back in - the pair `BASE58` drops to keep `1`/`0` unambiguous. Found by a test asserting 33, the wrong number.
- **`crypto.getRandomValues` is NOT secure-context-only** - only `crypto.randomUUID` is, the restriction behind `RequestIdGenerator`. This helper works on plain-http and inside a Worker.

Default length 6 is 2^30, chosen against airline record locators for the same reasons - scoped, recycled, regenerated on conflict - not because 2^30 is large. Measured: ~4,600 ids for 1% collision chance, ~38,000 for 50%.

## 2026-08-18 - the seam review: the error middleware's host reads become options, four duplications closed, and one finding refused

**`BaseAppErrorMiddleware` takes `environment` and `formatError` as constructor options**, replacing `protected` hooks that three subclasses existed only to answer. A present function returning `undefined` means a host that should have an ambient environment is misconfigured. `examples/browser-bff`, which faked the environment with a Hono middleware, now sets `config.error.environment`; its `TBffEnv` binding type is gone. `AppErrorMiddleware` in `@venizia/ignis` survives, overriding nothing. Verified in Chrome.

**The injected-host-object half of the review is REFUSED, with the measurement.** It proposed replacing `AbstractApplication`'s remaining virtuals with an injected `IApplicationHost`. BANA overrides `getProjectRoot()` in **10+ applications** - application API, not an accident. Its real substance, the `host`/`port` duplication and re-implemented port-validity logic, was closed by the socket split; one legitimate override plus `getDefaultAsyncContextEnabled` remain.

**The migration runner left the example.** `RelationalMigrationRunner` (`connectors/src/relational/core/migrations/`) commits the DDL and its ledger row in ONE transaction, so an interrupted first visit cannot leave a created table with an empty ledger. It splits on `drizzle-kit`'s `--> statement-breakpoint` (PGlite's `query` and postgres-js reject multi-statement strings) and REFUSES a migration name outside `[A-Za-z0-9._-]` rather than escaping it. Proven in Chrome against a PRE-EXISTING OPFS database: old notes read back, no re-migration, a write accepted.

**One `initialize()`.** `RestApplication.initialize()` states the artifact ordering once (staticConfigure -> preConfigure -> datasources -> components -> controllers -> postConfigure); `examples/browser-bff` deleted its copy. NOT done, deliberately: no-op defaults on the four lifecycle hooks, since `noImplicitOverride` would then demand `override` at **7 sites in BANA** - a real breaking change, left for an explicit decision.

**One audit-user resolver.** `resolveAuditUserId` replaces the byte-identical `getCurrentUserId` the postgres and sqlite enrichers each carried.

**Every browser-claiming package now dual-builds** (kernel, core-worker, connectors, helpers ship `dist/cjs` + `dist/esm`), enforced by `assertBrowserImportCondition`. `examples/browser-bff`'s page chunk fell **682 KB -> 54 KB**. Four things surfaced: `"sideEffects": false` let Rolldown drop `import 'reflect-metadata'` from the entry, killing decorators in PRODUCTION builds only; the ESM build needs `tsc-alias resolveFullPaths` since `bun build` cannot resolve an extensionless file import; `tsconfig.json`'s `outDir` had to move to `dist/cjs`, or helpers' self-referencing augmentation test stopped resolving; and `bun build`'s METAFILE marks a relative re-export as external while inlining it, which the purity probe misread as a leak - now skipped.

`connectors/sqlite/libsql [import]` is browser-pure where `[require]` is not. 42 rows now, 8 red, pinned in CI per condition.

## 2026-08-18 - the release pipeline, and a purity gate that could never pass

- `scripts/purity/manifest.ts` now DERIVES rows from each package's `exports` map. 11 rows became 24; `make purity` turned red on six connectors entries never probed before: `postgres`/`sqlite` reach `node:async_hooks` through the user-audit enricher's static `hono/context-storage` import (a defect); `node-postgres`, `postgres-js`, `libsql`, `typesense` pull their own engine client's node builtins (server-only by construction). `cli.ts` now exits non-zero when a `package` filter matches no row.
- `probe.test.ts`'s prefixed-builtin case asserted only that `buildError` contained `'fs'`, which a wrong-cause message also satisfies - measured, breaking `isBuiltinSpecifier` still left 11 pass / 0 fail. Now asserts `result.builtins`.
- `packages/{inversion,filter,boot}/scripts/rebuild.sh` type-check `tsconfig.esm.json` too, not just `tsconfig.json` - guarding one left `dist/` with `cjs/` and no `esm/`. Reproduced on filter, closed.
- `ServerApplication.getEnvServerPort()` walks `PORT` then `APP_ENV_SERVER_PORT` on VALIDITY, not truthiness - `.find(Boolean)` let `PORT=abc APP_ENV_SERVER_PORT=8080` bind 3000, and so did Docker's legacy-link `PORT=tcp://172.17.0.5:8080`.
- `PGliteDriver.end()` clears the exit status PGlite plants on the host process. Measured on 0.5.5: `process.exitCode` goes `undefined` -> 99 at the first WASM instantiation, once per process. `packages/connectors`'s suite printed `1141 pass / 0 fail` and exited 99; now exits 0. Clearing fires only while the value is still exactly 99, so an app's own exit code survives.
- `no-engine-cycle.test.ts` now walks every paradigm family's `core` tier, not just `relational` - the tier split had dropped the whole search tier out of the guard.
- The release workflow's rollback resets `develop` only when its remote tip IS that run's own release commit, pushing with `--force-with-lease` - the blind `reset --hard HEAD~1` had erased a sibling package's release commit (reproduced). `IS_PUBLISHED` is now set BEFORE `bun publish`, so a publish that succeeded and lost its response is reported, not silently rolled back. The unreachable `IS_MERGED` branch was removed.
- `make purity-connectors` could never exit 0: known-impure engine clients were allowed only by a hand-kept list inside `.github/workflows/ci.yml`, which the release workflow never read. The list now lives in the manifest as an `impure` waiver, checked both directions - a waived row that comes back pure fails as `STALE WAIVER`.
- `postgres/supabase [import]` is a real defect: under `--target=browser` Bun drops the `drizzle-orm/supabase` re-export yet keeps those names in the bundle's export block, so the output exports identifiers it never binds. An attempt to treat this as a probe false positive was reverted.
- The release workflow now runs `force-update` BEFORE `bun install`. Rewriting ranges after resolution had left node_modules holding a stale tarball - kernel built against helpers 0.1.1 while the workspace carried 0.2.0-0, failing with 15 x TS2305. A new step asserts every `@venizia/*` dependency resolves to the workspace, never a tarball.
- `force-update.sh` (all 10 copies) parses `npm view --json` with `jq`, not a grep/tail pipe - for an unpublished package npm prints its E404 body on STDOUT, and the old pipe fed that text to `sed` as the version.
- The release workflow publishes BEFORE it commits, pushes or tags, so no failure path force-pushes `develop`; both git rollback steps became unreachable and were replaced by failure reports. `CI` is `workflow_dispatch` only.
- `force-update` runs over the whole workspace, not just the released package - `bun install` resolves every member, so one stale internal range anywhere fails the run.
- Internal dependencies deliberately stay literal `^x.y.z`, NOT bun's `workspace:` protocol. Measured: the protocol fixes install but `bun pm pack` resolves the published floor from `bun.lock`, and bun 1.3.14 refreshes that record through no install path except deleting the lock (which re-resolves hundreds of packages). A release would publish a floor one version behind with no error. Do not re-propose without re-testing.

## 2026-08-17 - the kernel stops pretending it has a socket

Three altitude findings, done together as one thing seen from three sides: server assumptions left in the browser-pure layer.

**One default middleware stack.** `requestId()`, the error handler and `notFoundHandler` were installed from two independent paths, `WorkerApplication` and `BaseApplication`; both now come from `RestApplication.registerDefaultMiddlewares()`. `WorkerApplication` overrides nothing; `BaseApplication` adds `contextStorage`, `RequestTrackerComponent`, the favicon. `RequestTrackerComponent` no longer installs `requestId()`.

**One request-id rule, for both ends.** `BffRequestIdGenerator` became `RequestIdGenerator` in `@venizia/ignis-helpers/core` - it was never a BFF rule, since the server half still took hono's default and the two ends of one request stamped different formats. `packages/core-worker/src/common/` is gone with it.

**`host`, `port`, the runtime union and start/stop left the kernel.** `RestApplication.server` is `{ hono }` alone; the kernel used to write `localhost:3000` into every Worker application's config. Kernel `IApplication` narrowed to what every host implements; the rest is `@venizia/ignis`'s new `IServerApplication`.

Two things pinned by test: **`@venizia/ignis` must keep exporting `IApplicationConfigs` WITH `host`/`port`** (nx-seller writes both) via an explicit re-export in `src/index.ts` - a name reachable only through two `export *` lines is ambiguous and TypeScript exports NEITHER, with no error. And `hono/request-id`'s `ContextVariableMap` augmentation only applies where that module is in the program - once the middleware moved into the kernel, `context.get(REQUEST_ID_KEY)` silently lost its type; `middlewares/common/constants.ts` now restates the augmentation.

## 2026-08-17 - two measured hot paths, and one that measured as not worth fixing

**Boot no longer re-scans the binding map per item.** `RestApplication.registerDynamicBindings`, `RestComponent.binding` and `GrpcComponent` each fetched a tagged list, took ONE entry, then re-scanned the whole map - N+1 scans. They now drain the batch and re-scan once. Measured: 200 controllers / 1002 bindings, **3.50 ms -> 0.043 ms**. The batch introduces one hazard: a binding configured by a SIBLING inside the batch could run twice, guarded by a `configured.has(key)` check, pinned by `dynamic-bindings.test.ts`.

**`toInclude` asks the registry once per relation, not three times.** `resolveHiddenProperties`, `resolveDefaultFilter` and `resolveDefaultLimit` each ran `getTableName` + `getModelEntry` on the same schema; they now accept an already-resolved `modelEntry`. `build()` **1205 -> 942 ns** with one include.

A per-schema `WeakMap` memo was tried FIRST and reverted: it made 40 core-server tests fail, because a model entry cached under one test's registry mock leaked into the next - the same staleness a re-registered model (HMR in the browser BFF) would hit. Do not re-introduce it.

**The error-path log gate was measured and rejected.** `formatError` renders eagerly as a `logger.log()` argument - 46.58 µs, 98.6% of the error path - and gating on the resolved level was proposed. The win is zero: the level only falls below the floor when a throw site passes `getError({ logLevel })`, and both framework sites doing that pass `warn`, which is emitted. BANA has **zero** `logLevel` sites. Revisit only if an application starts throwing below its logger floor.

## 2026-08-17 - module-level state moved into classes, and the last cross-package `instanceof`

Two related sweeps, both leaving every published name in place.

**The `redisConnection` check is a brand now.** `SocketIOComponent` and `WebSocketComponent` validated `REDIS_CONNECTION` with `instanceof AbstractRedisHelper` - the same hazard `@repository` already retired. `isRedisHelper` reads a `Symbol.for` brand off the instance instead.

**Module-level mutable state now lives in a class.** Eight files kept `let`/`Map`/`WeakMap` at module scope with exported arrows reading it:

| Was | Is |
|---|---|
| `getRing`, `ringState` | `HfLogRing.get` |
| `textEncoder`, `scopeCache`, `encodeScope` | private statics of `HfLogger` |
| `textDecoder`, `renderEntry`, `buildDefaultSink` | private statics of `HfLogFlusher` |
| `backingInstance`, `backingTransport` + 7 arrows | `PinoDestination`, `PinoBackingLogger` |
| `droppedRouteDecorators`, `isReported` + 3 arrows | `DroppedRouteDecorators` |
| `hasReportedUnavailable`, `getIncomingIp` | `NetworkUtility` |
| `columnCache`, `getCachedColumns` | `TableColumnCache` |
| 7 envelope codec arrows | `BffEnvelope` |

A published name stays exported as a one-line delegate, the shape `getError`/`fromError` already use. Only `core-worker`'s envelope functions were renamed outright, that package having never shipped. Pure stateless functions were left alone.

## 2026-08-15 - duration units and conversion, brought over from BANA

`DurationUnits`, `TDurationUnit`, `IDuration` and `DurationMultipliers` now live in `packages/helpers/src/common/constants/duration.ts`, browser-pure. Ported from BANA's `packages/core/src/models/schemas/common/constants.ts`, keeping `toMilliseconds`'s `null`-not-throw contract so BANA migrates by changing an import.

Left behind deliberately: `LABELS` (presentation strings, pulling BANA's `INameI18n`) and `NearExpiryThreshold` (business logic).

Added beyond the port: `DurationAliases` (a const class whose UPPER_CASE members ARE the accepted spellings), `fromMilliseconds`, `convert`, `parse`, `parseToMilliseconds`.

- **The lookup is not the cost - normalising the input is.** `Map.get` is ~1 ns; `trim().toUpperCase()` is ~55 ns. `resolve` tries the input as given first, normalising only on a miss. `resolve('day')` went 70.8 -> **2.1 ns**.
- **Reading the const class directly is 5x slower than a derived table**, which is built from the class's own static fields so the two cannot drift.

`m` is MINUTE and `mo` is MONTH; there is no single-letter month.

## 2026-08-15 - kernel singletons anchored on the realm, and one `instanceof` retired

A review recommended making `@venizia/ignis-kernel` a `peerDependency` of `connectors` and `core-worker`, to stop a second copy ever installing. Rejected in favour of making a second copy **harmless**, strictly stronger: a peer only prevents the common case and cannot stop hoisting, aliasing or a strict resolver from producing two copies.

- `SingletonRealm.resolve` (`packages/kernel/src/helpers/singleton-realm.ts`) anchors a value on `globalThis` under a `Symbol.for` key. Five singletons moved onto it: `MetadataRegistry`, `AuthenticationStrategyRegistry`, `AuthorizationEnforcerRegistry`, `GrantBuilder`, the `RequestContextRegistry` resolver slot.
- `@repository`'s first-parameter check no longer uses `instanceof AbstractDataSource` - two copies give two classes, rejecting a valid repository at import. It now reads a `Symbol.for` brand via `isDataSourceClass`.

Proven against two separate module graphs of the built kernel: class identity `false`, all four registry instances shared `true`, the old `instanceof` check `false` where the new predicate is `true`. Public surface 227 -> 229; nothing removed.

## 2026-08-15 - `packages/core` becomes `packages/core-server`

The DIRECTORY only. The package is still published as `@venizia/ignis` - 227 runtime exports and all 19 sub-paths resolve unchanged, verified from a real consumer.

- 785 path references rewritten across 160 files, 678 GitHub source links in `docs/wiki`. The rewrite is boundary-aware (`packages/core` NOT followed by a hyphen), since `packages/core-worker` shares the prefix.
- The concept moved with it - `packages/core.md` becomes `packages/core-server.md`, since `okf-check`'s coverage rule keys on the directory name.
- `make core-server`, `lint-core-server`, `update-core-server`, `purity-core-server` are primary; `core`, `lint-core`, `update-core` remain aliases.
- The release workflow input is `core-server`, since `PACKAGE_PATH="packages/$PACKAGE"` addresses the directory.

Two gates went red right after the move, green on re-run: `make build-all` and `make okf-check`, both reading a `dist/` half-written by the rename. Re-run before believing a failure that arrives with a directory move.

## 2026-08-15 - the review fixes, and a gate that now tells the truth

- **The published helpers floor was a lie about contents.** Every package pinned `@venizia/ignis-helpers: ^0.1.1-17`, the highest on npm, while this branch added `EnvironmentNames`, `executeWithPerformanceMeasure`, `executeWithRetry*` and parse utilities without bumping. `npm pack` of the tarball has none of them, and the kernel's `dist` calls four - `bun add @venizia/ignis-kernel` would die on the first `registerComponents()`. helpers is now `0.1.1-18`. A dependency range is not a contract about contents.
- **`BaseAppErrorMiddleware` logged `extra` unredacted.** The only error middleware exported from the `@venizia/ignis` root printed keys to a browser console while the server path redacted. Now `toJsonSafe`. The BigInt replacer stayed, since `JSON.stringify` refuses BigInt and dropping it would collapse the whole fragment to `[unrenderable]` - measured, against the review's claim of a straight swap.
- **`toJsonSafe` has the same shared-reference defect** the kernel's hand-rolled renderer had - a visited-set, not an ancestor-set, so `{ requested: user, owner: user }` renders the second as `[Circular]`. NOT fixed: an ancestor-set can explode on a wide DAG, a separate decision affecting every `redactSecrets` caller.
- **`hasAmbientEnvironment()` added beside `resolveEnvironment()`** - only a host that HAS an ambient environment can be misconfigured about one, so the Worker no longer buries the real error under `INVALID ENV IDENTIFIER` on every error. Both paths still fail closed.
- `packages/core-worker` gained `BffRequestIdGenerator`, a `statusCode` on the error envelope, synchronous listener attachment with envelope queueing, an idempotent `listen()`/`stop()`, one shared worker-error listener over a pending-request map, and an `InProcessBffTransport`. `examples/browser-bff` dropped its ready handshake and `whenBffReady` - the framework queues now.
- The purity manifest derives rows from each package's `exports` map: 11 hand-written became 24, and `make purity` is deliberately RED on six.
- **`@venizia/ignis-connectors/postgres` and `/sqlite` are browser-importable.** Both user-audit enrichers imported `tryGetContext` from `hono/context-storage`, whose module body constructs an `AsyncLocalStorage` - a `TypeError` at import in a Worker. They read `RequestContextRegistry` (kernel) now, installed ungated by `registerDefaultMiddlewares()`. The registry answers `undefined` for "no request context," distinct from "a context with no user" - the enricher raises different errors for each.

## 2026-08-14 - core-worker, the browser BFF, and two gate blind spots

- New concept `packages/core-worker.md`: an IGNIS application inside a dedicated Worker, answering REST routes over `postMessage`. `Request`/`Response`/`Headers` throw `DataCloneError` under structured clone, so an envelope crosses instead; `ApplicationError` crosses as its normalised shape and `fromError` rebuilds it.
- New concept `examples/browser-bff.md`: the same model, repository and controller as `pglite-quickstart`, answering from PGlite in OPFS with no server. OPFS persistence across a reload was reproduced independently three times.
- New concept `packages/connectors.md` for the package carved out in Wave 3.
- `architecture/error-handling-flow.md` corrected: middleware logic now lives in the kernel as `BaseAppErrorMiddleware`, with a thin `packages/core-server` subclass overriding `resolveEnvironment()` and `formatError()`.
- Three measured gotchas added: `types: []` cannot make `process.env` a compile error, since `ioredis` and `casbin` carry `/// <reference types="node" />` into any consumer's program; `make purity` is silent about published sub-paths with no manifest row, so `@venizia/ignis-connectors/postgres` reached `node:async_hooks` while the gate read 11/11; the root `package.json` PGlite pin is load-bearing.
- Three `connectors/relational/sqlite` files imported `LoggerFactory` from the helpers ROOT barrel, pulling `ioredis` and failing the browser build on `tls`. Switched to `new BaseHelper({ scope }).getLogger()`. Removing the last root-barrel import broke the `IErrorKeyRegistry` augmentation in `search/core/common/errors.ts`, silently anchored by it - an empty `import type {}` now holds it at zero bundle cost.

## 2026-08-13 - the kernel package: full sync, release plumbing, and a sharper purity gate

Full-mode sync over `a7e57a1..HEAD` plus the working tree - 5 area verifiers, 6 directory spot-auditors, 2 critics produced 146 findings against 341 claims confirmed still true, across 47 concept files.

**A new package, and a new axis the bundle did not have.** `@venizia/ignis-kernel` now holds the browser-pure half of the framework - DI container, application lifecycle, REST controller layer, repository/datasource abstractions, authentication and authorization seams - about 128 files. It sits *beside* `boot`, not after it, keeping boot's node-only glob discovery out of the kernel graph. `packages/core-server/src/index.ts` re-exports the kernel wholesale, so `@venizia/ignis` keeps its published name and whole public surface with no consumer import changed.

**The application base is four layers across two packages, not one class.** `AbstractApplication` (kernel: config, hooks, `init()`, no router, no server) -> `RestApplication` (kernel: the two `OpenAPIHono` instances) -> `ServerApplication` (core: the only layer touching a socket) -> `BaseApplication` (core: configuration sequence, secrets, boot). Every concept describing one monolithic `AbstractApplication` was wrong. `asyncContext.enable` no longer hard-defaults to `true` - it resolves through `getDefaultAsyncContextEnabled()`, `false` on kernel layers, `true` on `ServerApplication`; that hook is called from the constructor, so an override must return a pure literal.

**`@repository` no longer drags Drizzle into every graph that uses it.** `RepositoryMetadataMixin` resolves relations through `RelationBuilderRegistry`; the relational connector installs `createRelations` from the module body of `base.ts`, not `relation.ts`, since under `sideEffects: false` a module reached only through an unused re-export is dropped. Guarded by `relation-builder-wiring.test.ts`.

**The empty-`dist` trap is closed.** `rebuild.sh` type-checks before `bun run clean`, so a broken test fails loudly with the last good `dist/` intact.

**A gate the type-checker cannot see.** `make purity` bundles each browser-pure entry for `target: browser` and fails on node builtins. It cannot be a text scan: measured on Bun 1.3.14, `bun build --target=browser` silently stubs an unpolyfillable builtin to an empty object, exits 0, leaves no `node:` string, and inlines `process.env.NODE_ENV`. The gate reads the `--metafile` module graph, passes `--env=disable`, and matches `node:module`'s own `builtinModules`.

Gates: `make okf-check` OK (64 files, 62 concepts), structural coverage 18/18.

**Release plumbing added the same day.** `drizzle-orm` and `jose` joined `casbin` as optional peers of the kernel, both reached only by `import type`. The purity probe now grades node-global reads by whether they can throw: `globalThis.process.X` is fatal, `globalThis.process?.X` is `guarded` and stays green. `make purity-test` was added since the probe's own regression tests live outside every package. `TBunServerInstance` moved from the kernel to `ServerApplication` in core - `ReturnType<typeof Bun.serve>` had survived into the kernel's published `.d.ts`, resolving only through the `@types/bun` devDependency, breaking a browser consumer with `skipLibCheck: false`.

## 2026-08-12 - `%j` log arguments are projected before `JSON.stringify` sees them

A log argument bound to `%j` used to reach `JSON.stringify` raw, which answers `[Circular]` for the WHOLE argument when a single cycle sits anywhere inside it - one live transaction handle in a payload erased every other field. The `%j` path now runs `toJsonSafe` (new export in `common/redact.ts`), so cycles collapse per branch, secret keys are masked as under `%s`, and the walk is capped at `APP_ENV_LOGGER_INSPECT_DEPTH`. The shared traversal also stopped flattening `Date` to `{}`. Still open by design: `%o`/`%O` and no-placeholder arguments are not redacted.
## 2026-08-06 - AES on PBKDF2, keyring rotation, and a cipher seam

PR #32 replaces pad-or-truncate key derivation with PBKDF2-SHA256 (100k iterations) and adds a
version + key-id header, so a keyring can rotate keys without re-encrypting. BREAKING: data written by
an earlier IGNIS no longer decrypts with `AES`; `LegacyAES` is the deliberate read path for old
ciphertext.

A follow-up adds `IPayloadCipher` plus a `cipher` option on the bearer-token services (previously
hardcoded to `AES`), closes the `resolveDecryptKey` empty-secret gap, and drops the silently ignored
`iv` decrypt option.

## 2026-08-06 - logged errors carry their args, code, frames, and a JSON shape

`ErrorPrettier` modeled `extra` but not `normalized`, so an `ApplicationError` logged its raw
`%{placeholder}` template with no values on the line. `IErrorSummary` gains `args` (root only) and
`messageCode`, kept separate from `code` so a driver's `23505` never prints as a message code.
`AppErrorMiddleware` now gives an intentional error 5 frames instead of none.

## 2026-08-02 - release-readiness audit and migration guide

Measured, not assumed: built both f1eb610 (merge-base with develop) and HEAD, then diffed them. A
probe importing all 774 base symbols typechecked against the new `.d.ts`: 764 resolve, exactly 10
break, matching the 10 the 2026-08-01 changelog already listed.

Two documentation gaps closed: `getQueryInterface`/`_updateBuilder` are `protected` and were dropped
from the repository tier with no changelog entry; the sqlite-quickstart concept named
`DefaultCRUDRepository` where the SQLite tier spells it `DefaultSqliteRepository`.

The 2026-08-01 changelog gains a project-agnostic migration guide, verified against a fixture project
- 5 errors before the codemod, 0 after. The `\b` anchors are load-bearing: without them `FilterBuilder`
rewrites the inside of `PostgresFilterBuilder`.

## 2026-08-02 - PGlite and SQLite: runnable quickstarts, generated migrations, and wiki pages

Both quickstarts applied a hand-written DDL string at boot, justified by "an embedded database has no
server for a migration CLI to reach" - false: drizzle-kit supports `driver: pglite` and a sqlite file
url, and both migrators export `migrate`. Generating the migration proved the DDL had drifted -
Postgres declared `id uuid default gen_random_uuid()` where the model emits `text` with an
application-side `$defaultFn`. The real constraint is narrower and PGlite-only: it holds an exclusive
lock on its data directory, so `drizzle-kit migrate` cannot reach a database the app has opened. Two
runnable examples ship, one per engine; both ran, not only type-checked, surfacing four documented
traps including `init()` before `start()` and `ISO_TIMESTAMP_NOW` needing `sql.raw()`. The wiki gains
`pglite.md` and `sqlite.md` - both connectors had shipped with no human-facing page. CORRECTION: the
conformance suite is **23 tests per engine** (46 total), not 21. CORRECTION:
`migrate()` from `drizzle-orm/pglite/migrator` does not take `getConnector()`, which returns the
generic `TRelationalConnector` while the migrator demands drizzle's narrower `PgliteDatabase` - the
pages build a `drizzle({ client })` over the same client instead.

## 2026-08-02 - SQLite connector built out: models, dialect, executor, driver, conformance suite

Built bottom-up in one day, from the neutral tier to a real database. `connectors/sqlite/models`
declares `SQLiteTable`-branded types rather than re-exporting the neutral tier. The neutral
`FilterBuilder` seam widens: two methods go `private` -> `protected`, and two JSON-path methods become
`protected abstract` with their Postgres-specific bodies moved into `PostgresFilterBuilder` - the
neutral base had silently emitted Postgres syntax by default, with no compile error. `LibSqlDriver`
borrows from a 1-slot pool since Drizzle binds to a libsql `Client`, never its interactive
`Transaction`. New concept: [SQLite connector](/architecture/sqlite-connector.md).

The conformance suite runs one repository suite against real PGlite and libsql `:memory:` databases,
no mocks; first run found a live defect - `PostgresQueryExecutor.readAffectedRowCount` did not know
PGlite's `affectedRows`, throwing on a Postgres write with `shouldReturn: false` - fixed. Other bugs:
`LibSqlDriver`'s 1-slot pool had no `acquireTimeoutMs`, so a leaked transaction hung every later
`acquire()` forever - now defaults to 30s. `onSecretRotated()` drained clients via `typeof client.end
=== 'function'`; neither PGlite nor libsql has `end()`, leaking WASM instances and file handles -
replaced by `drainClient()`, which probes `end()` then `close()`. SQLite's `isoTimestamp` read a
zone-less driver value through `new Date()`, parsed as host-local - it now reads as UTC.
`IConformanceCapabilities` gains `caseInsensitiveLike` and `nullsSortHigh`, since SQLite's `LIKE`
folds ASCII case and its NULLs sort low, both inverting Postgres.

## 2026-08-02 - PGlite driver added, then its slot wait bounded

`PGliteDriver` ships at `@venizia/ignis/postgres/pglite`, an embedded single-file test database on
the unchanged Postgres dialect. PGlite has one session and a second `BEGIN` silently joins the open
transaction, so `acquire()` serializes through a 1-slot pool. `DataSourceDrivers` now names five
shipped drivers, not four.

Follow-up: the pool had no `acquireTimeoutMs`, so a leaked transaction hung every later `acquire()`
forever, silently - now defaults to 30s.

## 2026-08-02 - search findById now carries its filter; family's signature divergences listed

`ReadableSearchRepository.findById` declared no `filter`, so a caller typed at `ICrudRepository` -
including the generated CRUD controller - lost `fields` silently via parameter bivariance. The
signature now matches the base; `search-typesense.md` gains a table of the deliberate divergences.

## 2026-08-02 - the relational-connector lift finalized: neutral tier, FilterBuilder alias, changelog

`connectors/relational/repositories/core/*.ts` held ten `import type`s of Postgres-only contracts to
serve two generic defaults - the dependency arrow pointed backwards. Postgres's repository core
changes from re-exports to five real subclasses, so `PostgresBaseRepository`/`ReadableRepository`/
`PersistableRepository`/`DefaultCRUDRepository`/`SoftDeletableRepository` are now distinct class
objects from their neutral parents; the neutral names no longer resolve from `@venizia/ignis/postgres`.

`FilterBuilder` moves to `connectors/relational/repositories/dialect/filter.ts` and becomes `abstract`.
BREAKING: the `export { PostgresFilterBuilder as FilterBuilder }` alias is gone - it had published two
different classes under one name across sibling sub-paths. CORRECTION: `filter-system.md` and
`relational-connector.md` had claimed the operator table was `protected` rather than `abstract` -
wrong, fixed.

Three rules recorded: (1) the prefix follows the declaration keyword, `I` for `interface`/`T` for
`type` - BREAKING rename of `IRelationalDriver`/`IRelationalConnection` to
`TRelationalDriver`/`TRelationalConnection` in the Postgres driver; (2) a `protected` member is public
API to a subclass - `denyOperation(methodName)` became `denyOperation({ methodName })`, and a
`protected` signature change is breaking, never internal; (3) the root barrel's
`TTableObject`/`TTableInsert` are `PgTable`-branded, so a re-exported neutral `Table`-branded schema
hit `TS2344` downstream - only `bun run typecheck` sees this, not `bun test`. Also folded in:
`findById`'s recovered `options.retry`, the most user-visible change in the set. CORRECTION: the
`*RelationalRepository`/`*RelationalDataSource` compat aliases are gone from both packages, though the
changelog had still claimed them exported.

## 2026-08-01 - connectors/relational goes public; two claims about it were corrected same day

`feat/relational-connector` hoists an engine-neutral SQL tier out of `connectors/postgres` into
`connectors/relational`, reachable via a `@venizia/ignis/relational` package export.
`connectors/index.ts` does **not** gain `export * from './relational'` - the two barrels share class
names, so merging them would make one of each pair unreachable by name. New concept:
[Relational connector](/architecture/relational-connector.md). CORRECTION: a spec claimed a SQLite
connector needs its own 724-line filter translator - measured
against the file, wrong. `FilterBuilder` has zero `drizzle-orm/pg-core` imports; only ~471 of ~1104
dialect lines are genuinely Postgres-specific. Verified against the built package, not only types:
every BANA-facing compat alias is the SAME class object as its canonical `connectors/relational` name.

Same-day review found two more facts wrong. CORRECTION: the `FilterBuilder` override seam did not
exist - every relevant method was `private`, hardcoded to `PostgresQueryOperators.FNS`; six methods
are now `protected`. CORRECTION: "the two barrels deliberately share class names" was a defect, not a
decision - the Postgres datasources module had declared the same names the neutral tier declares,
renamed to `AbstractPostgresDataSource`/`BasePostgresDataSource`.

## 2026-08-01 - options.retry restored on relational read verbs that had narrowed it away

`SoftDeletableRelationalRepository.findById` and `RelationalBaseRepository`'s abstract read verbs
typed `options` as bare `ExtraOptions`, dropping `IWithReadRetry` - `options.retry` was a compile
error on the class BANA extends most. GOTCHA recorded in `repository-hierarchy.md`: re-declaring a
read verb silently narrows `retry` away, invisible to `tsc`. Also recorded: `isStrict` is evaluated
AFTER the retry loop is exhausted, so a strict read waits out replica lag before throwing
`ENTITY_NOT_FOUND`.

## 2026-07-30 - /core's .d.ts graph gated after three ambient-global leaks, then two more found

Bundling erases types, so the bundle-and-spy purity tests never saw three ambient-global leaks in
`/core`'s type graph: `NodeJS.Timeout` (now `ReturnType<typeof setTimeout>`), a `hono/jsx` re-export
(moved to `common/jsx.ts`), and `IFetchable` generics bounded by fetcher types that dragged `axios`
into any file reaching the fetcher's leaf module - the bound now drops to `unknown`. `src/__tests__/core-type-surface.test.ts` is the gate: `tsc --noEmit` on a fixture Worker consumer
under `types: []` (drops the ambient `NodeJS` namespace) and `skipLibCheck: false` - drop either
setting and it passes for the wrong reason.

A whole-wave review then found two more defects. First, `common/index.ts` still had `export * from
'./jsx'`, reaching the same way `/core` did before its fix - fixed the same way `ErrorSchema` left the
error barrel. Second, more serious: the widen-`getWorker()`-to-`unknown`-then-cast shape checked
nothing - a mismatched implementor still compiled clean via `as`. CORRECTION: fixed with a fourth type
parameter instead, `IFetchable<V, RQ, RS, W = unknown>`, with concrete fetchers binding `W` in the
`extends` clause. Confirmed closed: a rogue implementor now fails with `TS2322`.

## 2026-07-29 - helpers ships a /core sub-path: the isomorphic surface a Web Worker can import

`Defaults.APPLICATION_NAME` and `isRedactionEnabled` read `process.env` directly - a bare Node global
a browser bundle of `/common` cannot resolve. Both now read through `globalThis.process?.env?...`,
degrading instead of throwing outside Node. `modules/error/types.ts` (an `@hono/zod-openapi` import)
moves to `modules/error/schemas.ts`, since the error barrel is on the browser path through `getError`
and `@hono/zod-openapi` is not browser-safe.

`@venizia/ignis-helpers/core` re-exports `BaseHelper`, the error layer, `uid`, `pool`, `HfQueueHelper`,
`ILogger`, and the fetcher interfaces - every leaf proven to bundle clean for `target: 'browser'`, each
named as a leaf module path, never a barrel. `.githooks/pre-commit` now runs `make purity` after `make
lint-all`, so a purity break fails a commit instead of staying invisible until a release.

## 2026-07-28 - the Kafka bundler stops dying on a hoisted require

`platformaticRequirePlugin()` is added to the Kafka bundler, plus `platformaticKafkaPlugins()` as the
one entry point compile scripts should register. `@platformatic/kafka@2.8.0` hoists two `require()`
calls to MODULE SCOPE in `registries/confluent-schema-registry.js`, which `dist/index.js` re-exports -
so every compiled binary importing any Kafka helper died with `Cannot find package 'ajv-draft-04'`
before boot. The plugin rewrites each module-scope `require` into a static import at bundle time.
GOTCHA: the injected binding has NO `?.default` unwrap - the draft-06 meta schema JSON has its own
top-level `default` key, so unwrapping silently swaps the meta schema for `{}` (the binary boots, then
draft-06 validation fails).

## 2026-07-27 - optional peers reach compiled binaries: a registry, then a typed options seam

`ModuleUtility.register({ modules })` closes the hole a bundler-invisible specifier opens: a `bun
build --compile` binary has no `node_modules` to resolve a peer at runtime. BANA's `identity` proved
it in production - `nodemailer` in `package.json`, nothing in the image, boot dead the moment mail
transport switched to `ModuleUtility.loadSync`. The app registers the peer before the consuming
component binds. A same-day follow-up demotes it for mail:
`INodemailerMailOptions.module`/`IMailgunMailOptions.module` let both transport helpers fall back to
`ModuleUtility.loadSync` only when absent - a global registry keyed by string is a service locator,
call-order-dependent and typo-prone, while an options seam is DI.

CORRECTION: `@connectrpc/connect` was named as a case `register` was for - it never could be, since
the gRPC adapter resolves the specifier itself. Fixed with `IGrpcComponentConfig.module` (`{ connect,
protocol }`). `assertInstalled` now takes `allowRegistered`, default **false**: a registration counts
only where `ModuleUtility` itself performs the load. `register` no longer logs - it ran at the one
deployment entrypoint with no logger provider, silently dropping every module after the first.

## 2026-07-26 - the error catalog is complete, and it was nearly finished already

`SearchErrors` and `MailErrors` close the last nine client-facing 4xx that still spelled their status
and code at the throw site. Seven catalogs now, all pinned in `framework-catalog.test.ts`.

The measurement that mattered was knowing what NOT to convert: 244 `getError` sites in `core` still
carry an inline message, reading like an 85% backlog, but the convention only catalogs CLIENT-FACING
4xx. Of those 244, 197 declare no status and 38 declare a 5xx - exactly 9 carried a 4xx, so the catalog
was ~95% done, not 15%. Those nine had a code already; the defect was retyping code AND status at the
throw site.

## 2026-07-26 - core declares zod: a hoisting-dependent declaration-emit failure

The `core` release failed CI at Build with TS2742 - it built fine locally. `core` re-exports
`WhereSchema`/`FilterSchema` from `@venizia/ignis-filter`, so its public `.d.ts` must name zod's
types, but core declared no `zod` dependency. Locally a hoisted `node_modules/zod` let TypeScript
write a portable type reference; CI's layout had no such hoist. GOTCHA: the local pass was luck, and a
warm `tsbuildinfo` hid it further - reproduce by deleting `dist/` AND `.tsbuildinfo`, then hiding
`node_modules/zod`. Fixed by declaring `zod: catalog:` in core.

## 2026-07-26 - force-update derives its package list, and no longer clobbers catalog:

`scripts/force-update.sh` carried a hardcoded `PACKAGES` list, so a new workspace dependency was
silently never refreshed - `core` never refreshed `@venizia/ignis-filter` and `filter` never refreshed
`@venizia/ignis-inversion`. The list is now derived from `package.json` with `jq`.

Second bug, found by running the scripts rather than reading them: force-update's `sed` overwrote a
`catalog:` value with a registry version, which would have failed `make catalog-check` in the next
workflow step. The loop now skips any dep whose current value is `catalog:`.

## 2026-07-25 - the filter vocabulary becomes @venizia/ignis-filter, a package a browser can use

`TFilter`, `TWhere`, `TFields` and five more types first move into `query-schemas/common/types.ts`,
which has no runtime import, separating them from the zod schemas that stay coupled to
`@hono/zod-openapi`. `operators.ts` now reaches `getError`/`TConstValue` from inversion/helpers'
`/common` instead of the helpers root barrel, which pulled 13 node builtins plus `@hono/zod-openapi`
and `ioredis`. The filter vocabulary then moves into its own package, `@venizia/ignis-filter`, sitting
BESIDE helpers in the chain, with inversion its only dependency. CORRECTION: `mergeFilter` is NOT
extractable - it is a Drizzle-coupled method on the Postgres query dialect - and the vocabulary never
needed helpers at all.

The zod query schemas then follow onto a separate `@venizia/ignis-filter/schemas` entry point. GOTCHA:
the side-effect import `'@hono/zod-openapi'` in core's `query-schemas/index.ts` is load-bearing - it
patches `.openapi()` onto the shared prototype before the builder runs; without it the API reference
loses every description.

## 2026-07-25 - browser purity is measured, and helpers/common is the pure sub-path

Two guards bundle an entry for `target: 'browser'` and assert the resolved graph is clean. Three
gotchas, each silently producing a false pass: `Bun.build` with a browser target does NOT error on
`node:fs`; the spy must sit on `onResolve`, not `onLoad`; and the probe must run with cwd at the
package root, or tsconfig `paths` do not resolve. All three are proven to bite by mutation.

Measured: `inversion` is genuinely browser-clean. The `helpers` root barrel pulls 14 node builtins and
27 packages, so `core`'s pure filter vocabulary was unusable in a browser. New
`@venizia/ignis-helpers/common` sub-path exposes the already-clean surface.

## 2026-07-25 - the framework finally has an error catalog

`normalized.code` was `core.system_error` on almost every framework error: 367 of 402 `getError`
sites carried no code. The client-facing 4xx set - 39 sites - is now catalogued as
`AuthenticationErrors`, `AuthorizationErrors`, `StaticAssetErrors`, `RepositoryErrors` and
`RequestErrors`. Purely additive: every original `message` string is preserved as an override, so the
443-test auth suite passed unchanged. `framework-catalog.test.ts` pins all 24 codes.

## 2026-07-25 - every Error logged via %s is prettified, and auth stops double-logging

`formatLogMessage` now routes an `Error` bound to `%s` through `ErrorPrettier` instead of
`util.inspect`, fixing ~100 raw-dump call sites at once. A BANA `jose` failure was printing the entire
JWT payload - 2900 chars down to 382. Secrets are now dropped rather than masked - an `AxiosError`'s
`config` never reaches the line at all.

Auth logged the same failure twice and still lost the reason: `verify()` logged the raw `jose` error,
then `executeAnyMode` caught it and threw a fresh 401 with NO `cause`. Both now thread `cause`;
`verify()` logs nothing - one line at the boundary carries the whole chain.

## 2026-07-25 - release publishes with bun publish; root deps replaced by a workspace catalog

`package-release.yml` published with `npm publish`, which ships Bun's `catalog:`/`workspace:`
protocols verbatim - the cause of three broken releases. It now uses `bun publish`, which resolves
them while packing. GOTCHA: **bun does not read `NPM_CONFIG_USERCONFIG`**, where `actions/setup-node`
writes its `.npmrc`; only **`NPM_CONFIG_TOKEN`** authenticates bun. The root `package.json` carried
34 `dependencies`, all already declared by a workspace. Shared
versions now live in `workspaces.catalog` (32 entries), referenced as `"catalog:"` by every workspace.
Publishing with npm had already broken `@venizia/ignis@0.1.1-9`, `ignis-helpers@0.1.1-6` and
`ignis-inversion@0.1.1-4`, which shipped `"lodash": "catalog:"` and cannot be installed.

## 2026-07-25 - mail peers were bundler-visible; module loading consolidated into ModuleUtility

`@venizia/ignis/mail` resolved BOTH `nodemailer` and `mailgun.js` at bundle time, forcing a consumer
using one transport to install or externalize the other. `importOptionalModule` /
`requireOptionalModuleSync` / `validateModule` / `validateModuleSync` are GONE, replaced by one class:
`ModuleUtility.load` (async), `ModuleUtility.loadSync` (constructor paths that cannot await), and
`ModuleUtility.assertInstalled` (presence check). BANA used none of the old names.

## 2026-07-24 - error logs render readable through ErrorPrettier, and getError gains a logLevel

`AppErrorMiddleware` now renders the thrown error through the new `ErrorPrettier` class instead of
`%s` on the raw object - a `pg`/`drizzle` failure carrying the full query and a repeating stack had
been flooding the log. The log line now also carries `statusCode`, `normalized.code` and `extra`
(redacted), all previously absent.

`ApplicationError` now carries an optional `logLevel` (`TErrorLogLevel`), and `AppErrorMiddleware`
logs at that level instead of always `error` - default and malformed values still log at `error`.

## 2026-07-21 - g3 domain edges become principal-scoped; authorization docs re-synced

`ScopedCasbinAdapter.queryPrincipalPolicies` gains a second recursive CTE, `domain_closure`, seeding
from the principal's `join_domain` rows and walking up `domain_inherits`. `g3` no longer loads the
whole domain tree for every user - it scales with the domains a principal belongs to, not with tenant
count.

Docs re-sync fixed two prior passes that had drifted: `authorization/api.md` still named the query
`queryPrincipalPolicy` (singular). Also newly documented: `BaseFilteredAdapter`'s `connector` getter
throws a named `[BaseFilteredAdapter]` error instead of a bare `TypeError` when a datasource is cold.

## 2026-07-20 - ScopedCasbinAdapter rebuilt: g4 role manager, GrantBuilder, single-wave extraction

`g4` (resource nesting) is now served by `ResourceRoleManager`, not `addNamedMatchingFunc` -
`addMatchingFunc` sets Casbin's `hasPattern`, disabling `DefaultRoleManager`'s O(1) fast path on every
link check. Not exact parity: the old `maxHierarchyLevel = 10` ceiling no longer applies. The policy
effect was never documented before this: a deny row overrides an allow. A per-instance cache for the
four structural queries is added, default on, 60s TTL. CORRECTION: this cache is REMOVED later the
same day - it was never released. Do not report it against current source.

Naming settles: `common/grant-planner.ts` becomes `GrantUtility`, then `GrantBuilder`, alongside
`AuthorizationPermissionBuilder` and `AuthorizationPolicyBuilder`. Pure move + rename, no behavior
change. Finally, `loadFilteredPolicy` issues four statements in one `Promise.all`, replacing an
earlier two-wave shape - the role closure is now resolved in SQL via a recursive CTE. The permission
join is `LEFT JOIN`, not `INNER JOIN`. The structural cache added earlier the same day is REMOVED, not
deprecated.

## 2026-07-18 - @injectable removed

The decorator wrote `scope`/`tags` metadata the container never read - `getInjectableMetadata` had
zero call sites. Gone with it: `IInjectableMetadata`, `MetadataRegistry.set/getInjectableMetadata`, and
`MetadataKeys.INJECTABLE`. Scope is set on the BINDING, never the class.

## 2026-07-18 - optional PROPERTY injection was silently broken

The container read `metadata.optional` while `@inject` wrote `isOptional`, so `@inject({ key,
isOptional: true })` on a property always threw on a missing binding instead of yielding `undefined`
(constructor parameters were never affected). An index signature on `IPropertyMetadata` made the
misspelled read compile as `any`; it is removed, so this class of typo is now a compile error.
Regression suite: `__tests__/optional-property-injection.test.ts`.

## 2026-07-18 - leftover per-package CLAUDE.md deleted

The six hand-written `CLAUDE.md` files (`packages/{helpers,boot,core,dev-configs,inversion}/`,
`docs/wiki/`) are gone. They were untracked leftovers from before this knowledge bundle existed, still
documenting the pre-2026-07-17 error API and the pre-overhaul logger surface. Only the root
`AGENTS.md` (plus each developer's symlinked tool file) remains.

## 2026-07-18 - logger rework: restructured, HfLogger, pino provider, five levels, single provider

`modules/logger/` moves into IGNIS's house tiering: `common/`, `base/`, `formatting/`, a
self-contained `winston/` folder, and `hf/`. `LoggerFactory.getLogger()` and `BaseHelper.logger` now
return `ILogger`, not the concrete `Logger` class. `Logger` and `ApplicationLogger` stay permanent
aliases of `WinstonLogger`; the only break is typing-only. `HfLogger` is reworked to conform to
`ILogger`; its ring buffer moves to entry-layout v2 - per-entry length bytes replace NUL-padded fixed
slots, so reads never see stale tails from a shorter previous entry. MEASURED: bytes-path 59.4ns,
string-no-args 66ns, vs pino sync 831ns (~14x).

`LoggerFactory.use({ provider })` selects the app's logger with swap-on-use delegation: stable wrapper
handles re-point at registration, so loggers captured at import time follow the provider regardless of
import order. `PinoLogger` lives ONLY at `@venizia/ignis-helpers/pino`. MEASURED: pino ~481-633ns vs
winston ~1250ns per line (~2.5x). The level vocabulary trims to five: `alert`/`http`/`verbose`/`silly`
are REMOVED after usage analysis found ZERO call sites in ignis and BANA.
`APP_ENV_LOGGER_DO_REDACT=false` (literal string only, fail-closed) makes redaction pass-through for
local debugging. winston packages become OPTIONAL peers, moved out of the root barrel to `/winston`.
BREAKING: the scope-less `applicationLogger` export is REMOVED - migrate to
`ApplicationLogger.get(scope)`.

## 2026-07-18 - repository read retry

Opt-in `retry` (typed `until`) on `find`/`findOne`/`findById` across the postgres and search connector
tiers, smoothing over read-after-write replica lag behind a pooler. `retry` lives only on read-verb
option types, so write verbs reject it at compile time.

Post-review hardening: `maxTotalMs` no longer acts as a per-attempt timeout that could abort an
in-flight read - it now only bounds whether a NEW attempt may start. Added `signal?: AbortSignal`
(rejects on abort, unlike exhaustion's "return the last result").

## 2026-07-17 - logger correctness pass

The Winston pipeline formats in two stages now: shared prep on the logger, per-transport assembly - so
console colorizes while file and UDP output carries no ANSI codes, and `json` mode emits valid JSON.
`HfLogger` stays: unused inside this repo and BANA, but external systems consume it - repo-internal
grep is NOT sufficient evidence for deleting a public helpers export.

## 2026-07-17 - secrets peers made bundler-invisible

`node-vault` / `@dotenvx/dotenvx` were reached via literal dynamic imports, which `Bun.build` resolves
at bundle time - every consumer compiling a binary had to list `node-vault` in `external`. The imports
now cross the `importOptionalModule` function boundary, which survives `minify.syntax` constant
folding.

## 2026-07-16 - error layer rebuilt

The error layer moves to `packages/inversion/src/modules/error/` (helpers re-exports it), so a browser
raises the same errors the server does; inversion's second, divergent `ApplicationError` is deleted.
`getError` gains a catalogued form, every error carries `normalized = { code, args, text }`, and the
input type drops its zod catchall - a mistyped field is now a compile error instead of a silent trip
into `extra`. GOTCHA: a catalog `key` must be a literal - routing it through `MessageCode.build()`
silently kills the registry's autocomplete.

## 2026-07-16 - bundle created

Initial IGNIS knowledge bundle, ported from the BANA `.agents/knowledge` reference implementation.

- Tooling at `.agents/knowledge-tools/` (`gen`, `check`, `coverage`, `viz`, `mcp`), zero runtime
  dependencies, all repo-specific configuration isolated in `config.ts`.
- Ten defects in the BANA original fixed during the port rather than carried over, among them YAML
  frontmatter parsing, link extraction inside code fences, and fabricated timestamps.
- Generated reference layer: source map, components, helpers, binding keys, and Makefile targets.
  Knowledge that previously lived only in gitignored `CLAUDE.md` files - never shared with the team -
  now lives here, in the repository.
- `AGENTS.md` is now the single tracked instruction file; `.agents/plugin/setup.ts` links each
  developer's tool file to it, so the repo stays agent-agnostic.

Authoring this bundle from source found several long-standing claims in the old `CLAUDE.md` files to
be false:

- The universal `AbstractRepository -> ReadableRepository -> PersistableRepository ->
  DefaultCRUDRepository` chain does not exist. The hierarchy is per-connector, and
  `DefaultCRUDRepository` survives only as a back-compat alias of `DefaultRelationalRepository`.
- `FieldsVisibilityMixin` and `DefaultFilterMixin` no longer exist - folded into the repository base
  classes.
- The application lifecycle order was wrong: `registerDefaultMiddlewares()` runs early inside
  `initialize()`; `setupMiddlewares()` is a separate hook called by `start()`.
- `build.sh` does not report false success - it has `set -e` and a `tsc --noEmit` gate. The real trap
  is `rebuild.sh` cleaning `dist/` before a build that a broken test can abort.
- The Casbin shared-model TOCTOU race is gone: each request evaluates on its own pooled enforcer.
- `Container.instantiate` no longer crashes on a sparse metadata array; it throws a named error.
- The legacy error duplicates are REMOVED: there is no flat `ApplicationError.messageCode` and `extra`
  no longer mirrors `messageArgs`. BREAKING for clients reading the flat pair (BANA: 188
  `.messageCode` sites + 3 `extra?.messageArgs` OTP sites, not yet migrated).
- The error module now has ONE message shape: a `TErrorDefinition`, the `getError` input and
  `normalized` all speak `{ text, code, args }`. BREAKING against the PUBLISHED inversion 0.1.1-0.
- `fromError({ error })` + `TResponsedError` added to inversion's error module: rebuilds an
  `ApplicationError` from a wire payload so a browser client gets one `catch` for server and local
  failures. Not a duplicate of helpers' `ErrorSchema`/`TErrorResponse`, which needs `@hono/zod-openapi`.
