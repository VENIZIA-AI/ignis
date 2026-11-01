<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The footer of the home page, after venizia.ai: one dark slab with drifting dust. It opens with the
  closing pitch (the install box and the buttons again); then the motto with the Venizia mark, four link
  columns (the docs of the three products, the wiki's own, the community, the company) and the legal row.
  Inner pages have no footer (SiteLayout shows it on the home page only). Every link to another site
  opens in a new tab.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { DOCS_SITES } from './ecosystem';
import type { THomeContent, TSiteInfo } from './home-types';
import InstallBox from './InstallBox.vue';
import { useDust } from './useDust';
import { useReveal } from './useReveal';
import { VENIZIA_LOGO_SVG } from './venizia-logo';

defineProps<{ site: TSiteInfo; home?: THomeContent | null }>();

const root = ref<HTMLElement | null>(null);
const dust = ref<HTMLCanvasElement | null>(null);

useReveal(root);
useDust(dust, { cloud: { x: 0.5, y: 0.25, rx: 0.5, ry: 0.5 }, dark: true });

const isExternal = (href: string): boolean => /^https?:/.test(href);
const targetOf = (href: string) => (isExternal(href) ? '_blank' : undefined);
const relOf = (href: string) => (isExternal(href) ? 'noopener noreferrer' : undefined);
</script>

<template>
  <footer ref="root" class="vh site-footer">
    <canvas ref="dust" class="dust" aria-hidden="true"></canvas>
    <div v-if="home" class="closing">
      <div class="wrap">
        <h2 class="reveal">{{ home.closing.title }}</h2>
        <p class="reveal" style="--i: 1">{{ home.closing.text }}</p>
        <InstallBox
          class="reveal"
          style="--i: 2"
          :label="home.install.label"
          :lines="home.install.lines"
        />
        <div class="cta reveal" style="--i: 3">
          <a
            class="btn btn--primary"
            :href="home.cta[0][1]"
            :target="targetOf(home.cta[0][1])"
            :rel="relOf(home.cta[0][1])"
            >{{ home.cta[0][0] }}</a
          >
          <a
            class="btn btn--ghost"
            :href="home.cta[1][1]"
            :target="targetOf(home.cta[1][1])"
            :rel="relOf(home.cta[1][1])"
            >{{ home.cta[1][0] }}</a
          >
        </div>
      </div>
    </div>
    <div class="wrap">
      <div class="foot-top">
        <p class="foot-motto">Veni, vidi, vici.<br />I came, I saw, I conquered.</p>
        <a
          class="foot-logo"
          href="https://venizia.ai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Venizia"
          v-html="VENIZIA_LOGO_SVG"
        />
      </div>
      <div class="foot-cols">
        <div>
          <h4>Docs</h4>
          <a
            v-for="item in DOCS_SITES"
            :key="item.id"
            :href="item.href"
            :aria-current="item.id === site.id ? 'page' : undefined"
            >{{ item.name }}</a
          >
        </div>
        <div>
          <h4>{{ site.name }}</h4>
          <a v-for="[label, path] in site.own" :key="path" :href="path">{{ label }}</a>
        </div>
        <div>
          <h4>Community</h4>
          <a :href="site.repo" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a :href="site.npm" target="_blank" rel="noopener noreferrer">npm</a>
          <a :href="`${site.repo}/issues`" target="_blank" rel="noopener noreferrer">Issues</a>
          <a
            :href="`${site.repo}/blob/develop/LICENSE.md`"
            target="_blank"
            rel="noopener noreferrer"
            >License</a
          >
        </div>
        <div>
          <h4>Company</h4>
          <a href="https://venizia.ai" target="_blank" rel="noopener noreferrer">Venizia</a>
          <a href="https://venizia.ai/en/about" target="_blank" rel="noopener noreferrer">About</a>
          <a href="https://venizia.ai/en/contact" target="_blank" rel="noopener noreferrer"
            >Contact</a
          >
        </div>
      </div>
      <div class="foot-legal">
        <span
          >Released under the MIT License. {{ site.name }} is part of
          <a href="https://venizia.ai" target="_blank" rel="noopener noreferrer">VENIZIA</a>.</span
        >
        <span
          >Copyright © 2025
          <a href="https://venizia.ai" target="_blank" rel="noopener noreferrer"
            >Venizia Co., Ltd.</a
          ></span
        >
      </div>
    </div>
  </footer>
</template>
