<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The line above the title of an inner page, after the Venizia docs frame: "Documentation" and the wiki's
  name. It says nothing a page could get wrong, so it is the same on every page.
-->
<script setup lang="ts">
import type { TSiteInfo } from './home-types';

defineProps<{ site: TSiteInfo }>();
</script>

<template>
  <p class="doc-eyebrow">Documentation · {{ site.name }}</p>
</template>
