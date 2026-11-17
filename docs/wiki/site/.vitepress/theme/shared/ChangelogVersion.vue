<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The details page of a version (`/changelogs/<X.Y.Z>`): the summary and the highlights, then every item as a card that opens
  to its full text, under its section. A left rail lists the sections, searches the items and filters them by package; a
  sticky right rail shows the upgrade path. The items come from the log at build time (changelog-items.data.ts), so every card
  is in the HTML and the page reads without script; the search and the filter only hide cards. SiteLayout mounts this as an
  async component, so the items stay out of the script every page loads.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ChangelogCounts from './ChangelogCounts.vue';
import ChangelogItem from './ChangelogItem.vue';
import ChangelogPath from './ChangelogPath.vue';
import PrereleaseLatest from './PrereleaseLatest.vue';
import PrereleaseTable from './PrereleaseTable.vue';
import { useChangelogVersion, usePackageFilter } from './useChangelogPage';
import {
  SECTION_NAMES,
  renderInline,
  shortPackage,
  type TSectionName,
  type TVersionItem,
} from './changelog-items';

/** Above this many Breaking items the section is grouped by package. */
const GROUP_FROM = 12;

const { version, entry, items, guide, guideUrl, prerelease, dateLine, latest, prereleases } =
  useChangelogVersion();
const shortNames = (item: TVersionItem): string[] =>
  item.packages.map((name) => shortPackage({ name }));
const filter = usePackageFilter({ lists: () => items.value.map(shortNames) });

const query = ref('');

const haystack = computed(
  () =>
    new Map(
      items.value.map((item) => [
        item.id,
        `${item.title} ${item.id} ${item.html.replace(/<[^>]+>/g, ' ')}`.toLowerCase(),
      ]),
    ),
);

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return items.value.filter(
    (item) =>
      (needle === '' || (haystack.value.get(item.id) ?? '').includes(needle)) &&
      filter.matches(shortNames(item)),
  );
});

type TSection = { name: TSectionName; items: TVersionItem[]; groups: [string, TVersionItem[]][] };

const sections = computed<TSection[]>(() =>
  SECTION_NAMES.flatMap((name): TSection[] => {
    const own = visible.value.filter((item) => item.section === name);

    if (own.length === 0) {
      return [];
    }

    const grouped = name === 'Breaking' && own.length > GROUP_FROM;
    const groups = new Map<string, TVersionItem[]>();

    for (const item of own) {
      const key = grouped ? shortPackage({ name: item.packages[0] ?? 'other' }) : '';

      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    return [{ name, items: own, groups: grouped ? [...groups] : [] }];
  }),
);

const summaryHtml = computed(() => renderInline({ text: entry.value?.summary ?? '' }));
const overviewWords = computed(
  () => (entry.value?.overview ?? '').split(/\s+/).filter(Boolean).length,
);
const showOverview = computed(
  () =>
    entry.value !== undefined &&
    entry.value.overview !== '' &&
    entry.value.overview !== entry.value.summary,
);

const isCovered = (id: string): boolean => guide.value?.covered.includes(id) ?? false;
const hasStep = (id: string): boolean => guide.value?.ids.includes(id) ?? false;

/** A link to an item (`#<id>`) opens its card. */
const openHash = (): void => {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const card = id === '' ? null : document.getElementById(id);

  if (card instanceof HTMLDetailsElement) {
    card.open = true;
  }
};

onMounted(() => {
  openHash();
  window.addEventListener('hashchange', openHash);
});
onBeforeUnmount(() => window.removeEventListener('hashchange', openHash));
</script>

<template>
  <div v-if="entry" class="cx-detail">
    <aside class="cx-rail cx-rail--left" aria-label="Find in this release">
      <div v-if="entry.counts.length">
        <h2 class="cx-label">On this page</h2>
        <nav>
          <a v-for="[name, count] in entry.counts" :key="name" :href="`#${name.toLowerCase()}`"
            >{{ name }}<span>{{ count }}</span></a
          >
        </nav>
      </div>
      <input
        v-model="query"
        class="cx-search"
        type="search"
        :placeholder="`Search ${items.length} items`"
        aria-label="Search the items"
      />
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
    </aside>

    <div class="cx-main">
      <div class="cx-head">
        <div class="cx-crumb"><a href="/changelogs/">Changelog</a> / {{ version }}</div>
        <div class="cx-title">
          <h1>{{ version }}</h1>
          <span :class="['cx-chip', prerelease ? 'cx-chip--pre' : 'cx-chip--stable']">{{
            prerelease ? 'Prerelease' : 'Stable'
          }}</span>
          <span class="cx-chip">{{ dateLine }}</span>
        </div>
        <PrereleaseLatest
          v-if="latest"
          :package-name="latest.packageName"
          :version="latest.prerelease.version"
          :date="latest.prerelease.date"
        />
        <p v-if="entry.summary" class="cx-sum" v-html="summaryHtml"></p>
        <div class="cx-overview">
          <div v-if="entry.highlights.length">
            <h2 class="cx-label">In this release</h2>
            <ul class="cx-hl">
              <li
                v-for="(line, index) in entry.highlights"
                :key="index"
                v-html="renderInline({ text: line })"
              ></li>
            </ul>
          </div>
          <ChangelogCounts :counts="entry.counts" />
        </div>
        <details v-if="showOverview" class="cx-readmore">
          <summary>Read the full overview ({{ overviewWords }} words)</summary>
          <p v-html="renderInline({ text: entry.overview })"></p>
        </details>

        <PrereleaseTable v-if="prereleases.length > 1" :rows="prereleases" />

        <nav class="cx-tabs" :aria-label="version">
          <a :href="`/changelogs/${version}`" aria-current="page"
            >Changes <span>{{ items.length }}</span></a
          >
          <a v-if="guide" :href="guideUrl"
            >Upgrade guide <span>{{ guide.ids.length }}</span></a
          >
        </nav>
      </div>

      <div class="cx-body">
        <section
          v-for="section in sections"
          :key="section.name"
          :class="['cx-sec', `t-${section.name.toLowerCase()}`]"
        >
          <h2 :id="section.name.toLowerCase()">
            {{ section.name }} <span>{{ section.items.length }}</span>
          </h2>
          <template v-if="section.groups.length">
            <div v-for="[group, list] in section.groups" :key="group" class="cx-grp">
              <h3>
                <span>{{ group }}</span
                ><span>{{ list.length }}</span>
              </h3>
              <ChangelogItem
                v-for="item in list"
                :key="item.id"
                :item="item"
                :step-url="hasStep(item.id) ? guideUrl : undefined"
                :covered="isCovered(item.id)"
              />
            </div>
          </template>
          <template v-else>
            <ChangelogItem
              v-for="item in section.items"
              :key="item.id"
              :item="item"
              :step-url="hasStep(item.id) ? guideUrl : undefined"
              :covered="isCovered(item.id)"
            />
          </template>
        </section>
        <p v-if="items.length && sections.length === 0" class="cx-empty">
          No item matches the search and the filter.
        </p>
        <p v-if="items.length === 0" class="cx-empty">
          This version's log has no itemised changes.
        </p>
      </div>
    </div>

    <ChangelogPath
      :version="version"
      :packages="entry.packages.length"
      :guide="guide"
      :guide-url="guideUrl"
    />
  </div>
</template>
