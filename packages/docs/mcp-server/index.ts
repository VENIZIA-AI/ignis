#!/usr/bin/env node
import { MCPServer } from '@mastra/mcp';
import { MCPConfigs } from './common';
import { DocsHelper, Logger } from './helpers';
import {
  GetDocContentTool,
  GetDocMetadataTool,
  GetPackageOverviewTool,
  ListCategoriesTool,
  ListDocsTool,
  ListProjectFilesTool,
  SearchCodeTool,
  SearchDocsTool,
  VerifyDependenciesTool,
  ViewSourceFileTool,
} from './tools';

// ----------------------------------------------------------------------------
// MCP SERVER CONFIGURATION
// ----------------------------------------------------------------------------

const mcpTools = {
  // Documentation Tools
  searchDocs: new SearchDocsTool().getTool(),
  getDocContent: new GetDocContentTool().getTool(),
  listDocs: new ListDocsTool().getTool(),
  listCategories: new ListCategoriesTool().getTool(),
  getDocMetadata: new GetDocMetadataTool().getTool(),
  getPackageOverview: new GetPackageOverviewTool().getTool(),

  // Code & Project Tools
  searchCode: new SearchCodeTool().getTool(),
  listProjectFiles: new ListProjectFilesTool().getTool(),
  viewSourceFile: new ViewSourceFileTool().getTool(),
  verifyDependencies: new VerifyDependenciesTool().getTool(),
};

const mcpReosources = {
  listResources: async () => {
    const docs = await DocsHelper.load();

    return docs.map(doc => {
      const wordCount = doc.content.split(/\s+/).filter(Boolean).length;

      return {
        uri: `ignis://docs/${doc.id}`,
        name: doc.title,
        description: `${doc.category} - ${wordCount} words`,
        mimeType: 'text/markdown',
      };
    });
  },

  getResourceContent: async ({ uri }) => {
    const id = uri.replace('ignis://docs/', '');
    const content = await DocsHelper.getDocumentContent({ id });

    if (content === null) {
      return { text: `Resource not found: ${id}` };
    }

    return { text: content };
  },
};

const mcpServer = new MCPServer({
  name: MCPConfigs.server.name,
  version: MCPConfigs.server.version,

  // Register tools using singleton instances
  tools: mcpTools,

  // Resource handlers for direct document access
  resources: mcpReosources,
});

// ----------------------------------------------------------------------------
// CLI ARGUMENT PARSING
// ----------------------------------------------------------------------------

/**
 * Parse CLI arguments for branch configuration.
 * Usage: node index.js [branch]
 * Example: node index.js develop
 * Default: main
 */
const parseArgs = (): { branch: string } => {
  const args = process.argv.slice(2);
  const branch = args[0] || 'main';
  return { branch };
};

// ----------------------------------------------------------------------------
// SERVER INITIALIZATION
// ----------------------------------------------------------------------------

const main = async () => {
  // Parse CLI arguments and configure branch
  const { branch } = parseArgs();
  MCPConfigs.setBranch({ branch });

  Logger.info('[main] Initializing Ignis MCP Documentation Server...');
  Logger.info(`[main] GitHub branch: ${MCPConfigs.github.branch}`);

  try {
    await DocsHelper.load();
    Logger.info('[main] Documentation loaded successfully.');

    await mcpServer.startStdio();
    Logger.info('[main] Server started in Stdio mode.');
  } catch (error) {
    Logger.error('Fatal error:', error);
    process.exit(1);
  }
};

main();
