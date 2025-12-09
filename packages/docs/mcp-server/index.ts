#!/usr/bin/env node
import { MCPServer } from '@mastra/mcp';
import { DocsHelper, Logger } from './helpers';
import {
  GetDocContentTool,
  GetDocMetadataTool,
  ListCategoriesTool,
  ListDocsTool,
  SearchDocsTool,
} from './tools';

// ----------------------------------------------------------------------------
// MCP SERVER CONFIGURATION
// ----------------------------------------------------------------------------

const mcpServer = new MCPServer({
  name: 'ignis-docs',
  version: '0.0.1',

  // Register tools using singleton instances
  tools: {
    search: new SearchDocsTool().getTool(),
    getDocContent: new GetDocContentTool().getTool(),
    listDocs: new ListDocsTool().getTool(),
    listCategories: new ListCategoriesTool().getTool(),
    getDocMetadata: new GetDocMetadataTool().getTool(),
  },

  // Resource handlers for direct document access
  resources: {
    listResources: async () => {
      const docs = await DocsHelper.loadDocumentation();

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
      const content = await DocsHelper.getDocContent({ id });

      if (content === null) {
        return { text: `Resource not found: ${id}` };
      }

      return { text: content };
    },
  },
});

// ----------------------------------------------------------------------------
// SERVER INITIALIZATION
// ----------------------------------------------------------------------------

const main = async () => {
  Logger.info('[main] Initializing Ignis MCP Documentation Server...');

  try {
    await DocsHelper.loadDocumentation();
    Logger.info('[main] Documentation loaded successfully.');

    await mcpServer.startStdio();
    Logger.info('[main] Server started in Stdio mode.');
  } catch (error) {
    Logger.error('Fatal error:', error);
    process.exit(1);
  }
};

main();
