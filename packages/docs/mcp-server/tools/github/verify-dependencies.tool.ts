import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BaseTool, TMastraTool } from '../base.tool';
import { GithubHelper, Logger } from '@/mcp-server/helpers';

// ----------------------------------------------------------------------------
// DESCRIPTIONS
// ----------------------------------------------------------------------------

const TOOL_DESCRIPTION = `
Verifies dependencies of a package within the Ignis monorepo against NPM registry.

PURPOSE:
Check for outdated dependencies. Reads package.json from a specific package,
fetches latest version for each dependency from NPM registry, and reports
which packages may need updating.

WHEN TO USE:
- To assess maintenance status of a package
- To identify potential security risks from outdated dependencies
- Before starting development, to see what needs updating
- To answer user questions about package dependencies

WHEN NOT TO USE:
- This tool can be slow as it makes multiple network requests to NPM
- For workspace dependencies (e.g., "workspace:*") - these are internal references

NOTE: Version comparison is simplified (string comparison). Complex version ranges
or intentionally pinned versions may show as "outdated" even when correct.
`;

const PACKAGE_PATH_DESCRIPTION = `
The path to the package directory from the repository root.
This directory must contain a 'package.json' file.

EXAMPLES:
- "packages/core"
- "packages/helpers"
- "examples/5-mins-qs"
`;

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------

const DependencyInfoSchema = z.object({
  name: z.string(),
  currentVersion: z.string(),
  latestVersion: z.string(),
  isOutdated: z.boolean(),
});

const InputSchema = z.object({
  packagePath: z.string().describe(PACKAGE_PATH_DESCRIPTION),
});

const OutputSchema = z.object({
  packageName: z.string().optional(),
  dependencies: z.array(DependencyInfoSchema).optional(),
  devDependencies: z.array(DependencyInfoSchema).optional(),
  error: z.string().optional(),
});

interface INpmRegistryResponse {
  version?: string;
  [key: string]: any;
}

// ----------------------------------------------------------------------------
// TOOL CLASS
// ----------------------------------------------------------------------------

export class VerifyDependenciesTool extends BaseTool<typeof InputSchema, typeof OutputSchema> {
  readonly id = 'verifyDependencies';
  readonly description = TOOL_DESCRIPTION;
  readonly inputSchema = InputSchema;
  readonly outputSchema = OutputSchema;

  private async getLatestVersion(opts: { packageName: string }): Promise<string> {
    try {
      const url = `https://registry.npmjs.org/${opts.packageName}/latest`;
      const response = await fetch(url);
      if (!response.ok) {
        return 'unknown';
      }
      const data = (await response.json()) as INpmRegistryResponse;
      return data.version || 'unknown';
    } catch (error) {
      Logger.warn(`Could not fetch latest version for ${opts.packageName}:`, error);
      return 'unknown';
    }
  }

  /**
   * Extracts a clean semver version from various version specifiers.
   * Returns null for non-standard versions that can't be compared.
   */
  private parseVersion(opts: { version: string }): string | null {
    // Skip workspace, file, git, and URL references
    if (
      opts.version.startsWith('workspace:') ||
      opts.version.startsWith('file:') ||
      opts.version.startsWith('git') ||
      opts.version.startsWith('http') ||
      opts.version === '*' ||
      opts.version === 'latest'
    ) {
      return null;
    }

    // Remove common prefixes: ^, ~, >=, >, <=, <, =
    const cleaned = opts.version.replace(/^[\^~>=<]+/, '').trim();

    // Handle version ranges (e.g., "1.0.0 || 2.0.0", ">=1.0.0 <2.0.0")
    // Just take the first version-like string
    const semverMatch = cleaned.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    return semverMatch ? semverMatch[1] : null;
  }

  private async processDependencies(opts: { deps?: Record<string, string> }) {
    if (!opts.deps) return [];

    const results: z.infer<typeof DependencyInfoSchema>[] = [];
    for (const [name, version] of Object.entries(opts.deps)) {
      const parsedVersion = this.parseVersion({ version });

      // Skip non-standard versions
      if (!parsedVersion) {
        results.push({
          name,
          currentVersion: version,
          latestVersion: 'N/A',
          isOutdated: false,
        });
        continue;
      }

      const latestVersion = await this.getLatestVersion({ packageName: name });
      results.push({
        name,
        currentVersion: parsedVersion,
        latestVersion,
        isOutdated: latestVersion !== 'unknown' && parsedVersion !== latestVersion,
      });
    }
    return results;
  }

  async execute(opts: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
    const packageJsonPath = `${opts.packagePath}/package.json`;
    const result = await GithubHelper.getFileContent({ filePath: packageJsonPath });

    if ('error' in result) {
      return { error: `Could not read package.json at ${packageJsonPath}. Error: ${result.error}` };
    }

    try {
      const packageJson = JSON.parse(result.content);
      const [dependencies, devDependencies] = await Promise.all([
        this.processDependencies({ deps: packageJson.dependencies }),
        this.processDependencies({ deps: packageJson.devDependencies }),
      ]);

      return {
        packageName: packageJson.name,
        dependencies,
        devDependencies,
      };
    } catch (e) {
      return { error: `Failed to parse package.json at ${packageJsonPath}.` };
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
