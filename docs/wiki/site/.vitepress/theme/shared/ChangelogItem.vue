<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  One item of a version's log as a card: the title, its id and packages on one line, a link to its upgrade step when it has
  one, and the full text when the card opens. The card is a `<details>`, so it opens without script.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { shortPackage, type TVersionItem } from './changelog-items';

/** A card shows at most this many package chips; the rest are a count. */
const CHIPS = 3;

const props = defineProps<{
  item: TVersionItem;
  /** The upgrade page of the version, when a block of its guide covers this item. */
  stepUrl: string | undefined;
  covered: boolean;
}>();

const names = computed(() => props.item.packages.map((name) => shortPackage({ name })));
</script>

<template>
  <details :id="item.id" :class="['it', `it--${item.section.toLowerCase()}`]">
    <summary>
      <span class="it-main">
        <span class="it-title" v-html="item.titleHtml"></span>
        <span class="it-sub">
          <code class="cx-id">{{ item.id }}</code>
          <span v-for="name in names.slice(0, CHIPS)" :key="name" class="cx-pkg">{{ name }}</span>
          <span v-if="names.length > CHIPS" class="cx-pkg">+{{ names.length - CHIPS }}</span>
        </span>
      </span>
      <span class="it-meta">
        <span v-if="covered" class="cx-link cx-link--codemod">codemod</span>
        <a v-if="stepUrl" class="cx-link" :href="`${stepUrl}#${item.id}`">Step</a>
        <i class="it-more"></i>
      </span>
    </summary>
    <div class="it-body">
      <div v-html="item.html"></div>
      <a v-if="stepUrl" class="cx-btn cx-btn--sm" :href="`${stepUrl}#${item.id}`"
        >Open the upgrade step</a
      >
    </div>
  </details>
</template>
