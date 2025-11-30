import { createServer, McpRequest, McpResponse, McpError } from "@modelcontextprotocol/sdk";
import { glob } from "glob";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

const DOCS_DIR = path.resolve(process.cwd(), "packages", "docs");
const URI_SCHEME = "docs";

async function findMarkdownFiles(): Promise<string[]> {
  const files = await glob("**/*.md", {
    cwd: DOCS_DIR,
    nodir: true,
  });
  return files;
}

const server = createServer({
  port: 6270,
  host: "127.0.0.1",
});

server.addExecutor({
  resource: URI_SCHEME,
  
  // LIST handler
  list: async (_req: McpRequest, res: McpResponse) => {
    try {
      const files = await findMarkdownFiles();
      const uris = files.map(file => `${URI_SCHEME}://${file}`);
      res.stream(uris);
    } catch (error) {
      throw new McpError("INTERNAL_ERROR", "Failed to list documentation files.");
    }
  },

  // READ handler
  read: {
    schema: z.object({
      uri: z.string().startsWith(`${URI_SCHEME}://`),
    }),
    handler: async (req: McpRequest, res: McpResponse) => {
      const { uri } = req.params as { uri: string };
      const relativePath = uri.substring(`${URI_SCHEME}://`.length);
      const filePath = path.join(DOCS_DIR, relativePath);

      try {
        const content = await fs.readFile(filePath, "utf-8");
        res.json({ uri, content });
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new McpError("NOT_FOUND", `The requested document URI was not found: ${uri}`);
        }
        throw new McpError("INTERNAL_ERROR", `Failed to read document content for URI: ${uri}`);
      }
    },
  },
});

async function startServer() {
  try {
    const address = await server.listen();
    console.log(`MCP server listening on mcp://${address.host}:${address.port}`);
  } catch (err) {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  }
}

startServer();
