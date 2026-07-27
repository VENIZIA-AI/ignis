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

const mcpTools = {
  searchDocs: new SearchDocsTool().getTool(),
  getDocContent: new GetDocContentTool().getTool(),
  listDocs: new ListDocsTool().getTool(),
  listCategories: new ListCategoriesTool().getTool(),
  getDocMetadata: new GetDocMetadataTool().getTool(),
  getPackageOverview: new GetPackageOverviewTool().getTool(),

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

  getResourceContent: async ({ uri }: { uri: string }) => {
    const id = uri.replace('ignis://docs/', '');
    const content = await DocsHelper.getDocumentContent({ id });

    if (content === null) {
      return { text: `Resource not found: ${id}` };
    }

    return { text: content };
  },
};

const mcpServer = new MCPServer({
  id: MCPConfigs.server.name,
  name: MCPConfigs.server.name,
  version: MCPConfigs.server.version,
  tools: mcpTools,
  resources: mcpReosources,
});

const parseArgs = (): { branch: string } => {
  const args = process.argv.slice(2);
  const branch = args[0] || 'main';
  return { branch };
};

const main = async () => {
  const { branch } = parseArgs();
  MCPConfigs.setBranch({ branch });

  Logger.info('[main] Initializing IGNIS MCP Documentation Server...');
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

// A rejection escaping main() - one thrown before the try block, e.g. by parseArgs() - would
// otherwise surface as an unhandled rejection and take the process down with no diagnostic.
main().catch(error => {
  Logger.error('[main] Startup failed:', error);
  process.exit(1);
});
