import type {
  ChatMessage,
  ListUsersRequest,
  LogEntry,
  SayHelloRequest,
  StreamEventsRequest,
} from "@/controllers/greeter/definition";
import { BaseService } from "@venizia/ignis";

export interface IUser {
  id: string;
  name: string;
  email: string;
}

export interface IEvent {
  sequence: number;
  message: string;
  timestamp: string;
}

export interface ILogSummary {
  totalEntries: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
}

export interface IChatResponse {
  user: string;
  text: string;
  serverTimestamp: string;
  messageNumber: number;
}

export class GreeterService extends BaseService {
  constructor() {
    super({ scope: "GreeterService" });
  }

  async sayHello(opts: { request: SayHelloRequest }): Promise<string> {
    const name = opts.request.name || "World";
    return `Hello, ${name}!`;
  }

  async listUsers(_opts: { request: ListUsersRequest }): Promise<IUser[]> {
    return [
      { id: "1", name: "Alice", email: "alice@example.com" },
      { id: "2", name: "Bob", email: "bob@example.com" },
      { id: "3", name: "Charlie", email: "charlie@example.com" },
    ];
  }

  async *streamEvents(opts: {
    request: StreamEventsRequest;
  }): AsyncGenerator<IEvent> {
    const count = opts.request.count || 5;

    for (let i = 1; i <= count; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));

      yield {
        sequence: i,
        message: `Event #${i} of ${count}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async collectLogs(opts: {
    request: AsyncIterable<LogEntry>;
  }): Promise<ILogSummary> {
    let totalEntries = 0;
    let errorCount = 0;
    let warnCount = 0;
    let infoCount = 0;

    for await (const entry of opts.request) {
      totalEntries++;
      switch (entry.level) {
        case "error": {
          errorCount++;
          break;
        }
        case "warn": {
          warnCount++;
          break;
        }
        case "info": {
          infoCount++;
          break;
        }
      }
    }

    return { totalEntries, errorCount, warnCount, infoCount };
  }

  async *chat(opts: {
    request: AsyncIterable<ChatMessage>;
  }): AsyncGenerator<IChatResponse> {
    let messageNumber = 0;

    for await (const msg of opts.request) {
      messageNumber++;

      yield {
        user: msg.user,
        text: `Echo: ${msg.text}`,
        serverTimestamp: new Date().toISOString(),
        messageNumber,
      };
    }
  }
}
