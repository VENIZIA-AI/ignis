<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The changelog index. A wiki that keeps a folder per version shows the latest released version in full, then the
  version in progress, then the older versions as a list of titles, then the dated entries as its history. A wiki
  with no version folder shows the newest dated entry set apart as "Latest", filter tabs with the count, and the rest
  of the entries grouped by year. Every entry is in the HTML (the tabs only hide rows), so the page reads
  without script. The entries come from the build-time loaders (changelog.data.ts, changelog-versions.data.ts). A wiki
  mounts this from changelogs/index.md with a local import in a `<script setup>`, never as a global component: the
  version data carries the HTML of two pages, and a global registration would put it into the script every page loads
  (the build check fails when it is there).
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { data } from './changelog.data';
import { data as versions } from './changelog-versions.data';
import {
  FILTERS,
  formatDate,
  matchesFilter,
  shownVersions,
  type TChangelogEntry,
} from './changelog-entries';

withDefaults(defineProps<{ lede?: string; feed?: string }>(), {
  lede: 'What changed, who is affected and what to do about it.',
  feed: '/changelog.xml',
});

const entries: TChangelogEntry[] = data;
const shown = shownVersions(versions);
const hasVersions = versions.length > 0;
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

    <section v-if="shown.latest" class="cl-version" aria-label="Latest release">
      <p class="cl-version-line">
        <span class="cl-chip cl-chip--latest">Latest</span>
        <time v-if="shown.latest.released" :datetime="shown.latest.released">{{
          formatDate(shown.latest.released)
        }}</time>
      </p>
      <h2 class="cl-version-title">
        <a :href="shown.latest.url">{{ shown.latest.title }}</a>
      </h2>
      <p v-if="shown.latest.packages.length" class="cl-meta">
        {{ shown.latest.packages.join(', ') }}
      </p>
      <div v-if="shown.latest.html" class="vp-doc cl-version-body" v-html="shown.latest.html"></div>
    </section>

    <section v-if="shown.inProgress" class="cl-version" aria-label="In progress">
      <p class="cl-version-line">
        <span class="cl-chip">In progress</span>
        <span>Not released yet</span>
      </p>
      <h2 class="cl-version-title">
        <a :href="shown.inProgress.url">{{ shown.inProgress.title }}</a>
      </h2>
      <div
        v-if="shown.inProgress.html"
        class="vp-doc cl-version-body"
        v-html="shown.inProgress.html"
      ></div>
    </section>

    <section v-if="shown.older.length" class="cl-older" aria-label="Earlier releases">
      <h2 class="cl-year-label">Earlier releases</h2>
      <ol class="cl-list">
        <li v-for="version in shown.older" :key="version.version" class="cl-item">
          <time v-if="version.released" class="cl-date" :datetime="version.released">{{
            formatDate(version.released)
          }}</time>
          <div class="cl-body">
            <a class="cl-title" :href="version.url">{{ version.title }}</a>
            <p v-if="version.summary" class="cl-summary">{{ version.summary }}</p>
          </div>
        </li>
      </ol>
      <p v-if="entries.length" class="cl-history-link">
        <a href="#history">Earlier changes, entry by entry</a>
      </p>
    </section>

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

    <h2 v-if="hasVersions && entries.length" id="history" class="cl-history-title">History</h2>

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
