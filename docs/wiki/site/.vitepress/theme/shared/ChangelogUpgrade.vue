<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The upgrade guide of a version (`/changelogs/<X.Y.Z>/upgrade`): the four steps of an upgrade with a command each, then one
  card per migration block, the ones a codemod covers first. A card names the symbols that make a reader affected, shows the
  code before and after side by side, numbers the steps, warns about stored data and folds the way back. Each card has an
  anchor (`#<block-id>`), which `vulcan migrate plan` prints, and a Done box that the reader's browser remembers. The blocks
  are the params of the page (the dynamic route's paths), read at build time; SiteLayout mounts this as an async component.
-->
<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, onMounted, ref } from 'vue';
import ChangelogPath from './ChangelogPath.vue';
import CopyCommand from './CopyCommand.vue';
import { useChangelogVersion, usePackageFilter } from './useChangelogPage';
import { browserStorage, readDone, writeDone } from './changelog-done';
import type { TGuideBlock } from './changelog-guides';
import { renderInline, shortPackage } from './changelog-items';

/** Above this many symbols a card lists the first ones and counts the rest. */
const SYMBOLS = 8;

const { params } = useData();
const { version, entry, items, guide, previous, prerelease, dateLine, project, sourceUrl } =
  useChangelogVersion();

const blocks = computed<TGuideBlock[]>(() => params.value?.blocks ?? []);
const covered = computed(() => blocks.value.filter((block) => block.codemod !== undefined));
const manual = computed(() => blocks.value.filter((block) => block.codemod === undefined));
const codemods = computed(() => guide.value?.codemods ?? []);
const groups = computed(() => [
  { id: 'codemods', title: 'Covered by a codemod', blocks: covered.value },
  { id: 'manual', title: 'Edit by hand', blocks: manual.value },
]);

const itemOf = (id: string) => items.value.find((item) => item.id === id);
/** The title of the item a block belongs to; the id, as text, when the log has none (an id is never markup). */
const titleOf = (id: string): string => itemOf(id)?.titleHtml ?? renderInline({ text: id });
const packagesOf = (id: string): string[] =>
  (itemOf(id)?.packages ?? []).map((name) => shortPackage({ name }));

const filter = usePackageFilter({ lists: () => blocks.value.map((block) => packagesOf(block.id)) });
const hideDone = ref(false);
const done = ref<Set<string>>(new Set());
const doneCount = computed(() => blocks.value.filter((block) => done.value.has(block.id)).length);

const isShown = (block: TGuideBlock): boolean =>
  !(hideDone.value && done.value.has(block.id)) && filter.matches(packagesOf(block.id));

onMounted(() => {
  done.value = readDone({
    storage: browserStorage(),
    project: project.value,
    version: version.value,
  });
});

const setDone = (id: string, checked: boolean): void => {
  const next = new Set(done.value);

  if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }

  done.value = next;
  writeDone({
    storage: browserStorage(),
    project: project.value,
    version: version.value,
    ids: next,
  });
};

const packageName = computed(() => entry.value?.packages[0] ?? '');
const from = computed(() => previous.value ?? '<your version>');
// A stable release is pinned to its exact version. A line in progress has no exact version yet: its prereleases are on `next`.
const target = computed(() => (prerelease.value ? 'next' : version.value));
const install = computed(
  () =>
    `bun add --exact ${(entry.value?.packages ?? []).map((name) => `${name}@${target.value}`).join(' ')}`,
);
const planCommand = computed(
  () =>
    `bun run vulcan migrate plan --package ${packageName.value} --from ${from.value} --to ${version.value}`,
);
const applyCommand = computed(
  () =>
    `bun run vulcan migrate apply --package ${packageName.value} --from ${from.value} --to ${version.value} --app .`,
);

const source = computed(() => sourceUrl(`changelogs/${version.value}/migration.yaml`));
const hasDowngrade = (block: TGuideBlock): boolean =>
  block.downgrade.steps.length > 0 ||
  block.downgrade.beforeHtml !== undefined ||
  block.downgrade.afterHtml !== undefined ||
  block.beforeHtml !== undefined;
</script>

