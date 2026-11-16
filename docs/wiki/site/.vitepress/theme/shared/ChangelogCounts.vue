<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The make-up of a release: one bar split by section, and the count of each section under it. The colour is data:
  Breaking carries the accent.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { TSectionName } from './changelog-items';

const props = defineProps<{ counts: [TSectionName, number][] }>();

const total = computed(() => props.counts.reduce((sum, [, count]) => sum + count, 0) || 1);
const label = computed(() =>
  props.counts.map(([name, count]) => `${count} ${name.toLowerCase()}`).join(', '),
);
</script>

<template>
  <div v-if="counts.length" class="cx-make">
    <div class="cx-comp" role="img" :aria-label="label">
      <i
        v-for="[name, count] in counts"
        :key="name"
        :class="`t-${name.toLowerCase()}`"
        :style="{ flex: count / total }"
      ></i>
    </div>
    <ul class="cx-counts">
      <li v-for="[name, count] in counts" :key="name" :class="`t-${name.toLowerCase()}`">
        <b>{{ count }}</b
        >{{ name }}
      </li>
    </ul>
  </div>
</template>
