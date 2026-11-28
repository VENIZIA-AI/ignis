<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The search of a wiki: a button in the top bar (Ctrl+K, Cmd+K or "/") that opens a dialog over the Pagefind index the
  build wrote. Arrows move through the results, Enter opens one, Escape closes.
-->
<script setup lang="ts">
import { useRouter, withBase } from 'vitepress';
import { computed, nextTick, onMounted, onUnmounted, ref, useId, useTemplateRef, watch } from 'vue';
import { WikiSearch } from './search';
import type { ISearchHit } from './search';

const router = useRouter();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const input = useTemplateRef<HTMLInputElement>('input');
const query = ref('');
const hits = ref<ISearchHit[]>([]);
const picked = ref(0);
const state = ref<'idle' | 'searching' | 'done' | 'unavailable'>('idle');
/** The name of the modifier key: the Command sign on an Apple device, known once the page runs in the browser. */
const modifier = ref('Ctrl');
const listId = useId();
const optionId = (index: number): string => `${listId}-${index}`;

/** What a screen reader hears, and what the box says under its input. */
const note = computed(() => {
  if (state.value === 'unavailable') {
    return 'Search is not available here: the index is written by the site build.';
  }

  if (state.value !== 'done') {
    return '';
  }

  const count = hits.value.length;

  return count === 0
    ? `No result for "${query.value}".`
    : `${count} result${count === 1 ? '' : 's'}.`;
});

let asked = 0;

const open = async (): Promise<void> => {
  if (dialog.value?.open === false) {
    dialog.value.showModal();
    await nextTick();
    input.value?.select();
  }
};
const close = (): void => dialog.value?.close();
const go = async (hit: ISearchHit | undefined): Promise<void> => {
  if (hit !== undefined) {
    close();
    await router.go(hit.url);
  }
};
const move = async (step: number): Promise<void> => {
  const count = hits.value.length;

  if (count > 0) {
    picked.value = (picked.value + step + count) % count;
    await nextTick();
    dialog.value?.querySelector('.picked')?.scrollIntoView({ block: 'nearest' });
  }
};

watch(query, async (text) => {
  const turn = ++asked;

  if (text.trim() === '') {
    hits.value = [];
    state.value = 'idle';

    return;
  }

  state.value = 'searching';

  try {
    const found = await WikiSearch.find({ url: withBase('/pagefind/pagefind.js'), query: text });

    // A slower answer to an earlier text is dropped.
    if (turn === asked && found !== undefined) {
      hits.value = found;
      picked.value = 0;
      state.value = 'done';
    }
  } catch {
    // The box says search is unavailable: that is the report.
    if (turn === asked) {
      hits.value = [];
      state.value = 'unavailable';
    }
  }
});

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const onKey = async (event: KeyboardEvent): Promise<void> => {
  const isShortcut =
    (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) ||
    (event.key === '/' && !isTyping(event.target));

  if (isShortcut) {
    event.preventDefault();
    await open();
  }
};

onMounted(() => {
  if (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) {
    modifier.value = '⌘';
  }

  window.addEventListener('keydown', onKey);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="wiki-search">
    <button
      type="button"
      class="search-button"
      aria-label="Search"
      aria-keyshortcuts="Control+K Meta+K /"
      @click="open"
    >
      <span class="search-icon" aria-hidden="true"></span>
      <span class="search-label">Search</span>
      <span class="search-keys" aria-hidden="true"
        ><kbd>{{ modifier }}</kbd
        ><kbd>K</kbd></span
      >
    </button>
    <dialog ref="dialog" class="search-dialog" aria-label="Search" @click.self="close">
      <div class="search-panel">
        <input
          ref="input"
          v-model="query"
          type="search"
          role="combobox"
          placeholder="Search"
          aria-label="Search"
          aria-autocomplete="list"
          :aria-expanded="hits.length > 0"
          :aria-controls="listId"
          :aria-activedescendant="hits.length > 0 ? optionId(picked) : undefined"
          autocomplete="off"
          spellcheck="false"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="go(hits[picked])"
        />
        <!-- always in the page: a live region that appears with its text is not announced -->
        <p class="search-note" role="status" aria-live="polite">{{ note }}</p>
        <ul :id="listId" class="search-hits" role="listbox" aria-label="Results">
          <li
            v-for="(hit, index) in hits"
            :id="optionId(index)"
            :key="hit.url"
            role="option"
            :aria-selected="index === picked"
            :class="{ picked: index === picked }"
          >
            <a :href="hit.url" tabindex="-1" @click.prevent="go(hit)" @mousemove="picked = index">
              <span class="hit-title">{{ hit.title }}</span>
              <span class="hit-excerpt" v-html="hit.excerpt"></span>
            </a>
          </li>
        </ul>
      </div>
    </dialog>
  </div>
</template>
