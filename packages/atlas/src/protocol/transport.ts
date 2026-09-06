import { AtlasConstants, ProtocolVersions } from '@/common';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { RpcError, RpcErrorCodes } from './common';
import type { IRpcRequest, IRpcResponse, IToolHandler } from './common';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const readId = (value: unknown): number | string | undefined =>
  typeof value === 'number' || typeof value === 'string' ? value : undefined;

/** Tolerant by design: a field of the wrong shape reads as absent rather than throwing. */
const readRequest = (parsed: unknown): IRpcRequest => {
  if (!isRecord(parsed)) {
    return {};
  }

  return {
    id: readId(parsed.id),
    method: readString(parsed.method),
    params: isRecord(parsed.params) ? parsed.params : undefined,
  };
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Newline-delimited JSON-RPC 2.0 over stdio (the MCP stdio transport). `handleLine` is pure
 * request-in/reply-out so it is testable without touching real stdio; only `run()` writes to
 * stdout, and only with a fully-formed reply line.
 */
export class Transport extends BaseHelper {
  private readonly tools: IToolHandler[];
  private readonly serverName: string;
  private readonly serverVersion: string;

  constructor(opts: { tools: IToolHandler[]; serverName: string; serverVersion: string }) {
    super({ scope: Transport.name });

    this.tools = opts.tools;
    this.serverName = opts.serverName;
    this.serverVersion = opts.serverVersion;
  }

  /** Parses one line, routes it, and returns the reply to send - or `null` for a notification. Never throws. */
  async handleLine(opts: { line: string }): Promise<string | null> {
    const trimmed = opts.line.trim();
    if (!trimmed) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      this.logger.for('handleLine').error(`dropped malformed JSON-RPC line: ${messageOf(error)}`);
      return this.errorReply({ id: null, code: RpcErrorCodes.PARSE, message: messageOf(error) });
    }

    return this.route(readRequest(parsed));
  }

  /** Reads stdin line by line and writes each non-null reply to stdout; every diagnostic goes to stderr. */
  async run(): Promise<void> {
    let buffer = '';
    process.stdin.setEncoding('utf8');

    for await (const chunk of process.stdin) {
      if (typeof chunk === 'string') {
        buffer += chunk;
      }

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');

        const reply = await this.handleLine({ line });
        if (reply !== null) {
          process.stdout.write(`${reply}\n`);
        }
      }
    }
  }

  private async route(request: IRpcRequest): Promise<string | null> {
    switch (request.method) {
      case 'initialize': {
        const requested = readString(request.params?.protocolVersion);
        const protocolVersion =
          requested && ProtocolVersions.isValid(requested)
            ? requested
            : AtlasConstants.PROTOCOL_VERSION;
        return this.reply({
          id: request.id,
          result: {
            protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: this.serverName, version: this.serverVersion },
          },
        });
      }

      case 'tools/list': {
        return this.reply({
          id: request.id,
          result: { tools: this.tools.map(tool => tool.definition) },
        });
      }

      case 'tools/call': {
        return this.callTool(request);
      }

      case 'ping': {
        return this.reply({ id: request.id, result: {} });
      }

      default: {
        // Notifications (no id) get no reply; unknown requests get method-not-found.
        if (request.id === undefined) {
          return null;
        }

        return this.errorReply({
          id: request.id,
          code: RpcErrorCodes.METHOD_NOT_FOUND,
          message: `method not found: ${request.method ?? ''}`,
        });
      }
    }
  }

  private async callTool(request: IRpcRequest): Promise<string> {
    const name = readString(request.params?.name) ?? '';
    const handler = this.tools.find(tool => tool.definition.name === name);

    // MCP maps an unknown tool name to invalid params, not an internal error.
    if (!handler) {
      return this.errorReply({
        id: request.id,
        code: RpcErrorCodes.INVALID_PARAMS,
        message: `unknown tool: ${name}`,
      });
    }

    try {
      const result = await handler.call({ args: request.params?.arguments });
      return this.reply({
        id: request.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
      });
    } catch (error) {
      this.logger
        .for(this.callTool.name)
        .error('Tool call failed | tool: %s | error: %s', name, error);

      // A tool's own RpcError already carries the JSON-RPC code it wants reported.
      if (error instanceof RpcError) {
        return this.errorReply({ id: request.id, code: error.code, message: error.message });
      }

      return this.errorReply({
        id: request.id,
        code: RpcErrorCodes.INTERNAL,
        message: messageOf(error),
      });
    }
  }

  private reply(opts: { id: number | string | undefined; result: unknown }): string {
    const response: IRpcResponse = { jsonrpc: '2.0', id: opts.id ?? null, result: opts.result };
    return JSON.stringify(response);
  }

  private errorReply(opts: {
    id: number | string | null | undefined;
    code: number;
    message: string;
  }): string {
    const response: IRpcResponse = {
      jsonrpc: '2.0',
      id: opts.id ?? null,
      error: { code: opts.code, message: opts.message },
    };
    return JSON.stringify(response);
  }
}
