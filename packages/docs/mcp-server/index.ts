import { MCPServer } from '@mastra/mcp';
import * as tools from './tools';
import * as docsLoader from './lib/docs-loader';

const myDocsServer = new MCPServer({
  name: 'my-lib-docs',
  version: '0.0.1',
  tools: {
    search: tools.searchDocsTool,
  },
  resources: {
    listResources: async () => {
      const docs = await docsLoader.loadDocumentation();
      return docs.map(doc => ({
        uri: `docs://${doc.id}`,
        name: doc.title,
      }));
    },
    getResourceContent: async ({ uri }) => {
      const id = uri.replace('docs://', '');
      const content = await docsLoader.getDocContent(id);
      if (content === null) {
        return { text: 'Resource not found' };
      }
      return { text: content };
    },
  },
});

const main = async () => {
  console.log('Initializing MCP Server...');
  await docsLoader.loadDocumentation();
  console.log('Documentation loaded.');

  console.log('Starting in Stdio mode...');
  await myDocsServer.startStdio();
}

main().catch(console.error);