<template>
  <div v-if="entry" class="cx-detail">
    <aside class="cx-rail cx-rail--left" aria-label="Show in this guide">
      <div>
        <h2 class="cx-label">Show</h2>
        <nav>
          <a href="#path">The path</a>
          <a v-if="covered.length" href="#codemods"
            >Covered by a codemod<span>{{ covered.length }}</span></a
          >
          <a v-if="manual.length" href="#manual"
            >Edit by hand<span>{{ manual.length }}</span></a
          >
          <a v-if="source" :href="source">Source file</a>
        </nav>
      </div>
      <div v-if="filter.packages.value.length > 1">
        <h2 class="cx-label">Packages</h2>
        <div class="cx-pf">
          <button
            v-for="pkg in filter.packages.value"
            :key="pkg.name"
            type="button"
            :aria-pressed="filter.selected.value.has(pkg.name)"
            :style="{ '--w': `${pkg.width}%` }"
            @click="filter.toggle(pkg.name)"
          >
            {{ pkg.name }}<span>{{ pkg.count }}</span>
          </button>
        </div>
      </div>
      <label class="cx-done"
        ><input v-model="hideDone" type="checkbox" /> Hide the steps I have done</label
      >
    </aside>

    <div class="cx-main">
      <div class="cx-head">
        <div class="cx-crumb">
          <a href="/changelogs/">Changelog</a> /
          <a :href="`/changelogs/${version}`">{{ version }}</a> / Upgrade guide
        </div>
        <div class="cx-title">
          <h1>Upgrade to {{ version }}</h1>
          <span :class="['cx-chip', prerelease ? 'cx-chip--pre' : 'cx-chip--stable']">{{
            prerelease ? 'Prerelease' : 'Stable'
          }}</span>
          <span class="cx-chip">{{ dateLine }}</span>
        </div>
        <p v-if="entry.summary" class="cx-sum" v-html="renderInline({ text: entry.summary })"></p>
        <nav class="cx-tabs" :aria-label="version">
          <a :href="`/changelogs/${version}`"
            >Changes <span>{{ items.length }}</span></a
          >
          <a :href="`/changelogs/${version}/upgrade`" aria-current="page"
            >Upgrade guide <span>{{ blocks.length }}</span></a
          >
        </nav>

        <section id="path" class="cx-lh">
          <h2>How to upgrade from {{ from }} to {{ version }}</h2>
          <ol class="cx-flow">
            <li>
              <div>
                <h3>Install the exact versions</h3>
                <p>
                  Every package of the release moves together; pin them without a range<template
                    v-if="prerelease"
                  >
                    (this release is not stable yet, so the tag is <code>next</code>)</template
                  >.
                </p>
                <CopyCommand :command="install" />
              </div>
            </li>
            <li>
              <div>
                <h3>See what your code touches</h3>
                <p>
                  The plan lists the files and lines of your app that use a changed name, with the
                  step id of each: open the step below by that id.
                </p>
                <CopyCommand :command="planCommand" />
              </div>
            </li>
            <li>
              <div>
                <h3>Run the codemods</h3>
                <p v-if="codemods.length === 0">
                  No codemod covers this release: every step below is an edit by hand.
                </p>
                <template v-else>
                  <p>
                    {{ covered.length }} step{{ covered.length === 1 ? '' : 's' }} can be rewritten
                    for you:
                    <template v-for="(name, index) in codemods" :key="name"
                      ><code>{{ name }}</code
                      ><template v-if="index < codemods.length - 1">, </template></template
                    >. The rest is by hand.
                  </p>
                  <CopyCommand :command="applyCommand" />
                </template>
              </div>
            </li>
            <li>
              <div>
                <h3>Type-check, then fix what is left</h3>
                <p>Every remaining error maps to one step below.</p>
                <CopyCommand command="bun check" />
              </div>
            </li>
          </ol>
        </section>
      </div>

      <div class="cx-body">
        <template v-for="group in groups" :key="group.id">
          <div v-if="group.blocks.length" :id="group.id" class="cx-gh">
            <h2>{{ group.title }}</h2>
            <span>{{ group.blocks.length }}</span>
          </div>
          <template v-for="block in group.blocks" :key="block.id">
            <article
              v-show="isShown(block)"
              :id="block.id"
              :class="['cx-bl', { 'is-done': done.has(block.id) }]"
            >
              <div class="cx-bl-head">
                <span></span>
                <div>
                  <h3 v-html="titleOf(block.id)"></h3>
                  <div class="cx-bl-meta">
                    <code class="cx-id">{{ block.id }}</code>
                    <span v-for="name in packagesOf(block.id)" :key="name" class="cx-pkg">{{
                      name
                    }}</span>
                    <span v-if="block.codemod" class="cx-link cx-link--codemod"
                      >codemod: {{ block.codemod }}</span
                    >
                    <a class="cx-link" :href="`/changelogs/${version}#${block.id}`"
                      >Back to the item</a
                    >
                  </div>
                </div>
                <label class="cx-done"
                  ><input
                    type="checkbox"
                    :checked="done.has(block.id)"
                    @change="setDone(block.id, !done.has(block.id))"
                  />
                  Done</label
                >
              </div>
              <div v-if="block.symbols.length" class="cx-affected">
                <b>You are affected if your code uses:</b>
                <code v-for="symbol in block.symbols.slice(0, SYMBOLS)" :key="symbol">{{
                  symbol
                }}</code>
                <code v-if="block.symbols.length > SYMBOLS"
                  >+{{ block.symbols.length - SYMBOLS }} more</code
                >
              </div>
              <div
                v-if="block.beforeHtml || block.afterHtml"
                :class="['cx-ba', { 'cx-ba--one': !(block.beforeHtml && block.afterHtml) }]"
              >
                <div v-if="block.beforeHtml" class="cx-win cx-win--before">
                  <header>
                    Before <b>{{ previous ?? 'previous' }}</b>
                  </header>
                  <pre v-html="block.beforeHtml"></pre>
                </div>
                <div v-if="block.afterHtml" class="cx-win cx-win--after">
                  <header>
                    After <b>{{ version }}</b>
                  </header>
                  <pre v-html="block.afterHtml"></pre>
                </div>
              </div>
              <template v-if="block.steps.length">
                <h4 class="cx-sh">What to do</h4>
                <ol class="cx-steps">
                  <li
                    v-for="(step, index) in block.steps"
                    :key="index"
                    class="cx-step"
                    v-html="renderInline({ text: step })"
                  ></li>
                </ol>
              </template>
              <p v-if="block.codemod" class="cx-codemod">
                Covered by the codemod <code>{{ block.codemod }}</code
                >: run it in <a href="#path">step 3</a>.
              </p>
              <div v-if="block.dataHtml" class="cx-data">
                <b>Check your data</b>
                <div v-html="block.dataHtml"></div>
              </div>
              <details v-if="hasDowngrade(block)" class="cx-back">
                <summary>Going back to the previous version</summary>
                <ol v-if="block.downgrade.steps.length">
                  <li
                    v-for="(step, index) in block.downgrade.steps"
                    :key="index"
                    v-html="renderInline({ text: step })"
                  ></li>
                </ol>
                <div
                  v-if="block.downgrade.beforeHtml || block.downgrade.afterHtml"
                  :class="[
                    'cx-ba',
                    { 'cx-ba--one': !(block.downgrade.beforeHtml && block.downgrade.afterHtml) },
                  ]"
                >
                  <div v-if="block.downgrade.beforeHtml" class="cx-win cx-win--before">
                    <header>Before</header>
                    <pre v-html="block.downgrade.beforeHtml"></pre>
                  </div>
                  <div v-if="block.downgrade.afterHtml" class="cx-win cx-win--after">
                    <header>After</header>
                    <pre v-html="block.downgrade.afterHtml"></pre>
                  </div>
                </div>
                <p
                  v-if="
                    !block.downgrade.steps.length &&
                    !block.downgrade.beforeHtml &&
                    !block.downgrade.afterHtml
                  "
                >
                  Restore the code from the Before example above.
                </p>
              </details>
            </article>
          </template>
        </template>
        <p v-if="!blocks.length" class="cx-empty">This release has no migration block.</p>
        <p v-if="source" id="source" class="cx-sourcelink">
          Raw data: <a :href="source">view source file (migration.yaml)</a>
        </p>
      </div>
    </div>

    <ChangelogPath
      :version="version"
      :packages="entry.packages.length"
      :guide="guide"
      :guide-url="`/changelogs/${version}/upgrade`"
      :done="doneCount"
    />
  </div>
</template>
