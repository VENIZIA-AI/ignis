import type {
  IMailMessage,
  IMailSendResult,
  IMailTransport,
  IMailProcessorResult,
} from '@/components/mail/common';
import type { AnyType } from '@venizia/ignis-helpers';

/** In-memory transport: records what MailService hands to the wire, no SMTP, no network. */
export class FakeMailTransport implements IMailTransport {
  sentMessages: IMailMessage[] = [];
  closeCallCount = 0;

  constructor(
    private behaviour: {
      sendResult?: IMailSendResult;
      sendError?: Error;
      verifyResult?: boolean;
      verifyError?: Error;
    } = {},
  ) {}

  async send(message: IMailMessage): Promise<IMailSendResult> {
    this.sentMessages.push(message);

    if (this.behaviour.sendError) {
      throw this.behaviour.sendError;
    }

    return this.behaviour.sendResult ?? { success: true, messageId: 'fake-message-id' };
  }

  async verify(): Promise<boolean> {
    if (this.behaviour.verifyError) {
      throw this.behaviour.verifyError;
    }

    return this.behaviour.verifyResult ?? true;
  }

  async close(): Promise<void> {
    this.closeCallCount++;
  }
}

/** Captures every scoped log line so a test can assert nothing confidential was written. */
export class FakeLogger {
  lines: string[] = [];

  for(_scope: string) {
    const record = (message: AnyType, ...args: AnyType[]) => {
      this.lines.push([String(message), ...args.map(arg => JSON.stringify(arg))].join(' | '));
    };

    return { debug: record, info: record, warn: record, error: record };
  }
}

export const successProcessorResult: IMailProcessorResult = {
  success: true,
  message: 'sent',
  expiresInMinutes: 5,
};

/** Resolves once the processor has been invoked `expected` times (no sleep-and-hope). */
export class ProcessorCallTracker {
  calls: string[] = [];
  private waiters: Array<{ expected: number; resolve: () => void }> = [];

  record(email: string): void {
    this.calls.push(email);

    for (const waiter of [...this.waiters]) {
      if (this.calls.length < waiter.expected) {
        continue;
      }

      this.waiters = this.waiters.filter(candidate => candidate !== waiter);
      waiter.resolve();
    }
  }

  waitFor(opts: { expected: number }): Promise<void> {
    if (this.calls.length >= opts.expected) {
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      this.waiters.push({ expected: opts.expected, resolve });
    });
  }
}
