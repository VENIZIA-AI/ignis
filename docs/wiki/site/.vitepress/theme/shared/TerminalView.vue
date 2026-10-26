<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  A terminal scene. Every line is in the HTML (the typed part sits in a copy that useTerminal moves
  out), so its height is final from the first paint.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { TTermKind, TTermLine } from './home-types';

const props = defineProps<{ lines: TTermLine[] }>();

type TNode = { type: 'cmd'; text: string } | { type: 'group'; lines: [TTermKind, string][] };

/** The lines become typed commands and groups of output between them. */
const nodes = computed<TNode[]>(() => {
  const result: TNode[] = [];
  let group: [TTermKind, string][] = [];

  const flush = (): void => {
    if (group.length > 0) {
      result.push({ type: 'group', lines: group });
      group = [];
    }
  };

  for (const [kind, text] of props.lines) {
    if (kind === 'cmd') {
      flush();
      result.push({ type: 'cmd', text });
    } else if (kind === 'gap') {
      flush();
    } else {
      group.push([kind, text]);
    }
  }

  flush();

  return result;
});
</script>

<template>
  <div class="term" data-term>
    <template v-for="(node, index) in nodes" :key="index">
      <div v-if="node.type === 'cmd'" class="term-cmd" :data-text="node.text">
        <span class="prompt">$</span><span class="typed-done"></span><span class="caret"></span
        ><span class="typed-rest">{{ node.text }}</span>
      </div>
      <div v-else class="term-group">
        <span v-for="(line, at) in node.lines" :key="at" :class="['tl', line[0]]">{{
          line[1]
        }}</span>
      </div>
    </template>
    <div class="term-cmd term-next"><span class="prompt">$</span><span class="caret"></span></div>
  </div>
</template>
