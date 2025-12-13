import { MCPConfigs } from '@/mcp-server/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BaseTool, TMastraTool } from '../base.tool';
import { Logger } from '@/mcp-server/helpers';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Searches for code patterns, function names, class definitions, and keywords across the Ignis source code.

PURPOSE:
Find specific code implementations, locate where functions/classes are defined, and discover
code patterns throughout the repository. Essential for understanding how features are implemented.

WHEN TO USE:
- To find where a specific function or class is defined
- To locate usages of a particular API or pattern
- To find configuration files or specific code constructs
- When you know WHAT you're looking for but not WHERE it is
- To answer questions like "where is X implemented?" or "how is Y used?"

WHEN NOT TO USE:
- For general project structure exploration (use listProjectFiles instead)
- For documentation content (use searchDocs instead)
- When you already know the file path (use viewSourceFile instead)

SEARCH TIPS:
- Use specific terms: "createApplication" instead of "create"
- Include file extension for targeted results: "extension:ts HttpServer"
- Search for class/function names: "class DependencyContainer"
- Combine terms: "inject decorator"

OUTPUT:
Returns matching files with code snippets showing the match context.
Use viewSourceFile to read the complete file content.
`;

const QUERY_DESCRIPTION = `
Search query to find in the codebase.

QUERY SYNTAX:
- Simple keyword: "HttpServer" - finds files containing HttpServer
- Multiple terms: "inject service" - files containing both terms
- Exact phrase: "\\"dependency injection\\"" - exact phrase match
- File extension: "extension:ts middleware" - only TypeScript files
- Path filter: "path:packages/core createTool" - search in specific path

EXAMPLES:
- "class Application" - find Application class definition
- "export function create" - find exported create functions
- "extension:ts @Injectable" - find Injectable decorators in TS files
- "path:packages/helpers redis" - find redis usage in helpers package
- "BaseController extends" - find classes extending BaseController

TIPS:
- Be specific to reduce noise
- Use class/function names when known
- Combine with path: or extension: for targeted results
`;

const LIMIT_DESCRIPTION = `
Maximum number of results to return (1-${MCPConfigs.codeSearch.maxLimit}, default: ${MCPConfigs.codeSearch.defaultLimit}).

RECOMMENDATIONS:
- Use 5-10 for specific searches (function names, class definitions)
- Use 15-20 for broader pattern searches
- Use ${MCPConfigs.codeSearch.maxLimit} when exploring all usages of a common term
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const SearchResultSchema = z.object({
  filePath: z.string().describe('Full file path from repository root. Use with viewSourceFile.'),
  fileName: z.string().describe('File name for quick reference.'),
  matchSnippet: z
    .string()
    .optional()
    .describe('Code snippet showing the match context (if available).'),
  url: z.string().optional().describe('GitHub URL to view the file online.'),
});

const InputSchema = z.object({
  query: z.string().min(MCPConfigs.codeSearch.minQueryLength).describe(QUERY_DESCRIPTION),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MCPConfigs.codeSearch.maxLimit)
    .default(MCPConfigs.codeSearch.defaultLimit)
    .describe(LIMIT_DESCRIPTION),
});

const OutputSchema = z.object({
  query: z.string().describe('The search query that was executed.'),
  totalCount: z.number().int().describe('Total number of matches found.'),
  results: z.array(SearchResultSchema).describe('Search results with file paths and snippets.'),
  error: z.string().optional().describe('Error message if search failed.'),
  rateLimitWarning: z
    .string()
    .optional()
    .describe('Warning if approaching GitHub API rate limits.'),
});

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface IGithubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{
    name: string;
    path: string;
    html_url: string;
    repository: { full_name: string };
    text_matches?: Array<{
      fragment: string;
      matches: Array<{ text: string; indices: number[] }>;
    }>;
  }>;
  message?: string;
}

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class SearchCodeTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'searchCode';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(opts: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const { query, limit } = opts;
    const { apiBase, repoOwner, repoName, userAgent } = MCPConfigs.github;

    // Build GitHub code search query
    const searchQuery = `${query} repo:${repoOwner}/${repoName}`;
    const url = `${apiBase}/search/code?q=${encodeURIComponent(searchQuery)}&per_page=${limit}`;

    Logger.debug(`Searching code on GitHub: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/vnd.github.text-match+json', // Include text match fragments
        },
      });

      // Check rate limit headers
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitWarning =
        rateLimitRemaining &&
        parseInt(rateLimitRemaining) < MCPConfigs.codeSearch.rateLimitWarningThreshold
          ? `GitHub API rate limit low: ${rateLimitRemaining} requests remaining. Consider waiting before more searches.`
          : undefined;

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        Logger.error(`GitHub code search failed: ${response.statusText}`);

        if (response.status === 403) {
          return {
            query,
            totalCount: 0,
            results: [],
            error:
              'GitHub API rate limit exceeded. Please wait a moment before searching again. Unauthenticated requests are limited to 10 per minute.',
            rateLimitWarning,
          };
        }

        return {
          query,
          totalCount: 0,
          results: [],
          error: errorData.message || `GitHub API error: ${response.statusText}`,
          rateLimitWarning,
        };
      }

      const data = (await response.json()) as IGithubSearchResponse;

      const results = data.items.map(item => {
        // Extract the best text match snippet
        const matchSnippet = item.text_matches?.[0]?.fragment;

        return {
          filePath: item.path,
          fileName: item.name,
          matchSnippet,
          url: item.html_url,
        };
      });

      return {
        query,
        totalCount: data.total_count,
        results,
        rateLimitWarning,
      };
    } catch (error) {
      Logger.error('Failed to search code on GitHub:', error);
      return {
        query,
        totalCount: 0,
        results: [],
        error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
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
