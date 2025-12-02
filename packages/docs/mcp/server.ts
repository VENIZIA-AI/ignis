// import {
//   Handler,
//   ListRequest,
//   ListResponse,
//   ReadRequest,
//   ReadResponse,
//   Resource,
//   Server,
// } from '@modelcontextprotocol/sdk';
// import { glob } from 'glob';
// import * as fs from 'node:fs';
// import path from 'node:path';
//
// const DOCS_ROOT = path.resolve(process.cwd(), 'packages/docs/wiki');
// const URI_SCHEME = 'docs';
//
// class FileHandler implements Handler {
//   private files: string[] = [];
//
//   async initialize() {
//     const pattern = path.join(DOCS_ROOT, '**/*.md');
//     this.files = await glob(pattern, { nodir: true });
//     console.log(`Found ${this.files.length} markdown files.`);
//   }
//
//   async list(_req: ListRequest): Promise<ListResponse> {
//     const resources: Resource[] = this.files.map(filePath => {
//       const relativePath = path.relative(DOCS_ROOT, filePath);
//       return {
//         uri: `${URI_SCHEME}://${relativePath}`,
//       };
//     });
//     return { resources };
//   }
//
//   async read(req: ReadRequest): Promise<ReadResponse> {
//     const url = new URL(req.uri);
//     if (url.protocol.replace(':', '') !== URI_SCHEME) {
//       throw new Error(`Unsupported URI scheme: ${url.protocol}`);
//     }
//
//     const relativePath = url.pathname.startsWith('//') ? url.pathname.substring(2) : url.pathname;
//     const filePath = path.join(DOCS_ROOT, relativePath);
//
//     if (!this.files.includes(filePath)) {
//       throw new Error(`File not found for URI: ${req.uri}`);
//     }
//
//     try {
//       const content = fs.readFileSync(filePath, 'utf-8');
//       return {
//         uri: req.uri,
//         content: content,
//       };
//     } catch (error) {
//       console.error(`Error reading file ${filePath}:`, error);
//       throw new Error(`Could not read file for URI: ${req.uri}`);
//     }
//   }
// }
//
// async function main() {
//   const server = new Server();
//   const fileHandler = new FileHandler();
//
//   await fileHandler.initialize();
//
//   server.registerHandler(URI_SCHEME, fileHandler);
//
//   const port = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3001;
//   server.listen(port);
//
//   console.log(`MCP Server is running on port ${port}`);
//   console.log(`Exposing resources with scheme '${URI_SCHEME}://'`);
// }
//
// main().catch(console.error);
