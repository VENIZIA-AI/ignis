<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The install box: a labelled block of commands with a copy button.
-->
<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ label: string; lines: string[] }>();

const copied = ref('Copy');

const copy = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.lines.join('\n'));
    copied.value = 'Copied';
  } catch {
    copied.value = 'Press Ctrl+C';
  }

  setTimeout(() => {
    copied.value = 'Copy';
  }, 1600);
};
</script>

<template>
  <div class="install">
    <div class="install-head">
      <span>{{ label }}</span
      ><button class="copy" type="button" @click="copy">{{ copied }}</button>
    </div>
    <pre><span v-for="(line, index) in lines" :key="index" data-line><span class="prompt">$</span>{{ line }}{{ '\n' }}</span></pre>
  </div>
</template>
