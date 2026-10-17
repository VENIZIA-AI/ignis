import { defineRenderer } from '@venizia/vulcan/okf';

const COMPONENTS_DIR = 'packages/core-server/src/components';

/** Every component directory in core-server, with the `*Component` classes it exports. */
export default defineRenderer({
  id: 'components',
  collect: ({ context }) => {
    const dirs = context.source.listDirs({ dir: COMPONENTS_DIR });

    return context.source
      .exportedClasses({ dirs: dirs.map(dir => `${COMPONENTS_DIR}/${dir}`), suffix: 'Component' })
      .map(entry => ({ dir: entry.dir.slice(COMPONENTS_DIR.length + 1), classes: entry.classes }));
  },
  render: ({ context, facts }) => {
    const total = facts.reduce((sum, entry) => sum + entry.classes.length, 0);

    const rows = facts.map(entry => {
      const classes = entry.classes.map(name => `\`${name}\``).join(' · ') || '_(see source)_';

      return `| \`${entry.dir}/\` | ${classes} |`;
    });

    return {
      path: 'reference/components.md',
      content:
        context.page.header({
          title: 'Components catalog',
          description: `Every component under ${COMPONENTS_DIR} and its exported classes (generated).`,
          resource: COMPONENTS_DIR,
          tags: ['reference', 'components', 'core'],
        }) +
        context.page.note({ seeAlso: 'Model: [component model](/architecture/component-model.md).' }) +
        `**${total} component classes across ${facts.length} component directories.**\n\n` +
        ['| Directory | Classes |', '|---|---|', ...rows].join('\n') +
        '\n',
    };
  },
  coverage: ({ facts }) => ({
    name: 'components',
    count: facts.reduce((sum, entry) => sum + entry.classes.length, 0),
  }),
});
