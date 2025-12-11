import { z } from 'zod';
import { DocsHelper } from '../helpers';
import { BaseTool, createTool, type TMastraTool } from './base.tool';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Lists all available Ignis Framework documentation files with their identifiers, titles, and categories.

PURPOSE:
Use this tool to discover what documentation is available. It provides a complete catalog
of all documents, optionally filtered by category. Essential for understanding the documentation
structure and finding specific pages.

WHEN TO USE:
- To explore what documentation exists
- To find document IDs for use with getDocContent
- To browse documents within a specific category
- When searchDocs doesn't find what you're looking for
- To understand the overall documentation structure
- To provide users with a list of available resources

WHEN NOT TO USE:
- When you know what you're looking for (use searchDocs instead)
- When you need document content (use getDocContent after getting IDs)

CATEGORY FILTERING:
- Omit 'category' parameter to get ALL documents
- Provide exact category name to filter (case-sensitive)
- Use listCategories first to see available category names

COMMON CATEGORIES IN IGNIS DOCS:
- "Getting Started" - Introductory guides, quickstart, philosophy
- "Core Concepts" - DI, lifecycle, configuration fundamentals
- "Best Practices" - Recommended patterns and approaches
- "References" - API documentation, component details
- "Helpers" - Utility libraries documentation
- "Utilities" - Utility function references

WORKFLOW EXAMPLES:
1. Browse all docs:
   listDocs() → Review titles → getDocContent(id)

2. Explore a category:
   listCategories() → Pick category → listDocs(category) → getDocContent(id)

3. Find specific documentation:
   searchDocs(query) → If not found → listDocs() to browse manually
`;

const CATEGORY_DESCRIPTION = `
Optional category filter to narrow results to a specific documentation section.

BEHAVIOR:
- If omitted: Returns ALL documentation files across all categories
- If provided: Returns only documents matching the exact category name

MATCHING:
- Case-sensitive exact match required
- Must match the category string exactly as stored in document frontmatter

HOW TO GET VALID CATEGORIES:
Use the listCategories tool to retrieve all available category names.

EXAMPLES:
- "Getting Started" - Introductory documentation
- "Core Concepts" - Fundamental framework concepts
- "Best Practices" - Recommended patterns
- "References" - API and component documentation

TIP: If unsure of exact category name, call listCategories first or omit this parameter.
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const DocEntrySchema = z.object({
  id: z
    .string()
    .describe('Document ID (relative file path). Use with getDocContent or getDocMetadata.'),
  title: z.string().describe('Document title from frontmatter or filename.'),
  category: z.string().describe('Document category for organizational grouping.'),
});

const InputSchema = z.object({
  category: z.string().optional().describe(CATEGORY_DESCRIPTION),
});

const OutputSchema = z.object({
  count: z.number().int().describe('Total documents returned. Reflects filter if applied.'),
  docs: z.array(DocEntrySchema).describe('Document entries with id, title, and category.'),
});

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class ListDocsTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'listDocs';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(input: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const docs = await DocsHelper.listDocs({ category: input.category });

    return {
      count: docs.length,
      docs,
    };
  }

  getTool(): TMastraTool {
    return createTool({
      id: this.id,
      description: this.description,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      execute: async ({ context }) => this.execute(context),
    });
  }
}
