import { z } from "zod";
import { DocsHelper } from "../helpers";
import { BaseTool, createTool, type TMastraTool } from "./base.tool";

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Retrieves the complete markdown content of a specific Ignis Framework documentation file.

PURPOSE:
Use this tool to fetch the full text of a documentation page when you need detailed information
beyond what search snippets provide. This is your primary tool for reading documentation content.

WHEN TO USE:
- After searchDocs returns relevant results and you need full content
- When user asks for detailed explanation of a specific topic
- To read code examples, API references, or configuration guides
- When you need to quote or reference specific documentation sections

WHEN NOT TO USE:
- Don't use this for discovery - use searchDocs or listDocs first
- Don't fetch multiple documents blindly - review search results first

DOCUMENT ID FORMAT:
The 'id' parameter is the relative file path from the wiki root:
- "get-started/quickstart.md" - Quickstart guide
- "references/components/http-server.md" - HTTP Server component reference
- "get-started/core-concepts/dependency-injection.md" - DI concepts

HOW TO GET VALID IDs:
1. Use searchDocs to find documents by keyword
2. Use listDocs to browse all available documents
3. Use listCategories + listDocs(category) for structured browsing

OUTPUT:
Returns full markdown content suitable for:
- Answering user questions with accurate information
- Extracting code examples
- Understanding API usage patterns
- Providing step-by-step guidance
`;

const ID_DESCRIPTION = `
Unique document identifier - the relative file path from the wiki root directory.

FORMAT: "<category>/<subcategory>/<filename>.md"

EXAMPLES:
- "get-started/quickstart.md"
- "get-started/core-concepts/dependency-injection.md"
- "references/components/http-server.md"
- "references/helpers/redis.md"

HOW TO OBTAIN:
- From searchDocs results (the 'id' field)
- From listDocs results (the 'id' field)

IMPORTANT:
- IDs are case-sensitive
- Must include the .md extension
- Invalid IDs return an error object instead of content
`;

const CONTENT_DESCRIPTION = `
Full markdown content of the documentation file.

CONTENT FORMAT:
- Raw markdown text without frontmatter (frontmatter is parsed separately)
- Includes all headings, code blocks, lists, links, and other markdown elements
- May contain Mermaid diagrams in fenced code blocks
- Internal links use relative paths

TYPICAL STRUCTURE:
- H1 heading as document title
- Introduction/overview paragraph
- Multiple H2/H3 sections with detailed content
- Code examples in fenced blocks with language hints
- Cross-references to related documentation
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const InputSchema = z.object({
  id: z.string().min(1).describe(ID_DESCRIPTION),
});

const OutputSchema = z.object({
  id: z.string().describe("The document ID that was requested."),
  content: z.string().optional().describe(CONTENT_DESCRIPTION),
  error: z
    .string()
    .optional()
    .describe("Error message if document not found. Verify the ID using listDocs or searchDocs."),
});

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class GetDocContentTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = "getDocContent";
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(input: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const content = await DocsHelper.getDocContent({ id: input.id });

    if (!content) {
      return { error: "Document not found", id: input.id };
    }

    return { content, id: input.id };
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
