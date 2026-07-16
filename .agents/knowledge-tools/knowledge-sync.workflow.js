// Reusable Workflow script for /knowledge-sync.
// See .agents/plugin/skills/knowledge-sync/SKILL.md for the procedure that drives it.
//
// Invoke via: Workflow({ scriptPath: '.agents/knowledge-tools/knowledge-sync.workflow.js', args: {...} })
//
// args = {
//   repo: '/abs/path/to/ignis',       // repo root - `git rev-parse --show-toplevel`
//   mode: 'delta' | 'full',
//   since: 'YYYY-MM-DD',              // last sync date (display label only), read from log.md
//   gitRange: '<hash>..HEAD',         // commit range since the last sync - what verifiers actually diff
//   deltaTargets: [{
//     key: 'core',                    // short label
//     area: 'packages/core',          // git pathspec(s), space-separated
//     concepts: ['packages/core.md'], // bundle-relative concept files to verify
//     hint: 'what changed (from commit subjects) - verify, do not trust',
//     model: 'opus' | 'sonnet',       // opus for heavy/critical areas, sonnet for small ones
//   }],
// }
export const meta = {
  name: 'knowledge-sync',
  description:
    'Re-sync .agents/knowledge curated concepts against source: delta-verify changed areas (and in full mode spot-audit everything + critics), then apply fixes per concept file',
  phases: [
    { title: 'Verify', detail: 'delta verifiers on changed code areas (+ spot auditors and critics in full mode)' },
    { title: 'Apply', detail: 'one applier per concept file with findings' },
  ],
}

// Some harness paths deliver args as a JSON string - tolerate both.
const input = typeof args === 'string' ? JSON.parse(args) : args || {}
const mode = input.mode === 'full' ? 'full' : 'delta'
const since = input.since
const gitRange = input.gitRange
const deltaTargets = input.deltaTargets || []

// Taken from args rather than hardcoded: this file is committed and every developer's checkout
// (and every worktree) sits at a different path.
const REPO = input.repo
if (!REPO) throw new Error('args.repo (repo root, from `git rev-parse --show-toplevel`) is required')
if (!since) throw new Error('args.since (YYYY-MM-DD, last sync date from log.md) is required')
if (!gitRange) {
  throw new Error('args.gitRange (<last-sync-hash>..HEAD) is required - never use a bare --since date (approxidate gotcha)')
}

const KB = REPO + '/.agents/knowledge'

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings', 'confirmedCount'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['concept', 'kind', 'claim', 'evidence', 'fix'],
        properties: {
          concept: {
            type: 'string',
            description: 'repo-relative path of the knowledge file, e.g. .agents/knowledge/packages/core.md',
          },
          kind: { type: 'string', enum: ['wrong', 'stale', 'missing'] },
          claim: { type: 'string', description: 'the claim that is wrong/stale, or the fact that is missing' },
          evidence: { type: 'string', description: 'source file:line or command output proving it' },
          fix: { type: 'string', description: 'exact corrected fact to write' },
        },
      },
    },
    confirmedCount: { type: 'number', description: 'how many checked claims were confirmed accurate' },
    notes: { type: 'string' },
  },
}

