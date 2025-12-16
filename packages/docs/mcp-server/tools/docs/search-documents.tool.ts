import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BaseTool, TMastraTool } from '../base.tool';
import { MCPConfigs } from '@/mcp-server/common';
import { DocsHelper } from '@/mcp-server/helpers';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Performs intelligent fuzzy search across the entire Ignis Framework documentation corpus.

PURPOSE:
Use this tool to find documentation pages relevant to a user's question or topic.
It searches both document titles (weighted higher) and content body using the Fuse.js fuzzy matching algorithm.

WHEN TO USE:
- User asks "how do I..." or "what is..." questions about Ignis
- You need to find documentation about a specific feature, concept, or API
- You want to discover related documentation before diving into specifics
- User mentions keywords that might appear in documentation

SEARCH BEHAVIOR:
- Fuzzy matching tolerates typos and partial matches
- Title matches are weighted 70%, content matches 30%
- Results sorted by relevance score (lower = better match)
- Returns snippet previews for quick assessment

WORKFLOW RECOMMENDATION:
1. Start with searchDocs to find relevant pages
2. Review returned snippets to identify best matches
3. Use getDocContent with specific IDs to retrieve full content
4. Use getDocMetadata if you need document statistics

OUTPUT STRUCTURE:
Returns array of {id, title, category, snippet, score} objects.
Use the 'id' field with getDocContent to fetch full document content.
`;

const QUERY_DESCRIPTION = `
Search query string to match against documentation titles and content.

REQUIREMENTS:
- Minimum ${MCPConfigs.search.minQueryLength} characters required
- Supports natural language queries (e.g., "dependency injection setup")
- Supports technical terms (e.g., "HttpServer middleware")
- Case-insensitive matching

TIPS FOR EFFECTIVE QUERIES:
- Use specific technical terms for precise results
- Try alternative phrasings if initial search yields few results
- Combine concepts for targeted searches (e.g., "redis cache helper")
`;

const LIMIT_DESCRIPTION = `
Maximum number of results to return.

CONSTRAINTS:
- Minimum: 1
- Maximum: ${MCPConfigs.search.maxLimit}
- Default: ${MCPConfigs.search.defaultLimit}

RECOMMENDATIONS:
- Use default (10) for general queries
- Increase to 20-30 for broad topic exploration
- Use lower values (3-5) when you need only top matches
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const SearchResultSchema = z.object({
  id: z
    .string()
    .describe(
      'Unique document identifier (relative file path). Use with getDocContent to retrieve full document.',
    ),
  title: z.string().describe('Human-readable document title from frontmatter or filename.'),
  category: z.string().describe('Document category (e.g., "Getting Started", "References").'),
  snippet: z.string().describe('Content preview (max 300 chars) for quick assessment.'),
  score: z.number().optional().describe('Relevance score 0-1 (lower = better match).'),
});

const InputSchema = z.object({
  query: z.string().min(MCPConfigs.search.minQueryLength).describe(QUERY_DESCRIPTION),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MCPConfigs.search.maxLimit)
    .default(MCPConfigs.search.defaultLimit)
    .describe(LIMIT_DESCRIPTION),
});

const OutputSchema = z.object({
  results: z
    .array(SearchResultSchema)
    .describe('Search results sorted by relevance. Empty array if no matches.'),
});

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class SearchDocsTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'searchDocuments';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(opts: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const results = await DocsHelper.searchDocuments({
      query: opts.query,
      limit: opts.limit,
    });
    return { results };
  }

  getTool(): TMastraTool {
    return createTool({
      id: this.id,
      description: this.description,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      execute: async ({ context }) => this.execute(context),
    });
  }
}
