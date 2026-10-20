import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineRenderer } from '@venizia/vulcan/okf';

const MODULES_DIR = 'packages/helpers/src/modules';
const UTILITIES_DIR = 'packages/helpers/src/utilities';
const UTILITY_SUFFIX = '.utility.ts';

/** Every helper module with the `*Helper` classes it exports, and every `*.utility.ts` file. */
export default defineRenderer({
  id: 'helpers',
  collect: ({ context }) => {
    const dirs = context.source.listDirs({ dir: MODULES_DIR });
    const modules = context.source
      .exportedClasses({ dirs: dirs.map(dir => `${MODULES_DIR}/${dir}`), suffix: 'Helper' })
      .map(entry => ({ module: entry.dir.slice(MODULES_DIR.length + 1), classes: entry.classes }));

    const utilitiesPath = join(context.root, UTILITIES_DIR);
    const utilities = existsSync(utilitiesPath)
      ? readdirSync(utilitiesPath)
          .filter(name => name.endsWith(UTILITY_SUFFIX))
          .map(name => name.slice(0, -UTILITY_SUFFIX.length))
          .sort()
      : [];

    return { modules, utilities };
  },
  render: ({ context, facts }) => {
    const total = facts.modules.reduce((sum, entry) => sum + entry.classes.length, 0);

    const rows = facts.modules.map(entry => {
      const classes = entry.classes.map(name => `\`${name}\``).join(' · ') || '_(see source)_';

      return `| \`${entry.module}/\` | ${classes} |`;
    });

    return {
      path: 'reference/helpers.md',
      content:
        context.page.header({
          title: 'Helpers catalog',
          description: 'Every helper module and utility in packages/helpers (generated).',
          resource: 'packages/helpers/src',
          tags: ['reference', 'helpers', 'catalog'],
        }) +
        context.page.note({ seeAlso: 'Package: [helpers](/packages/helpers.md).' }) +
        `**${total} helper classes across ${facts.modules.length} modules, ${facts.utilities.length} utilities.**\n\n` +
        ['## Modules', '', '| Module | Classes |', '|---|---|', ...rows].join('\n') +
        '\n\n## Utilities\n\n' +
        (facts.utilities.map(name => `\`${name}\``).join(' · ') || '-') +
        '\n',
    };
  },
  coverage: ({ facts }) => ({ name: 'helper modules', count: facts.modules.length }),
});
