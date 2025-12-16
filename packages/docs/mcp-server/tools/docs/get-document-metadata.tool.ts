import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BaseTool, TMastraTool } from '../base.tool';
import { DocsHelper } from '@/mcp-server/helpers';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Retrieves statistical metadata about a specific Ignis Framework documentation file
without fetching its full content.

PURPOSE:
Use this tool to get information ABOUT a document (size, word count, last modified)
without retrieving the actual content. Useful for assessing documents before reading them fully.

WHEN TO USE:
- To check document length before fetching full content
- To estimate reading time or complexity
- To verify a document exists and get basic info
- To check when documentation was last updated
- When you need document stats for comparison or reporting

WHEN NOT TO USE:
- When you need the actual document content (use getDocContent instead)
- For searching documents (use searchDocs instead)
- For listing multiple documents (use listDocs instead)

METADATA FIELDS EXPLAINED:
- wordCount: Total words in content body (excludes frontmatter)
  - Quick read: < 500 words
  - Medium: 500-1500 words
  - Long/detailed: > 1500 words

- charCount: Total characters (useful for token estimation)
  - Rough token estimate: charCount / 4 for English text

- lastModified: File modification timestamp
  - Recent = actively maintained documentation
  - Old = may need verification for accuracy

- size: Raw file size in bytes (includes frontmatter YAML)

USE CASES:
1. "Is this document long?" → Check wordCount
2. "Will this fit in context?" → Check charCount, estimate tokens
3. "Is this documentation current?" → Check lastModified
4. "Which document is more detailed?" → Compare wordCounts
`;

const ID_DESCRIPTION = `
Unique document identifier - the relative file path from the wiki root directory.

FORMAT: "<category>/<subcategory>/<filename>.md"

EXAMPLES:
- "get-started/quickstart.md"
- "references/components/http-server.md"
- "get-started/core-concepts/dependency-injection.md"

HOW TO OBTAIN:
- From searchDocs results (the 'id' field)
- From listDocs results (the 'id' field)

IMPORTANT:
- IDs are case-sensitive
- Must include the .md extension
- Invalid IDs return an error object
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const InputSchema = z.object({
  id: z.string().min(1).describe(ID_DESCRIPTION),
});

const OutputSchema = z.object({
  id: z.string().describe('The document ID that was requested.'),
  title: z.string().optional().describe('Document title from frontmatter or filename.'),
  category: z
    .string()
    .optional()
    .describe('Document category (e.g., "Getting Started", "References").'),
  wordCount: z
    .number()
    .int()
    .optional()
    .describe('Total words. Useful for reading time estimation.'),
  charCount: z.number().int().optional().describe('Total characters. Useful for token estimation.'),
  lastModified: z
    .string()
    .optional()
    .describe('Last modified timestamp (ISO string). May be undefined.'),
  size: z.number().int().optional().describe('File size in bytes. May be undefined.'),
  error: z.string().optional().describe('Error message if document not found.'),
});

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class GetDocMetadataTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'getDocumentMetadata';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(opts: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const metadata = await DocsHelper.getDocumentMetadata({ id: opts.id });

    if (!metadata) {
      return { error: 'Document not found', id: opts.id };
    }

    return {
      ...metadata,
      lastModified: metadata.lastModified?.toISOString(),
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
