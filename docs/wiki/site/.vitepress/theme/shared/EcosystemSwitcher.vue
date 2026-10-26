<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The ecosystem switcher. `popover` is the grid button of the header with its dropdown; `sheet` is the
  same list as a block under the links of the mobile menu. `current` is the id of the wiki it sits in.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ECOSYSTEM } from './ecosystem';
import { VENIZIA_LOGO_SVG } from './venizia-logo';
import ardorLogo from './assets/ardor-logo.svg';
import ignisLogo from './assets/ignis-logo.svg';
import vulcanLogo from './assets/vulcan-logo.svg';

const props = defineProps<{ current: string; variant: 'popover' | 'sheet' }>();

const LOGOS: Record<string, string> = { ardor: ardorLogo, ignis: ignisLogo, vulcan: vulcanLogo };
const root = ref<HTMLElement | null>(null);
const open = ref(false);

const close = (): void => {
  open.value = false;
};

const onDocumentClick = (event: MouseEvent): void => {
  if (open.value && root.value && !root.value.contains(event.target as Node)) {
    close();
  }
};

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && open.value) {
    close();
    root.value?.querySelector<HTMLElement>('.eco-btn')?.focus();
  }
};

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div v-if="props.variant === 'popover'" ref="root" class="eco">
    <button
      class="eco-btn"
      type="button"
      aria-haspopup="true"
      :aria-expanded="open"
      aria-label="Venizia ecosystem"
      @click="open = !open"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z"
        />
      </svg>
    </button>
    <div v-if="open" class="eco-pop">
      <p class="eco-title">Venizia ecosystem</p>
      <ul class="eco-list">
        <li v-for="item in ECOSYSTEM" :key="item.id">
          <a
            class="eco-item"
            :href="item.href"
            :aria-current="item.id === props.current ? 'true' : undefined"
            :target="item.external ? '_blank' : undefined"
            :rel="item.external ? 'noopener noreferrer' : undefined"
          >
            <span
              v-if="item.id === 'venizia'"
              class="eco-logo eco-logo--word"
              v-html="VENIZIA_LOGO_SVG"
            />
            <span v-else class="eco-logo"
              ><img :src="LOGOS[item.id]" alt="" width="20" height="26"
            /></span>
            <span class="eco-text"
              ><b>{{ item.name }}</b
              ><span>{{ item.role }}</span></span
            >
            <span v-if="item.id === props.current" class="eco-here">You are here</span>
          </a>
        </li>
      </ul>
    </div>
  </div>

  <div v-else class="eco-sheet">
    <p class="eco-title">Venizia ecosystem</p>
    <ul class="eco-list">
      <li v-for="item in ECOSYSTEM" :key="item.id">
        <a
          class="eco-item"
          :href="item.href"
          :aria-current="item.id === props.current ? 'true' : undefined"
          :target="item.external ? '_blank' : undefined"
          :rel="item.external ? 'noopener noreferrer' : undefined"
        >
          <span
            v-if="item.id === 'venizia'"
            class="eco-logo eco-logo--word"
            v-html="VENIZIA_LOGO_SVG"
          />
          <span v-else class="eco-logo"
            ><img :src="LOGOS[item.id]" alt="" width="20" height="26"
          /></span>
          <span class="eco-text"
            ><b>{{ item.name }}</b
            ><span>{{ item.role }}</span></span
          >
          <span v-if="item.id === props.current" class="eco-here">You are here</span>
        </a>
      </li>
    </ul>
  </div>
</template>
