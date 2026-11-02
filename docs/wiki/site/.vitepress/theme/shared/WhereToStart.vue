<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  "Where to start", a block of the Venizia docs frame: a label and numbered rows, each a title, a line of text
  and a 36 px arrow button that leads to the page. The numbers are a real order (read the first, then the
  second), so they are shown; a page that has no order does not use this block. A page passes `items` with
  words that are on the page; the block shows nothing when `items` is empty. The label is a real h2, so the
  page outline lists it.
-->
<script setup lang="ts">
import { computed } from 'vue';

export type TStartItem = { title: string; text: string; href: string };

const props = withDefaults(defineProps<{ items: TStartItem[]; label?: string }>(), {
  label: 'Where to start',
});

const id = computed(() =>
  props.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
);

const numberOf = (index: number): string => String(index + 1).padStart(2, '0');
</script>

<template>
  <section v-if="items.length > 0" class="start" :aria-labelledby="id">
    <h2 :id="id" class="block-label">{{ label }}</h2>
    <ol class="start-rows">
      <li v-for="(item, index) in items" :key="item.href" class="start-row">
        <a class="start-link" :href="item.href">
          <span class="start-number">{{ numberOf(index) }}</span>
          <span class="start-body">
            <span class="start-title">{{ item.title }}</span>
            <span class="start-text">{{ item.text }}</span>
          </span>
          <span class="start-arrow" aria-hidden="true"></span>
        </a>
      </li>
    </ol>
  </section>
</template>
