<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  A command in a dark window with a button that copies it. The command is in the page as text, so it reads and copies by
  hand without script; the button only shows with script.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ command: string }>();

const ready = ref(false);
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  ready.value = typeof navigator !== 'undefined' && navigator.clipboard !== undefined;
});
onBeforeUnmount(() => clearTimeout(timer));

const copy = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.command);
    copied.value = true;
  } catch {
    return;
  }

  clearTimeout(timer);
  timer = setTimeout(() => {
    copied.value = false;
  }, 1500);
};
</script>

<template>
  <div class="cx-cmd">
    <code>{{ command }}</code>
    <button v-if="ready" class="cx-copy" type="button" @click="copy">
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
  </div>
</template>