const GAPS_SCHEMA = {
  type: 'object',
  required: ['findings', 'gaps'],
  properties: {
    findings: FINDINGS_SCHEMA.properties.findings,
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'rationale', 'suggestedPath'],
        properties: {
          title: { type: 'string' },
          rationale: { type: 'string' },
          suggestedPath: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const APPLY_SCHEMA = {
  type: 'object',
  required: ['applied', 'skipped', 'summary'],
  properties: {
    applied: { type: 'number' },
    skipped: { type: 'number' },
    summary: { type: 'string' },
  },
}

const COMMON = `You are a knowledge-bundle verifier for the IGNIS framework monorepo at ${REPO} (branch develop).
IGNIS is a TypeScript server framework: LoopBack 4's architecture (decorator DI, repository pattern, boot system, components) on Hono's speed.
The knowledge bundle lives at ${KB} - markdown concepts with YAML frontmatter (OKF format).
Your job: verify the ASSIGNED concept files against the ACTUAL CURRENT SOURCE CODE (ground truth is code, never other docs).
Method: read each assigned concept file fully; for every load-bearing claim (class names, file paths, lifecycle order, binding keys, routes, hierarchies, enum values, flows, seams), open the real source and confirm it. Use Grep/Read/Bash freely.
Rules:
- Ground truth = source code on the current working tree. docs/wiki, AGENTS.md and any CLAUDE.md may themselves be stale - this bundle was created precisely because they were.
- NEVER run a git command that changes state (no commit/stash/checkout/reset/add). Read-only git (log, diff, show) is fine.
- Generated files are OUT OF SCOPE - \`okf gen\` owns them. Do not report findings on: ${KB}/reference/source-map.md, reference/components.md, reference/helpers.md, reference/binding-keys.md, reference/makefile-targets.md, and the \`<!-- okf:generated:packages-table -->\` region inside overview/monorepo-layout.md. (Exception: note it if you spot an extractor BUG.)
- Report only ACTIONABLE findings: wrong (contradicts code), stale (was true, code moved on), missing (a durable, high-value fact an engineer/agent needs that the concept omits). Skip volatile implementation detail (dependency lists, exhaustive config keys, version numbers).
- Each finding MUST cite evidence (source path:line or a command you ran + output).
- Style the bundle follows: hyphen not em-dash, the brand is always written IGNIS, English prose, no version numbers.
- Do NOT edit any files. Return findings via structured output only.`

const DELTA = `\nFocus mode DELTA: first run \`git log ${gitRange} --no-merges --oneline -- <area>\` and \`git diff\` for the interesting commits to learn exactly what changed since the bundle's last sync (${since}), then check whether the assigned concepts reflect the NEW reality. Also verify a sample of older claims while you are in the code.`

// Full-mode spot groups are directory-based so they stay valid as concepts are added.
const spotGroups = [
  {
    key: 'overview-ref',
    dirs: 'overview/ + the CURATED files under reference/ (glossary.md, key-source-files.md, external-links.md) - the other reference/ files are generated, skip them',
  },
  { key: 'architecture', dirs: 'architecture/' },
  { key: 'packages', dirs: 'packages/ - verify each package concept against its real src/ and package.json exports map' },
  { key: 'conventions', dirs: 'conventions/ - every rule must still hold in the code; gotchas.md especially, it decays fastest' },
  {
    key: 'process',
    dirs: 'process/ - verify every command, path, Makefile target and step actually exists and works as written (read Makefile, package.json scripts, scripts/, .githooks/, .github/workflows/)',
  },
  { key: 'examples', dirs: 'examples/ - verify each concept against the real examples/<dir>: what it demos, how it runs, what it exercises' },
]

phase('Verify')
const deltaConceptList = deltaTargets.flatMap((t) => t.concepts).join(', ')
const finderThunks = [
  ...deltaTargets.map((t) => () =>
    agent(
      `${COMMON}${DELTA}\nAssigned code area: ${t.area}\nAssigned concept files (under ${KB}/): ${t.concepts.join(', ')}\nContext hints from the orchestrator (verify, do not trust): ${t.hint}`,
      { label: `delta:${t.key}`, phase: 'Verify', model: t.model || 'sonnet', schema: FINDINGS_SCHEMA },
    ),
  ),
]

if (mode === 'full') {
  finderThunks.push(
    ...spotGroups.map((g) => () =>
      agent(
        `${COMMON}\nFocus mode SPOT-AUDIT: sweep for anything past syncs missed or that drifted. First \`ls\` your assigned directory group and audit EVERY concept file in it${deltaConceptList ? `, EXCEPT these already covered by delta verifiers this run: ${deltaConceptList}` : ''}.\nAssigned group: ${g.dirs}`,
        { label: `spot:${g.key}`, phase: 'Verify', model: 'sonnet', schema: FINDINGS_SCHEMA },
      ),
    ),
    () =>
      agent(
        `${COMMON}\nRole: COMPLETENESS CRITIC. Do not verify individual claims. Instead ask: what does this repo contain that the bundle does NOT cover? Compare ${KB}/index.md + the file tree under ${KB}/ against reality: ls packages/ examples/, scan major changes since the last sync (\`git log ${gitRange} --oneline\`), new components under packages/core/src/components/, new helper modules under packages/helpers/src/modules/, new connectors under packages/core/src/connectors/. Report (a) findings = missing durable facts in EXISTING concepts, (b) gaps = whole missing concepts worth creating (title + rationale + suggestedPath under ${KB}). A gap must be durable, load-bearing knowledge - not volatile detail. Note: every packages/* and examples/* dir MUST have a concept or \`okf coverage\` fails at under 100% structural.`,
        { label: 'critic:completeness', phase: 'Verify', model: 'opus', schema: GAPS_SCHEMA },
      ),
    () =>
      agent(
        `${COMMON}\nRole: USABILITY / CONSISTENCY CRITIC. Do not deep-verify code claims. Audit the bundle AS A DOCUMENT SET: (1) index.md - every concept listed, one-liners accurate, groupings sane; (2) cross-links where a reader needs them; (3) duplication/contradiction between concepts (prefer ONE canonical home + pointers); (4) frontmatter description quality; (5) readability. Report findings against specific files; gaps only for missing navigation aids. Only issues that measurably slow a reader down.`,
        { label: 'critic:usability', phase: 'Verify', model: 'opus', schema: GAPS_SCHEMA },
      ),
  )
}

const finderResults = await parallel(finderThunks)
const ok = finderResults.filter(Boolean)
const allFindings = ok.flatMap((r) => r.findings || [])
const gaps = ok.flatMap((r) => r.gaps || [])
const confirmedTotal = ok.reduce((sum, r) => sum + (r.confirmedCount || 0), 0)
log(`Verify done (${mode}): ${allFindings.length} findings, ${gaps.length} gap proposals, ${confirmedTotal} claims confirmed`)

const GENERATED = /reference\/(source-map|components|helpers|binding-keys|makefile-targets)\.md$/

const byFile = {}
for (const finding of allFindings) {
  let path = finding.concept.trim().replace(/^\/+/, '')
  if (!path.startsWith('.agents/knowledge/')) path = '.agents/knowledge/' + path.replace(/^\.agents\/knowledge\//, '')
  path = path.replace(/ \(.*\)$/, '')
  if (GENERATED.test(path)) continue
  if (path.endsWith('/index.md') || path.endsWith('log.md')) continue
  ;(byFile[path] = byFile[path] || []).push(finding)
}
const files = Object.keys(byFile)
log(`Findings span ${files.length} concept files -> one applier per file`)

phase('Apply')
const applyResults = await parallel(
  files.map((path) => () =>
    agent(
      `You are a careful knowledge curator for the IGNIS monorepo at ${REPO}.
Target file: ${REPO}/${path}
Apply the verified findings below to this ONE file. Curation rules:
- Fix 'wrong' and 'stale' faithfully to the cited evidence - re-check the evidence in source first if it looks off; if a finding does not hold up against the code, SKIP it and say why.
- For 'missing', fold in only durable, high-value facts; keep the concept TIGHT - this is a curated concept, not a dump. Skip volatile detail.
- Preserve the file's existing voice, structure, frontmatter (update the description only if now inaccurate), and links. Do not touch any '<!-- okf:generated:' regions.
- Style: hyphen not em-dash, brand always written IGNIS, English, no version numbers. Never abbreviate identifiers (ProductRepository not ProductRepo).
- Do not edit any other file. NEVER run a state-changing git command.
Findings (JSON):
${JSON.stringify(byFile[path], null, 2)}
Return counts + a one-line summary of what you changed.`,
      { label: `apply:${path.split('/').slice(-2).join('/')}`, phase: 'Apply', model: 'opus', schema: APPLY_SCHEMA },
    ),
  ),
)

// Zip file -> result BEFORE dropping nulls. Filtering first and then indexing by position
// misattributes every summary after a dead applier to the wrong file.
const applySummaries = files
  .map((file, index) => ({ file, result: applyResults[index] }))
  .filter((entry) => entry.result)
  .map((entry) => ({ file: entry.file, ...entry.result }))

const totalApplied = applySummaries.reduce((sum, r) => sum + (r.applied || 0), 0)
const totalSkipped = applySummaries.reduce((sum, r) => sum + (r.skipped || 0), 0)
const died = files.length - applySummaries.length
log(`Apply done: ${totalApplied} edits applied, ${totalSkipped} skipped across ${applySummaries.length} files${died ? ` (${died} applier(s) died - those files were NOT updated)` : ''}`)

return {
  mode,
  since,
  stats: {
    findings: allFindings.length,
    confirmed: confirmedTotal,
    filesTouched: applySummaries.length,
    applied: totalApplied,
    skipped: totalSkipped,
    appliersDied: died,
  },
  findingsByFile: byFile,
  applySummaries,
  gaps,
  notes: ok.map((r) => r.notes).filter(Boolean),
}
