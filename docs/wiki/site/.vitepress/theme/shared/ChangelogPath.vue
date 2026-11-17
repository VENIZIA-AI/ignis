<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The sticky right rail of a version's pages (with a link to the wiki's migrate guide, `themeConfig.migrateGuide`, when it names one): the four steps of an upgrade, and either the facts of the guide (on the
  details page, with a button to the guide) or the reader's progress through it (on the guide). A release with no migration
  block has no path to show: the rail says so.
-->
<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';

const props = defineProps<{
  version: string;
  packages: number;
  guide: { ids: string[]; covered: string[]; codemods: string[] } | undefined;
  guideUrl: string;
  /** Set on the guide page: how many steps the reader has marked done. */
  done?: number;
}>();

const { theme } = useData();
const migrateGuide = computed<string | undefined>(() =>
  typeof theme.value.migrateGuide === 'string' ? theme.value.migrateGuide : undefined,
);

const onGuide = computed(() => props.done !== undefined);
const blocks = computed(() => props.guide?.ids.length ?? 0);
const codemods = computed(() => props.guide?.codemods ?? []);
const byHand = computed(() => blocks.value - (props.guide?.covered.length ?? 0));
const percent = computed(() =>
  blocks.value === 0 ? 0 : Math.round(((props.done ?? 0) / blocks.value) * 100),
);
</script>

<template>
  <aside class="cx-rail cx-rail--right" aria-label="Upgrade path">
    <div class="cx-path">
      <h2 class="cx-label">Upgrade path, {{ version }}</h2>
      <template v-if="guide">
        <div v-if="onGuide" class="cx-prog">
          <strong
            >{{ done }} <small>of {{ blocks }} steps done</small></strong
          >
          <div class="bar"><i :style="{ width: `${percent}%` }"></i></div>
        </div>
        <dl v-else class="cx-facts">
          <div>
            <dt>Steps</dt>
            <dd>{{ blocks }}</dd>
          </div>
          <div>
            <dt>Codemods</dt>
            <dd>{{ codemods.length }}</dd>
          </div>
          <div>
            <dt>By hand</dt>
            <dd>{{ byHand }}</dd>
          </div>
        </dl>
        <ol>
          <li>
            Install the exact versions<small
              >{{ packages }} package{{ packages === 1 ? '' : 's' }}</small
            >
          </li>
          <li>Run the plan<small>finds your files and lines</small></li>
          <li>
            Run the codemods<small>{{ codemods.join(', ') || 'none for this release' }}</small>
          </li>
          <li>Run <code>bun check</code><small>fix what is left</small></li>
        </ol>
        <a v-if="!onGuide" class="cx-btn cx-btn--primary cx-btn--sm" :href="guideUrl"
          >Open the upgrade guide</a
        >
      </template>
      <p v-else class="cx-nopath">This release has no upgrade guide.</p>
      <a v-if="migrateGuide" class="cx-link cx-link--wide" :href="migrateGuide"
        >Several versions behind? Migrate between releases</a
      >
    </div>
  </aside>
</template>
