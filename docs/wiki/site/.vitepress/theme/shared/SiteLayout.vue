<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The Layout of a wiki: the default theme's, with the top bar of the Venizia docs frame (the Venizia
  wordmark, the name of these docs, the search, the venizia.ai link; also in the mobile menu), the line
  above an inner page's title, the "Getting help" block at its end, and the footer. `site` is the wiki's
  identity and `home` the content of its home page, whose closing pitch the footer shows. The footer is on
  the home page only; inner pages have none.
-->
<script setup lang="ts">
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { computed } from 'vue';
import ChangelogEntryHead from './ChangelogEntryHead.vue';
import DocEyebrow from './DocEyebrow.vue';
import DocsHelp from './DocsHelp.vue';
import type { THomeContent, TSiteInfo } from './home-types';
import SiteBrand from './SiteBrand.vue';
import SiteFooter from './SiteFooter.vue';
import { provideThemeSwitch } from './toggle-appearance';
import { useBarState } from './useBarState';
import VeniziaLink from './VeniziaLink.vue';

const props = defineProps<{ site: TSiteInfo; home?: THomeContent | null }>();

provideThemeSwitch();
useBarState();

const { Layout } = DefaultTheme;
const { page } = useData();
const isChangelogEntry = computed(() =>
  /^changelogs\/\d{4}-\d{2}-\d{2}-/.test(page.value.relativePath),
);
const isHome = computed(() => page.value.relativePath === 'index.md');
</script>

<template>
  <Layout>
    <template #nav-bar-content-before>
      <SiteBrand :site="site" />
    </template>
    <template #nav-bar-content-after>
      <VeniziaLink />
    </template>
    <template #nav-screen-content-after>
      <VeniziaLink />
    </template>
    <template #doc-before>
      <ChangelogEntryHead v-if="isChangelogEntry" />
      <DocEyebrow v-else :site="site" />
    </template>
    <template #doc-footer-before>
      <DocsHelp :site="site" />
    </template>
    <template #layout-bottom>
      <SiteFooter v-if="isHome" :site="site" :home="home ?? null" />
    </template>
  </Layout>
</template>
