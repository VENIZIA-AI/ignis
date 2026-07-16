/**
 * viz.ts - generate a self-contained, clustered knowledge-graph explorer.
 * Cytoscape.js + fcose are vendored (./vendor) and inlined, so the output HTML is fully
 * offline. We only inject data + the libs; no JS escaping of our code.
 *
 * Output is `.agents/knowledge/viz.html` only. Unlike the BANA original this does not also
 * write into docs/wiki - the wiki is human-facing and out of scope for the bundle.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { BUNDLE, REPO, SECTION_LABELS, SECTION_ORDER } from './config.ts';
import { loadConcepts } from './lib.ts';

const sectionTitle = (opts: { key: string }): string => {
  const { key } = opts;

  return (
    SECTION_LABELS[key] ??
    key.replace(/(^|-)([a-z])/g, (_, separator: string, char: string) => (separator ? ' ' : '') + char.toUpperCase())
  );
};

const sectionOf = (opts: { id: string }): string => {
  return opts.id.split('/')[1] || 'overview';
};

export const buildViz = (): void => {
  const concepts = loadConcepts().filter((concept) => !concept.reserved);
  const ids = new Set(concepts.map((concept) => concept.id));

  const nodes = concepts.map((concept) => ({
    id: concept.id,
    type: concept.type,
    title: concept.title,
    description: concept.description,
    tags: concept.tags,
    body: concept.body,
    group: sectionOf({ id: concept.id }),
    degree: 0,
  }));

  const index = new Map(nodes.map((node) => [node.id, node]));

  const edges: { source: string; target: string }[] = [];
  const seen = new Set<string>();

  for (const concept of concepts) {
    for (const target of concept.links) {
      if (target === concept.id || !ids.has(target)) {
        continue;
      }

      const key = concept.id + ' ' + target;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      edges.push({ source: concept.id, target });
      index.get(concept.id)!.degree++;
      index.get(target)!.degree++;
    }
  }

  const present = new Set(nodes.map((node) => node.group));
  const ordered: string[] = [
    ...SECTION_ORDER.filter((section) => present.has(section)),
    ...[...present].filter((section) => !SECTION_ORDER.includes(section as never)).sort(),
  ];

  const sections = ordered.map((key) => ({
    key,
    label: sectionTitle({ key }),
    count: nodes.filter((node) => node.group === key).length,
  }));

  const data = JSON.stringify({ nodes, edges, sections }).replace(/<\//g, '<\\/');

  // Vendored libs, in dependency order. Escape only </script so text/plain blocks survive.
  const lib = (opts: { file: string }): string => {
    return readFileSync(join(import.meta.dir, 'vendor', opts.file), 'utf8').replace(/<\/script/gi, '<\\/script');
  };

  let html = readFileSync(join(import.meta.dir, 'viz-template.html'), 'utf8');
  const inject = (opts: { token: string; value: string }): void => {
    html = html.replace(opts.token, () => opts.value);
  };

  inject({ token: '__OKF_DATA__', value: data });
  inject({ token: '__LIB_LAYOUT_BASE__', value: lib({ file: 'layout-base.js' }) });
  inject({ token: '__LIB_COSE_BASE__', value: lib({ file: 'cose-base.js' }) });
  inject({ token: '__LIB_CYTOSCAPE__', value: lib({ file: 'cytoscape.min.js' }) });
  inject({ token: '__LIB_FCOSE__', value: lib({ file: 'cytoscape-fcose.js' }) });

  const out = join(BUNDLE, 'viz.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);

  console.log(`viz: wrote ${relative(REPO, out)}`);
  console.log(`viz: ${nodes.length} nodes, ${edges.length} edges, ${sections.length} sections`);
};
