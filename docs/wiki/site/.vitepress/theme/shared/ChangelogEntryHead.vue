<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The title block of a changelog entry page: a link back to the index, the date and the type chips, the
  title, and the packages with the version. It replaces the entry's own heading (the generic
  "Changelog - date" h1, the title repeated as an h2 and the badge line), which changelog.css hides.
-->
<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';
import { data } from './changelog.data';
import { formatDate } from './changelog-entries';

const { page } = useData();

const entry = computed(() => {
  const slug = page.value.relativePath.replace(/\.md$/, '').split('/').pop();

  return data.find((candidate) => candidate.slug === slug);
});

const meta = computed(() =>
  entry.value === undefined
    ? ''
    : [entry.value.packages.join(', '), entry.value.version]
        .filter((part) => part !== null && part !== '')
        .join(' · '),
);
</script>

<template>
  <div v-if="entry" class="ce-head">
    <a class="ce-back" href="/changelogs/">All changes</a>
    <p class="ce-line">
      <time :datetime="entry.date">{{ formatDate(entry.date) }}</time>
      <span v-for="type in entry.types" :key="type.label" class="cl-chip">{{ type.label }}</span>
    </p>
    <h1 class="ce-title">{{ entry.title }}</h1>
    <p v-if="meta" class="cl-meta">{{ meta }}</p>
  </div>
</template>
