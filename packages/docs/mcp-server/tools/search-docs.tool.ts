import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as docsLoader from '../lib/docs-loader';

export const searchDocsTool = createTool({
  id: 'searchDocs',
  description: 'Performs a fuzzy search over the documentation.',
  inputSchema: z.object({
    query: z.string().min(2).describe('The search query.'),
  }),
  execute: async ({ context }) => {
    return docsLoader.searchDocs(context.query);
  },
});
