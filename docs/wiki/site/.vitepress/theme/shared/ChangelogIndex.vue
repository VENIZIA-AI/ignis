<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The changelog index. A wiki that keeps a folder per version shows one box per version, newest first: the version, whether
  it is stable or a prerelease, its summary and highlights, the make-up of the release, and links to its details and to its
  upgrade guide. The dated entries follow as the history, with filter tabs and the count, grouped by year. A wiki with no
  version folder shows the newest dated entry set apart as "Latest" above the same history. Every entry is in the HTML (the
  tabs only hide rows), so the page reads without script. The entries come from the build-time loaders (changelog.data.ts,
  changelog-versions.data.ts, changelog-guide-counts.data.ts). A wiki mounts this from changelogs/index.md with a local import
  in a `<script setup>`, never as a global component: the build check fails when it is in the script every page loads.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { data } from './changelog.data';
import { data as guideCounts } from './changelog-guide-counts.data';
import { data as versions } from './changelog-versions.data';
import ChangelogCounts from './ChangelogCounts.vue';
import {
  FILTERS,
  formatDate,
  matchesFilter,
  type TChangelogEntry,
  type TVersionEntry,
} from './changelog-entries';
import { renderInline } from './changelog-items';

withDefaults(defineProps<{ lede?: string; feed?: string; packageName?: string }>(), {
  lede: 'What changed, who is affected and what to do about it.',
  feed: '/changelog.xml',
  packageName: undefined,
});

const entries: TChangelogEntry[] = data;
const hasVersions = versions.length > 0;

const guideOf = (version: TVersionEntry) =>
  guideCounts.find((candidate) => candidate.version === version.version);

const dateLine = (version: TVersionEntry): string =>
  version.released === null
    ? 'In progress, on the next tag'
    : `Released ${formatDate(version.released)}`;
// With version folders the dated entries are the history below them; without, the newest one is the Latest card.
const latest = hasVersions ? undefined : entries[0];
const filter = ref('all');

/** Entries newest first, grouped by year, after the filter. */
const years = computed(() => {
  const groups = new Map<string, TChangelogEntry[]>();

  for (const entry of entries) {
    if (matchesFilter(entry, filter.value)) {
      const year = entry.date.slice(0, 4);

      groups.set(year, [...(groups.get(year) ?? []), entry]);
    }
  }

  return [...groups];
});

const count = computed(() => years.value.reduce((sum, [, list]) => sum + list.length, 0));

const meta = (entry: TChangelogEntry): string =>
  [entry.packages.join(', '), entry.version]
    .filter((part) => part !== null && part !== '')
    .join(' · ');
</script>

<template>
  <div class="cl">
    <header class="cl-head">
      <div>
        <h1>Changelog</h1>
        <p class="cl-lede">{{ lede }}</p>
      </div>
      <a class="cl-rss" :href="feed">RSS</a>
    </header>

    <p v-if="hasVersions && packageName" class="cx-tip">
      <span class="cx-label">Upgrading across several versions, from the project root</span>
      <code>bun node_modules/.bin/vulcan migrate plan --package {{ packageName }} --to latest</code>
    </p>

    <div v-if="hasVersions" class="cx-list">
      <article
        v-for="(version, index) in versions"
        :key="version.version"
        :class="['cx-vcard', { 'cx-vcard--latest': index === 0 }]"
      >
        <a class="cx-stretch" :href="version.url" :aria-label="`${version.version}: details`"></a>
        <div class="cx-v">
          <b>{{ version.version }}</b>
          <span
            :class="['cx-chip', version.released === null ? 'cx-chip--pre' : 'cx-chip--stable']"
            >{{ version.released === null ? 'Prerelease' : 'Stable' }}</span
          >
          <small>{{ dateLine(version) }}</small>
        </div>
        <div>
          <p
            v-if="version.summary"
            class="cx-sum"
            v-html="renderInline({ text: version.summary })"
          ></p>
          <ul v-if="version.highlights.length" class="cx-hl">
            <li
              v-for="(line, at) in version.highlights"
              :key="at"
              v-html="renderInline({ text: line })"
            ></li>
          </ul>
        </div>
        <div class="cx-aside">
          <ChangelogCounts :counts="version.counts" />
          <div class="cx-actions">
            <a
              v-if="guideOf(version)"
              class="cx-btn cx-btn--primary cx-btn--sm"
              :href="`${version.url}/upgrade`"
              >Upgrade guide</a
            >
            <a class="cx-btn cx-btn--sm" :href="version.url">Details</a>
          </div>
          <small v-if="guideOf(version)" class="cx-label">
            {{ guideOf(version)?.ids.length }} step{{ guideOf(version)?.ids.length === 1 ? '' : 's'
            }}<template v-if="guideOf(version)?.codemods.length"
              >, {{ guideOf(version)?.codemods.length }} codemod{{
                guideOf(version)?.codemods.length === 1 ? '' : 's'
              }}</template
            >
          </small>
        </div>
      </article>
    </div>

    <a v-if="latest" class="cl-latest" :href="latest.url">
      <span class="cl-latest-line">
        <span class="cl-chip cl-chip--latest">Latest</span>
        <time :datetime="latest.date">{{ formatDate(latest.date) }}</time>
        <span v-for="type in latest.types" :key="type.label" class="cl-type">{{ type.label }}</span>
      </span>
      <span class="cl-latest-title">{{ latest.title }}</span>
      <span class="cl-latest-summary">{{ latest.summary }}</span>
      <span v-if="meta(latest)" class="cl-meta">{{ meta(latest) }}</span>
      <span class="cl-arrow" aria-hidden="true"></span>
    </a>

    <h2 v-if="hasVersions && entries.length" id="history" class="cl-history-title">
      Earlier entries
    </h2>

    <div class="cl-bar" v-if="entries.length">
      <div class="cl-tabs" role="group" aria-label="Filter the changelog">
        <button
          v-for="tab in FILTERS"
          :key="tab.id"
          type="button"
          class="cl-tab"
          :aria-pressed="filter === tab.id"
          @click="filter = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <span class="cl-count">{{ count }} {{ count === 1 ? 'entry' : 'entries' }}</span>
    </div>

    <section v-for="[year, list] in years" :key="year" class="cl-year">
      <h2 class="cl-year-label">{{ year }}</h2>
      <ol class="cl-list">
        <li v-for="entry in list" :key="entry.slug" class="cl-item">
          <time class="cl-date" :datetime="entry.date">{{ formatDate(entry.date) }}</time>
          <div class="cl-body">
            <a class="cl-title" :href="entry.url">{{ entry.title }}</a>
            <span v-for="type in entry.types" :key="type.label" class="cl-chip">{{
              type.label
            }}</span>
            <p class="cl-summary">{{ entry.summary }}</p>
            <p v-if="meta(entry)" class="cl-meta">{{ meta(entry) }}</p>
          </div>
        </li>
      </ol>
    </section>

    <p v-if="entries.length && count === 0" class="cl-empty">No entry matches this filter.</p>
  </div>
</template>
