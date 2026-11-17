<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The newest prerelease of a version still in progress: its number, the date of its tag and the line that installs exactly it,
  so a reader who wants the prerelease knows which version to take. It is in the page as text; the copy button needs script.
  `part` shows the line with the number, the command, or both (the version cards put them in two columns).
-->
<script setup lang="ts">
import { computed } from 'vue';
import CopyCommand from './CopyCommand.vue';
import { formatDate } from './changelog-entries';

const props = withDefaults(
  defineProps<{
    packageName: string;
    version: string;
    date: string;
    part?: 'line' | 'command' | 'both';
  }>(),
  { part: 'both' },
);

const command = computed(() => `bun add ${props.packageName}@${props.version}`);
</script>

<template>
  <div :class="['cx-pre', `cx-pre--${part}`]">
    <p v-if="part !== 'command'" class="cx-pre-line">
      <span class="cx-label">Latest prerelease</span>
      <b>{{ version }}</b>
      <small v-if="date">{{ formatDate(date) }}</small>
    </p>
    <CopyCommand v-if="part !== 'line'" :command="command" />
  </div>
</template>
