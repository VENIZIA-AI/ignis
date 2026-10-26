<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The window of the hero: tabs over a code sample or a terminal scene, with a line under it for the
  selected tab. A tab switch replays that tab's terminal.
-->
<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { highlight } from './highlight';
import type { THomeTab, TTermLine } from './home-types';
import TerminalView from './TerminalView.vue';
import { playTerminalsIn } from './useTerminal';

const props = defineProps<{ id: string; tabs: THomeTab[] }>();

const root = ref<HTMLElement | null>(null);
const active = ref(0);
let started = false;

const label = (tab: THomeTab): string => tab.file.split('/').pop() ?? tab.file;

const select = async (index: number): Promise<void> => {
  active.value = index;

  // A tab switch replays that tab's terminal.
  if (started) {
    await nextTick();

    const panel = root.value?.querySelectorAll('[role="tabpanel"]')[index];

    if (panel) {
      playTerminalsIn(panel);
    }
  }
};

const onKey = async (event: KeyboardEvent, index: number): Promise<void> => {
  const step = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[event.key];

  if (step === undefined) {
    return;
  }

  const next = (index + step + props.tabs.length) % props.tabs.length;

  await select(next);
  root.value?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
};

onMounted(() => {
  started = true;
});
</script>

<template>
  <div ref="root" class="win reveal" style="--i: 2" data-tabs>
    <div class="win-bar" role="tablist" aria-label="Examples">
      <button
        v-for="(tab, index) in tabs"
        :key="tab.file"
        class="win-tab"
        role="tab"
        :aria-controls="`${id}-p${index}`"
        :aria-selected="active === index"
        :tabindex="active === index ? 0 : -1"
        :title="tab.file"
        @click="select(index)"
        @keydown="onKey($event, index)"
      >
        {{ label(tab) }}
      </button>
    </div>
    <div class="win-body">
      <div
        v-for="(tab, index) in tabs"
        :id="`${id}-p${index}`"
        :key="tab.file"
        role="tabpanel"
        :class="['win-panel', { 'is-on': active === index }]"
      >
        <pre
          v-if="tab.kind === 'code'"
          style="margin: 0; font: inherit"
          v-html="highlight(tab.body as string)"
        />
        <TerminalView v-else :lines="tab.body as TTermLine[]" />
      </div>
    </div>
    <div class="win-notes">
      <p
        v-for="(tab, index) in tabs"
        :key="`note-${tab.file}`"
        :class="['win-note', { 'is-on': active === index }]"
      >
        <template v-if="tab.file.includes('/')"
          ><code>{{ tab.file }}</code
          >:
        </template>
        <span v-if="tab.note" v-html="tab.note" />
      </p>
    </div>
  </div>
</template>
