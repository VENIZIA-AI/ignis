import { GithubHelper } from '@/mcp-server/helpers';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BaseTool, TMastraTool } from '../base.tool';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Retrieves the full source code content of a specific file from the Ignis GitHub repository.

PURPOSE:
Read contents of a source file. Primary method for inspecting implementation details,
understanding logic, and viewing exact code.

WHEN TO USE:
- After finding a relevant file with listProjectFiles or searchCode
- When you need to see implementation of a specific class, function, or component
- To verify details not present in documentation
- To extract specific code examples or snippets

WHEN NOT TO USE:
- For discovering files (use listProjectFiles to browse, or searchCode to find by keyword)
- Do not use on non-text files (images, binaries) or very large files unless necessary
- For documentation content (use getDocContent instead)
`;

const FILE_PATH_DESCRIPTION = `
The full path to the file from the root of the repository.

HOW TO OBTAIN:
- Use listProjectFiles to browse the project and find valid file paths
- Use searchCode to find files containing specific keywords or patterns
- Navigate from root directory down to the specific file

EXAMPLES:
- "packages/core/src/application.ts"
- "examples/5-mins-qs/src/index.ts"
- "package.json"
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const InputSchema = z.object({
  filePath: z.string().min(1).describe(FILE_PATH_DESCRIPTION),
});

const OutputSchema = z.object({
  filePath: z.string(),
  content: z.string().optional().describe('The full source code content of the file.'),
  error: z
    .string()
    .optional()
    .describe('An error message if the file could not be read (e.g., not found).'),
});

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class ViewSourceFileTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'viewSourceFile';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(opts: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const result = await GithubHelper.getFileContent({ filePath: opts.filePath });

    if ('error' in result) {
      return {
        filePath: opts.filePath,
        error: result.error,
      };
    }

    return {
      filePath: opts.filePath,
      content: result.content,
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
