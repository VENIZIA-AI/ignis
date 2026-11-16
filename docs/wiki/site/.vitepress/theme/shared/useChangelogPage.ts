/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * What the details page and the upgrade page of a version have in common: which version the page is, its entry, items and
 * guide, the line that dates it, the link to a file in the repository, and the package filter of the left rail. Both pages
 * import it as async components, so the data stays out of the script every page loads.
 */
import { useData } from 'vitepress';
import { computed, ref } from 'vue';
import { data as guideCounts } from './changelog-guide-counts.data';
import { data as itemSets } from './changelog-items.data';
import { data as versions } from './changelog-versions.data';
import { formatDate } from './changelog-entries';

export const useChangelogVersion = () => {
  const { page, site, theme } = useData();
  const version = computed(
    () => /^changelogs\/(\d+\.\d+\.\d+)/.exec(page.value.relativePath)?.[1] ?? '',
  );
  const entry = computed(() => versions.find((candidate) => candidate.version === version.value));
  const previous = computed(() => {
    const index = versions.findIndex((candidate) => candidate.version === version.value);

    return index === -1 ? undefined : versions[index + 1]?.version;
  });
  const prerelease = computed(() => entry.value !== undefined && entry.value.released === null);
  const dateLine = computed(() => {
    const released = entry.value?.released;

    return released === null || released === undefined
      ? 'In progress, on the next tag'
      : `Released ${formatDate(released)}`;
  });

  return {
    version,
    entry,
    previous,
    prerelease,
    dateLine,
    project: computed(() => site.value.title),
    items: computed(
      () => itemSets.find((candidate) => candidate.version === version.value)?.items ?? [],
    ),
    guide: computed(() => guideCounts.find((candidate) => candidate.version === version.value)),
    guideUrl: computed(() => `/changelogs/${version.value}/upgrade`),
    /** The address of a file of the repository, from the wiki's edit link (`.../edit/<branch>/<folder>/:path`); none without one. */
    sourceUrl: (path: string): string | undefined => {
      const pattern: unknown = theme.value.editLink?.pattern;

      return typeof pattern === 'string' && pattern.includes(':path')
        ? pattern.replace('/edit/', '/blob/').replace(':path', path)
        : undefined;
    },
  };
};

/** The package chips of the left rail: how many entries each package has, and the ones the reader selected. */
export const usePackageFilter = (opts: { lists: () => string[][] }) => {
  const selected = ref<Set<string>>(new Set());
  const packages = computed(() => {
    const counts = new Map<string, number>();

    for (const names of opts.lists()) {
      for (const name of new Set(names)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }

    const list = [...counts].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    );
    const max = list[0]?.[1] ?? 1;

    return list.map(([name, count]) => ({ name, count, width: Math.round((count / max) * 100) }));
  });
  const toggle = (name: string): void => {
    const next = new Set(selected.value);

    if (!next.delete(name)) {
      next.add(name);
    }

    selected.value = next;
  };

  return {
    selected,
    packages,
    toggle,
    /** Whether an entry with these packages passes the filter: all do when none is selected. */
    matches: (names: string[]): boolean =>
      selected.value.size === 0 || names.some((name) => selected.value.has(name)),
  };
};
