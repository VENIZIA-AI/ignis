<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The newest prerelease of every package of a version line, for a project whose packages are not released in step: one row
  for each, from the release tags.
-->
<script setup lang="ts">
import { formatDate } from './changelog-entries';

defineProps<{ rows: { name: string; version: string; date: string }[] }>();
</script>

<template>
  <details class="cx-readmore cx-pretable">
    <summary>Latest prerelease of each package ({{ rows.length }})</summary>
    <table>
      <thead>
        <tr>
          <th>Package</th>
          <th>Version</th>
          <th>Tagged</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.name">
          <td>
            <code>{{ row.name }}</code>
          </td>
          <td>
            <code>{{ row.version }}</code>
          </td>
          <td>{{ row.date ? formatDate(row.date) : '' }}</td>
        </tr>
      </tbody>
    </table>
  </details>
</template>
