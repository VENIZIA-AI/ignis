<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The Layout of a wiki: the default theme's, with the version chip beside the title, the ecosystem
  switcher in the header and in the mobile menu, the light and dark switch, and the footer. `site` is
  the wiki's identity, `version` the version its chip shows, and `home` the content of its home page,
  whose closing pitch the footer shows on the home page only.
-->
<script setup lang="ts">
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { computed } from 'vue';
import EcosystemSwitcher from './EcosystemSwitcher.vue';
import type { THomeContent, TSiteInfo } from './home-types';
import SiteFooter from './SiteFooter.vue';
import { provideThemeSwitch } from './toggle-appearance';

const props = defineProps<{ site: TSiteInfo; version: string; home?: THomeContent | null }>();

provideThemeSwitch();

const { Layout } = DefaultTheme;
const { page } = useData();
const homeOnHome = computed(() =>
  page.value.relativePath === 'index.md' ? (props.home ?? null) : null,
);
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
    <template #layout-bottom>
      <SiteFooter :site="site" :home="homeOnHome" />
    </template>
  </Layout>
</template>
