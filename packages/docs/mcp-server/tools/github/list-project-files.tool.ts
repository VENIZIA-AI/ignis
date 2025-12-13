import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BaseTool, TMastraTool } from '../base.tool';
import { GithubHelper } from '@/mcp-server/helpers';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Lists files and directories within the Ignis GitHub repository.

PURPOSE:
Explore the project structure, discover source code files, and navigate the monorepo.
Primary tool for understanding codebase layout before reading specific files.

WHEN TO USE:
- To understand overall project structure
- To find location of specific modules (e.g., "where are the controllers?")
- To get list of files in a directory before using viewSourceFile
- To find configuration files, examples, or documentation

WHEN NOT TO USE:
- When searching for specific code patterns or keywords (use searchCode instead)
- When you need to read a file's content (use viewSourceFile instead)
- For documentation content (use searchDocs, listDocs, getDocContent instead)

WORKFLOW:
1. Start at root: listProjectFiles()
2. Explore a package: listProjectFiles({ directoryPath: "packages/core/src" })
3. Identify a file of interest
4. Read the file: viewSourceFile({ filePath: "packages/core/src/application.ts" })
`;

const DIRECTORY_PATH_DESCRIPTION = `
The path to the directory you want to list, relative to the project root.
If omitted, it defaults to the root of the repository.

EXAMPLES:
- "." (or omitted) -> lists the root directory
- "packages" -> lists the contents of the 'packages' directory
- "packages/core/src" -> lists the source files of the core package
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const InputSchema = z.object({
  directoryPath: z.string().default('.').describe(DIRECTORY_PATH_DESCRIPTION),
});

const OutputSchema = z.object({
  directoryPath: z.string(),
  files: z.array(z.string()).describe('A list of file names within the specified directory.'),
  directories: z
    .array(z.string())
    .describe('A list of subdirectory names within the specified directory.'),
  error: z.string().optional().describe('An error message if the directory could not be listed.'),
});

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class ListProjectFilesTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'listProjectFiles';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  async execute(opts: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const contents = await GithubHelper.getDirectoryContents({ path: opts.directoryPath });

    if ('error' in contents) {
      return {
        directoryPath: opts.directoryPath,
        files: [],
        directories: [],
        error: contents.error,
      };
    }

    const files = contents.filter(item => item.type === 'file').map(item => item.name);

    const directories = contents.filter(item => item.type === 'dir').map(item => item.name);

    return {
      directoryPath: opts.directoryPath,
      files,
      directories,
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
