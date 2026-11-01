<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The left of the top bar, after the Venizia docs frame: the Venizia wordmark (in its own colours, never
  recoloured: the wordmark follows the theme, the arc is always #0A6BFF), a divider, and the name of this
  wiki's docs. The wordmark leaves for venizia.ai in a new tab; the name goes to this wiki's home.
-->
<script setup lang="ts">
import type { TSiteInfo } from './home-types';
import { VENIZIA_LOGO_SVG } from './venizia-logo';

defineProps<{ site: TSiteInfo }>();
</script>

<template>
  <div class="site-brand">
    <a
      class="brand-mark"
      href="https://venizia.ai"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Venizia"
      v-html="VENIZIA_LOGO_SVG"
    />
    <span class="brand-rule" aria-hidden="true"></span>
    <a class="brand-name" href="/">{{ site.name }} Docs</a>
  </div>
</template>
