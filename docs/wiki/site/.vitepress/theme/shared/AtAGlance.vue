<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  "At a glance", a block of the Venizia docs frame: a label, a hairline and up to four short facts side by
  side, each a title and a line or two of text. A page passes `items` with words that are on the page; the
  block invents none, and it shows nothing when `items` is empty. The label is a real h2, so the page
  outline lists it.
-->
<script setup lang="ts">
import { computed } from 'vue';

export type TGlanceItem = { title: string; text: string };

const props = withDefaults(defineProps<{ items: TGlanceItem[]; label?: string }>(), {
  label: 'At a glance',
});

const id = computed(() =>
  props.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
);
</script>

<template>
  <section v-if="items.length > 0" class="glance" :aria-labelledby="id">
    <h2 :id="id" class="block-label">{{ label }}</h2>
    <ul class="glance-items">
      <li v-for="item in items" :key="item.title" class="glance-item">
        <p class="glance-title">{{ item.title }}</p>
        <p class="glance-text">{{ item.text }}</p>
      </li>
    </ul>
  </section>
</template>
