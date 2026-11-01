<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The "Getting help" block at the end of an inner page, after the Venizia docs frame: a dark panel with
  two ways to reach the people who build the product. Both addresses are the wiki's own (its GitHub issues)
  and Venizia's contact page; nothing here is page content. Every link opens in a new tab.
-->
<script setup lang="ts">
import type { TSiteInfo } from './home-types';

defineProps<{ site: TSiteInfo }>();
</script>

<template>
  <aside class="doc-help" aria-labelledby="doc-help-title">
    <div class="doc-help-text">
      <p class="doc-help-label">Getting help</p>
      <!-- not an h2: the page outline lists every h2 of the article, and this block is not part of the text -->
      <div id="doc-help-title" class="doc-help-title" role="heading" aria-level="2">
        The team that builds {{ site.name }} answers questions.
      </div>
      <p>Open an issue with the page you are on and what you expected, or write to us.</p>
    </div>
    <div class="doc-help-actions">
      <a
        class="doc-help-primary"
        href="https://venizia.ai/en/contact"
        target="_blank"
        rel="noopener noreferrer"
        >Talk to us</a
      >
      <a
        class="doc-help-ghost"
        :href="`${site.repo}/issues`"
        target="_blank"
        rel="noopener noreferrer"
        >Open an issue</a
      >
    </div>
  </aside>
</template>
