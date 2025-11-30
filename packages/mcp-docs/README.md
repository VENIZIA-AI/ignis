# Ignis MCP Docs Server

This package provides a Model Context Protocol (MCP) server for the Ignis framework documentation. It scans the markdown files in the `packages/docs` directory and exposes them as MCP resources.

## Installation

To get started, install the dependencies using `bun`:

```bash
bun install
```

## Development

To run the server in development mode with hot-reloading, use:

```bash
bun run dev
```

The server will be available at `mcp://127.0.0.1:6270`.

## Building for Production

To build the TypeScript source code for production, run:

```bash
bun run build
```

## Running in Production

After building, you can start the server in production mode with:

```bash
bun run start
```
