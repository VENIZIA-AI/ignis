<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The changelog index: the newest entry set apart as "Latest", filter tabs with the count, and the rest
  of the entries grouped by year. Every entry is in the HTML (the tabs only hide rows), so the page reads
  without script. The entries come from the build-time loader (changelog.data.ts); a wiki mounts this
  from changelogs/index.md.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { data } from './changelog.data';
import { FILTERS, formatDate, matchesFilter, type TChangelogEntry } from './changelog-entries';

withDefaults(defineProps<{ lede?: string; feed?: string }>(), {
  lede: 'What changed, who is affected and what to do about it.',
  feed: '/changelog.xml',
});

const entries: TChangelogEntry[] = data;
const latest = entries[0];
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

const shown = computed(() => years.value.reduce((sum, [, list]) => sum + list.length, 0));

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

    <a v-if="latest" class="cl-latest" :href="latest.url">
      <span class="cl-latest-line">
        <span class="cl-chip cl-chip--latest">Latest</span>
        <time :datetime="latest.date">{{ formatDate(latest.date) }}</time>
        <span v-for="type in latest.types" :key="type.label" class="cl-type">{{ type.label }}</span>
      </span>
      <span class="cl-latest-title">{{ latest.title }}</span>
      <span class="cl-latest-summary">{{ latest.summary }}</span>
      <span v-if="meta(latest)" class="cl-meta">{{ meta(latest) }}</span>
      <span class="cl-arrow" aria-hidden="true">→</span>
    </a>

    <div class="cl-bar">
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
      <span class="cl-count">{{ shown }} {{ shown === 1 ? 'entry' : 'entries' }}</span>
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

    <p v-if="shown === 0" class="cl-empty">No entry matches this filter.</p>
  </div>
</template>
