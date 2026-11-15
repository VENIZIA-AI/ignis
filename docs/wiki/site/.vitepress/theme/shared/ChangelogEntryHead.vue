<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The title block of a changelog page: a link back to the index, the date and the type chips, the title, and the
  packages with the version. For a dated entry it replaces the entry's own heading (the generic "Changelog - date"
  h1, the title repeated as an h2 and the badge line), which changelog.css hides. For a version folder
  (changelogs/<X.Y.Z>/log.md, which has no heading of its own) it shows the release date, or "In progress", and - when
  the page has a Breaking section and the wiki names its migrate guide in `themeConfig.migrateGuide` - a link to it.
  A version page reads only its own frontmatter and the list of versions that have a Breaking section
  (changelog-breaking.data.ts, version numbers only): the loader data of the index, which carries the pages' HTML, is
  not imported here, so it does not reach the script every page loads.
-->
<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';
import { data as breaking } from './changelog-breaking.data';
import { data } from './changelog.data';
import { formatDate, releasedOf } from './changelog-entries';

const { page, theme } = useData();

/** A wiki serves changelogs/<X.Y.Z>/log.md at changelogs/<X.Y.Z> (a rewrite): the page knows itself by either path. */
const isVersionPage = computed(() =>
  /^changelogs\/\d+\.\d+\.\d+(?:\/log)?\.md$/.test(page.value.relativePath),
);
const frontmatter = computed(() => page.value.frontmatter);
const released = computed(() => releasedOf(frontmatter.value.released));
const packages = computed<string[]>(() =>
  Array.isArray(frontmatter.value.packages)
    ? frontmatter.value.packages.filter((entry): entry is string => typeof entry === 'string')
    : [],
);
/** The version this page is, from its path (changelogs/<X.Y.Z>.md or changelogs/<X.Y.Z>/log.md). */
const version = computed(() => /^changelogs\/(\d+\.\d+\.\d+)/.exec(page.value.relativePath)?.[1]);
const hasBreaking = computed(() => version.value !== undefined && breaking.includes(version.value));

/** The last segment of a dated entry's path. */
const slug = computed(() => page.value.relativePath.replace(/\.md$/, '').split('/').pop());
const entry = computed(() => data.find((candidate) => candidate.slug === slug.value));

const meta = computed(() =>
  entry.value === undefined
    ? ''
    : [entry.value.packages.join(', '), entry.value.version]
        .filter((part) => part !== null && part !== '')
        .join(' · '),
);

const migrateGuide = computed<string | undefined>(() =>
  typeof theme.value.migrateGuide === 'string' ? theme.value.migrateGuide : undefined,
);
</script>

<template>
  <div v-if="isVersionPage" class="ce-head ce-head--version">
    <a class="ce-back" href="/changelogs/">All changes</a>
    <p class="ce-line">
      <time v-if="released" :datetime="released">{{ formatDate(released) }}</time>
      <span v-else-if="released === undefined" class="cl-chip">In progress</span>
    </p>
    <h1 class="ce-title">{{ frontmatter.title }}</h1>
    <p v-if="packages.length" class="cl-meta">{{ packages.join(', ') }}</p>
    <p v-if="hasBreaking && migrateGuide" class="cl-meta">
      Upgrading across breaking changes: <a :href="migrateGuide">migrate between releases</a>
    </p>
  </div>
  <div v-else-if="entry" class="ce-head">
    <a class="ce-back" href="/changelogs/">All changes</a>
    <p class="ce-line">
      <time :datetime="entry.date">{{ formatDate(entry.date) }}</time>
      <span v-for="type in entry.types" :key="type.label" class="cl-chip">{{ type.label }}</span>
    </p>
    <h1 class="ce-title">{{ entry.title }}</h1>
    <p v-if="meta" class="cl-meta">{{ meta }}</p>
  </div>
</template>
