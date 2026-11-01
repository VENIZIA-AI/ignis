<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The Layout of a wiki: the default theme's, with the version chip beside the title, the ecosystem
  switcher in the header and in the mobile menu, the light and dark switch, the line above an inner page's
  title, the "Getting help" block at its end, and the footer. `site` is
  the wiki's identity, `version` the version its chip shows, and `home` the content of its home page,
  whose closing pitch the footer shows. The footer is on the home page only; inner pages have none.
-->
<script setup lang="ts">
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { computed } from 'vue';
import ChangelogEntryHead from './ChangelogEntryHead.vue';
import DocEyebrow from './DocEyebrow.vue';
import DocsHelp from './DocsHelp.vue';
import EcosystemSwitcher from './EcosystemSwitcher.vue';
import type { THomeContent, TSiteInfo } from './home-types';
import SiteFooter from './SiteFooter.vue';
import { provideThemeSwitch } from './toggle-appearance';

const props = defineProps<{ site: TSiteInfo; version: string; home?: THomeContent | null }>();

provideThemeSwitch();

const { Layout } = DefaultTheme;
const { page } = useData();
const isChangelogEntry = computed(() =>
  /^changelogs\/\d{4}-\d{2}-\d{2}-/.test(page.value.relativePath),
);
const isHome = computed(() => page.value.relativePath === 'index.md');
</script>

<template>
  <Layout>
    <template #nav-bar-title-after>
      <span class="site-version">{{ version }}</span>
    </template>
    <template #nav-bar-content-after>
      <EcosystemSwitcher :current="site.id" variant="popover" />
    </template>
    <template #nav-screen-content-after>
      <EcosystemSwitcher :current="site.id" variant="sheet" />
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
