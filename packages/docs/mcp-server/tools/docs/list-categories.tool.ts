import { DocsHelper } from '@/mcp-server/helpers';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BaseTool, TMastraTool } from '../base.tool';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Lists all unique documentation categories available in the Ignis Framework documentation.

PURPOSE:
Use this tool to discover the organizational structure of the documentation.
Categories group related documents together, making it easier to navigate
and understand the documentation hierarchy.

WHEN TO USE:
- Before using listDocs with a category filter
- To understand how documentation is organized
- To help users navigate to relevant sections
- When exploring the documentation structure
- To verify exact category names (they are case-sensitive)

WHEN NOT TO USE:
- When you already know the category you need
- When searching for specific content (use searchDocs)
- When you need document content (use getDocContent)

WORKFLOW RECOMMENDATIONS:
1. Discovery workflow:
   listCategories() → Pick relevant category → listDocs(category) → getDocContent(id)

2. Help user navigate:
   listCategories() → Present options to user → Based on selection, listDocs(category)

3. Comprehensive overview:
   listCategories() → For each category, listDocs(category) → Summarize structure

CATEGORY NAMING:
- Categories are defined in document frontmatter
- Names are case-sensitive when filtering
- Sorted alphabetically in output
- "Uncategorized" may appear for documents without explicit category

OUTPUT:
Returns count and alphabetically sorted array of unique category names.
`;

const CATEGORIES_DESCRIPTION = `
Array of unique category names sorted alphabetically.

CATEGORY SOURCES:
Categories are extracted from the "category" frontmatter field in each markdown document.
Documents without a category field are grouped under "Uncategorized".

TYPICAL IGNIS CATEGORIES:
- "Getting Started" - Introductory guides and tutorials
- "Core Concepts" - Fundamental framework concepts (DI, lifecycle, etc.)
- "Best Practices" - Recommended patterns and approaches
- "References" - Detailed API and component documentation
- "Helpers" - Documentation for helper libraries
- "Utilities" - Utility function references
- "Source Details" - Internal implementation documentation

USE WITH listDocs:
Pass any category name to listDocs(category) to filter documents by that category.
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const InputSchema = z.object({}).describe('No input parameters required.');

const OutputSchema = z.object({
  count: z.number().int().describe('Total number of unique categories.'),
  categories: z.array(z.string()).describe(CATEGORIES_DESCRIPTION),
});

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class ListCategoriesTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'listCategories';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(_opts: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const categories = await DocsHelper.listCategories();

    return {
      count: categories.length,
      categories,
    };
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
