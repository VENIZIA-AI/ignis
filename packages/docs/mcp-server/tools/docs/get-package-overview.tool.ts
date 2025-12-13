import { createTool } from '@mastra/core/tools';
import fg from 'fast-glob';
import matter from 'gray-matter';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Paths } from '../../common';
import { Logger } from '../../helpers';
import { BaseTool, type TMastraTool } from '../base.tool';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Returns an overview of Ignis packages from the source details documentation.

PURPOSE:
Provides AI agents with comprehensive understanding of the Ignis monorepo structure,
package purposes, main exports, and directory layouts. This is essential for helping
users understand which package to use for specific features.

WHEN TO USE:
- When user asks "what packages does Ignis have?"
- When user needs to understand project structure
- When user asks which package provides a specific feature
- Before helping user implement a feature (to know where code should go)
- When user asks about imports or package dependencies

WHEN NOT TO USE:
- For specific API documentation (use getDocContent with references/ docs)
- For code examples (use searchCode or getDocContent)
- For troubleshooting (use searchDocs)

OUTPUT:
Returns package name, description, main directories, and key components.
The content comes from wiki/references/src-details/ documentation.
`;

const PACKAGE_NAME_DESCRIPTION = `
Optional: Name of specific package to get details for.

VALID VALUES:
- "core" - @venizia/ignis main framework
- "helpers" - @venizia/ignis-helpers utility helpers
- "inversion" - @venizia/ignis-inversion DI container
- "dev-configs" - @venizia/dev-configs ESLint, Prettier, TSConfig
- "docs" - Documentation package
- "mcp-server" - MCP documentation server

If not provided, returns overview of ALL packages.
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const PackageInfoSchema = z.object({
  name: z.string().describe('Package name (e.g., "core", "helpers")'),
  npmName: z.string().describe('NPM package name (e.g., "@venizia/ignis")'),
  description: z.string().describe('Brief description of package purpose'),
  directories: z
    .array(
      z.object({
        name: z.string(),
        purpose: z.string(),
      }),
    )
    .describe('Main directories and their purposes'),
  content: z.string().optional().describe('Full markdown content if single package requested'),
});

const InputSchema = z.object({
  packageName: z.string().optional().describe(PACKAGE_NAME_DESCRIPTION),
});

const OutputSchema = z.object({
  packages: z.array(PackageInfoSchema).describe('List of package overviews'),
  error: z.string().optional().describe('Error message if operation failed'),
});

// ----------------------------------------------------------------------------
// PACKAGE MAPPING
// ----------------------------------------------------------------------------

const PACKAGE_NPM_NAMES: Record<string, string> = {
  core: '@venizia/ignis',
  helpers: '@venizia/ignis-helpers',
  inversion: '@venizia/ignis-inversion',
  'dev-configs': '@venizia/dev-configs',
  docs: '@venizia/ignis-docs',
  'mcp-server': '@venizia/ignis-docs (MCP Server)',
};

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class GetPackageOverviewTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'getPackageOverview';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  /**
   * Extracts package description from first paragraph after title
   */
  private extractDescription(opts: { content: string }): string {
    const lines = opts.content.split('\n');
    let bFoundTitle = false;
    const descLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        bFoundTitle = true;
        continue;
      }

      if (bFoundTitle && line.trim() === '') {
        if (descLines.length > 0) {
          break;
        }

        continue;
      }

      if (bFoundTitle && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('-')) {
        descLines.push(line.trim());
        if (descLines.length >= 2) {
          break;
        }
      }
    }

    return descLines.join(' ').slice(0, 300) || 'No description available';
  }

  /**
   * Extracts directory table from markdown content
   */
  private extractDirectories(opts: { content: string }): Array<{ name: string; purpose: string }> {
    const directories: Array<{ name: string; purpose: string }> = [];
    const lines = opts.content.split('\n');

    let isInTable = false;
    let isHeaderPassed = false;

    for (const line of lines) {
      // Look for tables with Directory/Folder column
      if (line.includes('| Directory') || line.includes('| Folder') || line.includes('| **`')) {
        isInTable = true;
        continue;
      }

      if (isInTable && line.startsWith('|---')) {
        isHeaderPassed = true;
        continue;
      }

      if (isInTable && isHeaderPassed && line.startsWith('|')) {
        const cells = line
          .split('|')
          .map(c => c.trim())
          .filter(Boolean);
        if (cells.length >= 2) {
          const dirName = cells[0].replace(/\*\*/g, '').replace(/`/g, '').trim();
          const purpose = cells[1].replace(/\*\*/g, '').slice(0, 150);
          if (dirName && !dirName.includes('---')) {
            directories.push({ name: dirName, purpose });
          }
        }
      }

      // Stop at next section
      if (isInTable && isHeaderPassed && (line.startsWith('##') || line.startsWith('---'))) {
        break;
      }
    }

    return directories.slice(0, 10); // Limit to top 10 directories
  }

  async execute(opts: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const srcDetailsPath = Paths.SOURCE_DETAILS;

    try {
      // Get specific package or all packages
      const pattern = opts.packageName ? `${opts.packageName}.md` : '*.md';
      const files = await fg(pattern, {
        cwd: srcDetailsPath,
        absolute: true,
      });

      if (files.length === 0) {
        return {
          packages: [],
          error: opts.packageName
            ? `Package "${opts.packageName}" not found. Valid: core, helpers, inversion, dev-configs, docs, mcp-server`
            : 'No package documentation found',
        };
      }

      const packages = await Promise.all(
        files.map(async file => {
          const rawContent = await fs.readFile(file, 'utf-8');
          const { content } = matter(rawContent);
          const baseName = path.basename(file, '.md');

          const packageInfo: z.infer<typeof PackageInfoSchema> = {
            name: baseName,
            npmName: PACKAGE_NPM_NAMES[baseName] || `@venizia/ignis-${baseName}`,
            description: this.extractDescription({ content }),
            directories: this.extractDirectories({ content }),
          };

          // Include full content only if single package requested
          if (opts.packageName) {
            packageInfo.content = content;
          }

          return packageInfo;
        }),
      );

      // Sort by package name
      packages.sort((a, b) => a.name.localeCompare(b.name));

      return { packages };
    } catch (error) {
      Logger.error('Failed to get package overview:', error);
      return {
        packages: [],
        error: `Failed to load package overview: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
