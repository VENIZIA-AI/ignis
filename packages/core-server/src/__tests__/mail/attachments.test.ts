import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import {
  createReadStream,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  MailKeys,
  type IMailMessage,
  type IMailTransport,
  type TMailOptions,
} from '@/components/mail/common';
import { MailComponent } from '@/components/mail/component';
import { Container } from '@venizia/ignis-kernel';
import {
  AmazonSesTransportHelper,
  MailgunTransportHelper,
  NodemailerTransportHelper,
} from '@/components/mail/helpers/transporters';
import { MailService } from '@/components/mail/services';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { FakeMailTransport } from './fakes';

const PATH_REFUSED = 'core.mail.attachment_path_refused';
const TOO_LARGE = 'core.mail.attachment_too_large';
const SECRET_MARKER = 'top-secret-marker-7f3a';

let scratchDirectory: string;
let attachmentRoot: string;
let secretFile: string;

beforeAll(() => {
  scratchDirectory = mkdtempSync(join(tmpdir(), 'ignis-mail-attachments-'));
  attachmentRoot = join(scratchDirectory, 'root');
  mkdirSync(join(attachmentRoot, 'invoices'), { recursive: true });

  secretFile = join(scratchDirectory, 'secret.txt');
  writeFileSync(secretFile, SECRET_MARKER);
  writeFileSync(join(attachmentRoot, 'invoices', 'march.txt'), 'invoice body');
  writeFileSync(join(attachmentRoot, 'big.bin'), Buffer.alloc(2048, 1));
  symlinkSync(secretFile, join(attachmentRoot, 'escape-link.txt'));
});

afterAll(() => {
  rmSync(scratchDirectory, { recursive: true, force: true });
});

/** Counts reads through an opened `FileHandle` - whole-file or streamed - the only ways a path is read. */
const spyOnFileReads = async () => {
  const handle = await open(secretFile);
  const prototype = Object.getPrototypeOf(handle);
  await handle.close();

  const readFileSpy = spyOn(prototype, 'readFile');
  const createReadStreamSpy = spyOn(prototype, 'createReadStream');

  return {
    count: () => readFileSpy.mock.calls.length + createReadStreamSpy.mock.calls.length,
    wholeFileReads: () => readFileSpy.mock.calls.length,
    restore: () => {
      readFileSpy.mockRestore();
      createReadStreamSpy.mockRestore();
    },
  };
};

let fileReadSpy: Awaited<ReturnType<typeof spyOnFileReads>> | undefined;

afterEach(() => {
  fileReadSpy?.restore();
  fileReadSpy = undefined;
});

const buildMessage = (attachments: IMailMessage['attachments']): IMailMessage => {
  return { to: 'a@b.com', subject: 'Hi', text: 'body', attachments };
};

const buildService = (opts?: { attachmentRoot?: string; maxAttachmentBytes?: number }) => {
  const transport = new FakeMailTransport();
  const options: TMailOptions = {
    provider: 'custom',
    config: transport,
    from: 'sender@example.com',
    attachmentRoot: opts?.attachmentRoot,
    maxAttachmentBytes: opts?.maxAttachmentBytes,
  };

  return { service: new MailService(options, transport), transport };
};

const captureError = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

const expectRefusal = (opts: { error: AnyType; code: string; statusCode: number }) => {
  expect(opts.error).toBeDefined();
  expect(opts.error.statusCode).toBe(opts.statusCode);
  expect(opts.error.normalized.code).toBe(opts.code);
};

/** Yields fixed-size chunks and counts how many were pulled, so a test can prove a drain stopped early. */
const buildCountingStream = (opts: { chunkBytes: number; chunkCount: number }) => {
  const counter = { pulledChunks: 0 };
  const generate = function* () {
    for (let index = 0; index < opts.chunkCount; index++) {
      counter.pulledChunks++;
      yield Buffer.alloc(opts.chunkBytes, 1);
    }
  };

  return { stream: Readable.from(generate()), counter };
};

describe('Mail attachments - path confinement', () => {
  test('a path is refused when no attachmentRoot is configured', async () => {
    const { service, transport } = buildService();

    const error = await captureError(
      service.send(buildMessage([{ filename: 'passwd', path: '/etc/passwd' }])),
    );

    expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
    expect(transport.sentMessages).toHaveLength(0);
  });

  test('the refusal names the fix and leaks no filesystem path', async () => {
    const { service } = buildService({ attachmentRoot });

    const error: AnyType = await captureError(
      service.send(buildMessage([{ filename: 'x', path: '../secret.txt' }])),
    );

    expect(error.message).toContain('attachmentRoot');
    expect(error.message).toContain('content');
    expect(error.message).not.toContain(scratchDirectory);
  });

  test('a `..` escape from the root is refused', async () => {
    const { service, transport } = buildService({ attachmentRoot });

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', path: '../secret.txt' }])),
    );

    expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
    expect(transport.sentMessages).toHaveLength(0);
  });

  test('an absolute path outside the root is refused', async () => {
    const { service } = buildService({ attachmentRoot });

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', path: secretFile }])),
    );

    expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
  });

  test('a symlink inside the root that points outside it is refused', async () => {
    const { service, transport } = buildService({ attachmentRoot });
    fileReadSpy = await spyOnFileReads();

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', path: 'escape-link.txt' }])),
    );

    expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
    expect(transport.sentMessages).toHaveLength(0);
    expect(fileReadSpy?.count()).toBe(0);
  });

  test('a missing file answers the same refusal as an escape, so existence cannot be probed', async () => {
    const { service } = buildService({ attachmentRoot });

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', path: 'does-not-exist.txt' }])),
    );

    expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
  });

  test('a directory inside the root is refused', async () => {
    const { service } = buildService({ attachmentRoot });

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', path: 'invoices' }])),
    );

    expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
  });

  test('a file inside the root is read and handed over as content, with no path left', async () => {
    const { service, transport } = buildService({ attachmentRoot });
    fileReadSpy = await spyOnFileReads();

    const result = await service.send(
      buildMessage([
        { filename: 'march.txt', path: 'invoices/march.txt', contentType: 'text/plain' },
      ]),
    );

    expect(result.success).toBe(true);
    const [sent] = transport.sentMessages;
    const [attachment] = sent.attachments ?? [];
    expect(attachment.path).toBeUndefined();
    expect(Object.keys(attachment)).not.toContain('path');
    expect(attachment.filename).toBe('march.txt');
    expect(attachment.contentType).toBe('text/plain');
    expect(Buffer.isBuffer(attachment.content)).toBe(true);
    expect(attachment.content?.toString()).toBe('invoice body');
    expect(fileReadSpy?.count()).toBe(1);
  });

  test('an absolute path that lands inside the root is accepted', async () => {
    const { service, transport } = buildService({ attachmentRoot });

    await service.send(
      buildMessage([
        { filename: 'march.txt', path: join(attachmentRoot, 'invoices', 'march.txt') },
      ]),
    );

    expect(transport.sentMessages[0].attachments?.[0].content?.toString()).toBe('invoice body');
  });

  test('nodemailer `href` and `raw` sources are refused, they bypass the root', async () => {
    const { service, transport } = buildService({ attachmentRoot });

    const hrefError = await captureError(
      service.send(buildMessage([{ filename: 'x', href: 'http://169.254.169.254/latest' }])),
    );
    const rawError = await captureError(
      service.send(buildMessage([{ filename: 'x', raw: { path: secretFile } }])),
    );

    expectRefusal({ error: hrefError, code: PATH_REFUSED, statusCode: 400 });
    expectRefusal({ error: rawError, code: PATH_REFUSED, statusCode: 400 });
    expect(transport.sentMessages).toHaveLength(0);
  });
});

describe('Mail attachments - size limit', () => {
  test('an oversized Buffer is refused', async () => {
    const { service, transport } = buildService({ maxAttachmentBytes: 1024 });

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', content: Buffer.alloc(1025) }])),
    );

    expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });
    expect(transport.sentMessages).toHaveLength(0);
  });

  test('an oversized string is refused, measured in encoded bytes', async () => {
    const { service } = buildService({ maxAttachmentBytes: 1024 });

    // 600 two-byte characters: 600 string units, 1200 UTF-8 bytes.
    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', content: 'é'.repeat(600) }])),
    );

    expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });
  });

  test('an oversized stream is refused, and the drain stops as soon as the limit is passed', async () => {
    const { service, transport } = buildService({ maxAttachmentBytes: 64 * 1024 });
    const { stream, counter } = buildCountingStream({ chunkBytes: 16 * 1024, chunkCount: 1000 });

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', content: stream }])),
    );

    expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });
    expect(transport.sentMessages).toHaveLength(0);
    // 5 chunks pass the limit; the rest is read-ahead at most, never the 1000 on offer.
    expect(counter.pulledChunks).toBeLessThan(40);
    expect(stream.destroyed).toBe(true);
  });

  test('a file inside the root that is over the limit is refused by its size, before any read', async () => {
    const { service } = buildService({ attachmentRoot, maxAttachmentBytes: 1024 });
    fileReadSpy = await spyOnFileReads();

    const error = await captureError(
      service.send(buildMessage([{ filename: 'big.bin', path: 'big.bin' }])),
    );

    expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });
    expect(fileReadSpy?.count()).toBe(0);
  });

  test('the limit covers every attachment of one message together', async () => {
    const { service } = buildService({ maxAttachmentBytes: 1024 });

    const error = await captureError(
      service.send(
        buildMessage([
          { filename: 'a', content: Buffer.alloc(600) },
          { filename: 'b', content: Buffer.alloc(600) },
        ]),
      ),
    );

    expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });
  });

  test('attachments under the limit are sent, a stream arriving as its bytes', async () => {
    const { service, transport } = buildService({ maxAttachmentBytes: 64 * 1024 });
    const { stream } = buildCountingStream({ chunkBytes: 1024, chunkCount: 8 });

    const result = await service.send(
      buildMessage([
        { filename: 'a.bin', content: Buffer.alloc(1024, 2) },
        { filename: 'b.txt', content: 'hello' },
        { filename: 'c.bin', content: stream },
      ]),
    );

    expect(result.success).toBe(true);
    const attachments = transport.sentMessages[0].attachments ?? [];
    const byteLengths = attachments.map(attachment =>
      Buffer.isBuffer(attachment.content) ? attachment.content.byteLength : -1,
    );
    expect(byteLengths).toEqual([1024, 5, 8192]);
  });

  test('the default limit is 25 MB', async () => {
    const { service, transport } = buildService();

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', content: Buffer.alloc(25 * 1024 * 1024 + 1) }])),
    );

    expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });

    await service.send(buildMessage([{ filename: 'x', content: Buffer.alloc(25 * 1024 * 1024) }]));
    expect(transport.sentMessages).toHaveLength(1);
  });
});

// Each transport records what reaches its wire. The file holds a marker: if any transport read
// it, the marker bytes would show up in what it recorded.
class RecordingSmtpTransporter {
  sentMails: AnyType[] = [];

  async sendMail(mailOptions: AnyType) {
    this.sentMails.push(mailOptions);
    return { messageId: 'smtp-1', response: '250 OK' };
  }

  async verify() {
    return true;
  }

  close() {}
}

class RecordingMailgunClient {
  createdMessages: AnyType[] = [];

  async create(_domain: string, payload: AnyType) {
    this.createdMessages.push(payload);
    return { id: 'mailgun-1' };
  }
}

class RecordingSendEmailCommand {
  constructor(public input: AnyType) {}
}

class RecordingGetAccountCommand {
  constructor(public input?: AnyType) {}
}

type TTransportUnderTest = {
  name: string;
  options: TMailOptions;
  transport: IMailTransport;
  recorded: () => AnyType[];
};

const buildTransports = (opts: { attachmentRoot?: string }): TTransportUnderTest[] => {
  const smtpTransporter = new RecordingSmtpTransporter();
  const nodemailerTransport = new NodemailerTransportHelper({
    config: { host: 'localhost', port: 1025 },
    module: { createTransport: () => smtpTransporter },
  });

  const mailgunClient = new RecordingMailgunClient();
  const mailgunTransport = new MailgunTransportHelper({
    config: { username: 'api', key: 'fake-key', domain: 'mail.test' },
    module: class {
      constructor(_formData: AnyType) {}

      client() {
        return { messages: mailgunClient };
      }
    },
  });

  const sesCommands: AnyType[] = [];
  const sesTransport = new AmazonSesTransportHelper({
    config: { region: 'us-east-1' },
    module: {
      SESv2Client: class {
        async send(command: RecordingSendEmailCommand) {
          sesCommands.push(command.input);
          return { MessageId: 'ses-1' };
        }
      },
      SendEmailCommand: RecordingSendEmailCommand,
      GetAccountCommand: RecordingGetAccountCommand,
    },
  });

  return [
    {
      name: 'nodemailer',
      options: {
        provider: 'nodemailer',
        config: { host: 'localhost', port: 1025 },
        attachmentRoot: opts.attachmentRoot,
      },
      transport: nodemailerTransport,
      recorded: () => smtpTransporter.sentMails,
    },
    {
      name: 'mailgun',
      options: {
        provider: 'mailgun',
        config: { username: 'api', key: 'fake-key', domain: 'mail.test' },
        attachmentRoot: opts.attachmentRoot,
      },
      transport: mailgunTransport,
      recorded: () => mailgunClient.createdMessages,
    },
    {
      name: 'amazon-ses',
      options: {
        provider: 'amazon-ses',
        config: { region: 'us-east-1' },
        attachmentRoot: opts.attachmentRoot,
      },
      transport: sesTransport,
      recorded: () => sesCommands,
    },
  ];
};

const expectNothingRead = (recorded: AnyType[]) => {
  const serialized = JSON.stringify(recorded);
  expect(serialized).not.toContain(SECRET_MARKER);
  expect(serialized).not.toContain(Buffer.from(SECRET_MARKER).toString('base64'));
  expect(serialized).not.toContain(secretFile);
};

describe('Mail attachments - every transport', () => {
  const noRootTransports = () => buildTransports({});

  for (const { name } of noRootTransports()) {
    test(`${name}: the service refuses a path with no root, and the transport never sees it`, async () => {
      const underTest = noRootTransports().find(candidate => candidate.name === name);
      expect(underTest).toBeDefined();
      if (!underTest) {
        return;
      }

      const service = new MailService(underTest.options, underTest.transport);
      const error = await captureError(
        service.send(buildMessage([{ filename: 'secret.txt', path: secretFile }])),
      );

      expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
      expect(underTest.recorded()).toHaveLength(0);
    });

    test(`${name}: the service refuses a symlink escape, and the transport never sees it`, async () => {
      const underTest = buildTransports({ attachmentRoot }).find(
        candidate => candidate.name === name,
      );
      expect(underTest).toBeDefined();
      if (!underTest) {
        return;
      }

      const service = new MailService(underTest.options, underTest.transport);
      const error = await captureError(
        service.send(buildMessage([{ filename: 'x', path: 'escape-link.txt' }])),
      );

      expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
      expect(underTest.recorded()).toHaveLength(0);
    });

    test(`${name}: called directly, the transport refuses a path instead of reading it`, async () => {
      const underTest = noRootTransports().find(candidate => candidate.name === name);
      expect(underTest).toBeDefined();
      if (!underTest) {
        return;
      }

      const result = await underTest.transport.send(
        buildMessage([{ filename: 'secret.txt', path: secretFile }]),
      );

      expect(result.success).toBe(false);
      expect(underTest.recorded()).toHaveLength(0);
      expectNothingRead(underTest.recorded());
    });

    test(`${name}: a file inside the root reaches the transport as content, never as a path`, async () => {
      const underTest = buildTransports({ attachmentRoot }).find(
        candidate => candidate.name === name,
      );
      expect(underTest).toBeDefined();
      if (!underTest) {
        return;
      }

      const service = new MailService(underTest.options, underTest.transport);
      const result = await service.send(
        buildMessage([{ filename: 'march.txt', path: 'invoices/march.txt' }]),
      );

      expect(result.success).toBe(true);
      const recorded = underTest.recorded();
      expect(recorded).toHaveLength(1);

      const serialized = JSON.stringify(recorded);
      expect(serialized).not.toContain('invoices/march.txt');
      expect(serialized).not.toContain('"path"');
    });
  }
});

// nodemailer reads a `text`/`html` given as `{ path }` or `{ href }` the same way it reads an attachment.
describe('Mail body - only strings reach a transport', () => {
  const BODY_REFUSED = 'core.mail.body_source_refused';
  const passwdBody: AnyType = { path: '/etc/passwd' };
  const fileBody: AnyType = { path: secretFile };
  const urlBody: AnyType = { href: 'http://169.254.169.254/latest' };

  test('an `html: { path }` body is refused before the transport runs', async () => {
    const { service, transport } = buildService();

    const error = await captureError(
      service.send({ to: 'a@b.com', subject: 'Hi', html: passwdBody }),
    );

    expectRefusal({ error, code: BODY_REFUSED, statusCode: 400 });
    expect(transport.sentMessages).toHaveLength(0);
  });

  test('a `text: { href }` body is refused before the transport runs', async () => {
    const { service, transport } = buildService();

    const error = await captureError(
      service.send({ to: 'a@b.com', subject: 'Hi', text: urlBody, html: '<p>ok</p>' }),
    );

    expectRefusal({ error, code: BODY_REFUSED, statusCode: 400 });
    expect(transport.sentMessages).toHaveLength(0);
  });

  test('a string body is still sent', async () => {
    const { service, transport } = buildService();

    const result = await service.send({ to: 'a@b.com', subject: 'Hi', html: '<p>Hello</p>' });

    expect(result.success).toBe(true);
    expect(transport.sentMessages[0].html).toBe('<p>Hello</p>');
  });

  for (const { name } of buildTransports({})) {
    test(`${name}: the service refuses an object body, and the transport never sees it`, async () => {
      const underTest = buildTransports({}).find(candidate => candidate.name === name);
      expect(underTest).toBeDefined();
      if (!underTest) {
        return;
      }

      const service = new MailService(underTest.options, underTest.transport);
      const error = await captureError(
        service.send({ to: 'a@b.com', subject: 'Hi', html: fileBody }),
      );

      expectRefusal({ error, code: BODY_REFUSED, statusCode: 400 });
      expect(underTest.recorded()).toHaveLength(0);
    });
  }

  test('nodemailer called directly refuses an object body instead of reading it', async () => {
    const underTest = buildTransports({}).find(candidate => candidate.name === 'nodemailer');
    expect(underTest).toBeDefined();
    if (!underTest) {
      return;
    }

    const result = await underTest.transport.send({ to: 'a@b.com', subject: 'Hi', html: fileBody });

    expect(result.success).toBe(false);
    expect(underTest.recorded()).toHaveLength(0);
    expectNothingRead(underTest.recorded());
  });
});

const buildWebStream = (opts: { chunkBytes: number; chunkCount: number }) => {
  const state = { pulledChunks: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull: controller => {
      if (state.pulledChunks >= opts.chunkCount) {
        controller.close();
        return;
      }

      state.pulledChunks++;
      controller.enqueue(new Uint8Array(opts.chunkBytes).fill(3));
    },
    cancel: () => {
      state.cancelled = true;
    },
  });

  return { stream, state };
};

const withTimeout = async (opts: { promise: Promise<unknown>; milliseconds: number }) => {
  const timer = new Promise(resolve => {
    setTimeout(() => resolve('timed-out'), opts.milliseconds);
  });

  return Promise.race([
    opts.promise.then(
      () => 'resolved',
      () => 'rejected',
    ),
    timer,
  ]);
};

describe('Mail attachments - streams are released when a send is refused', () => {
  test('a later fs stream is destroyed when an earlier attachment is over the limit', async () => {
    const { service } = buildService({ maxAttachmentBytes: 100 });
    const laterStream = createReadStream(join(attachmentRoot, 'big.bin'));

    const error = await captureError(
      service.send(
        buildMessage([
          { filename: 'a', content: Buffer.alloc(200) },
          { filename: 'b', content: laterStream },
        ]),
      ),
    );

    expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });
    expect(laterStream.destroyed).toBe(true);
  });

  test('a later fs stream is destroyed when an earlier attachment carries `href`', async () => {
    const { service } = buildService();
    const laterStream = createReadStream(join(attachmentRoot, 'big.bin'));

    await captureError(
      service.send(
        buildMessage([
          { filename: 'a', href: 'http://example.com/x' },
          { filename: 'b', content: laterStream },
        ]),
      ),
    );

    expect(laterStream.destroyed).toBe(true);
  });

  test('every stream is released when validation refuses the message before any read', async () => {
    const { service } = buildService();
    const fileStream = createReadStream(join(attachmentRoot, 'big.bin'));
    const { stream: webStream, state } = buildWebStream({ chunkBytes: 16, chunkCount: 4 });
    const untypedWebStream: AnyType = webStream;

    const error = await captureError(
      service.send({
        to: 'a@b.com',
        subject: '',
        text: 'body',
        attachments: [
          { filename: 'a', content: fileStream },
          { filename: 'b', content: untypedWebStream },
        ],
      }),
    );

    expect(error).toBeDefined();
    expect(fileStream.destroyed).toBe(true);
    await Bun.sleep(5);
    expect(state.cancelled).toBe(true);
  });

  test('ses called directly releases the attachment stream it refused to send', async () => {
    const underTest = buildTransports({}).find(candidate => candidate.name === 'amazon-ses');
    expect(underTest).toBeDefined();
    if (!underTest) {
      return;
    }

    const fileStream = createReadStream(join(attachmentRoot, 'big.bin'));
    const result = await underTest.transport.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'body',
      replyTo: 'x@y.com\r\nBcc: evil@z.com',
      attachments: [{ filename: 'a', content: fileStream }],
    });

    expect(result.success).toBe(false);
    expect(fileStream.destroyed).toBe(true);
  });
});

describe('Mail attachments - review fixes', () => {
  test('a path with no filename keeps its file name and gets a content type', async () => {
    const { service, transport } = buildService({ attachmentRoot });

    await service.send(buildMessage([{ path: 'invoices/march.txt' }]));

    const [attachment] = transport.sentMessages[0].attachments ?? [];
    expect(attachment.filename).toBe('march.txt');
    expect(attachment.contentType).toBe('text/plain');
  });

  test('a given filename and content type win over the ones derived from the path', async () => {
    const { service, transport } = buildService({ attachmentRoot });

    await service.send(
      buildMessage([
        { path: 'invoices/march.txt', filename: 'invoice.csv', contentType: 'text/csv' },
      ]),
    );

    const [attachment] = transport.sentMessages[0].attachments ?? [];
    expect(attachment.filename).toBe('invoice.csv');
    expect(attachment.contentType).toBe('text/csv');
  });

  test('a FIFO inside the root is refused at once instead of hanging the send', async () => {
    const fifoPath = join(attachmentRoot, 'pipe');
    const created = Bun.spawnSync(['mkfifo', fifoPath]);
    expect(created.exitCode).toBe(0);

    const { service } = buildService({ attachmentRoot });
    const sendPromise = service.send(buildMessage([{ filename: 'x', path: 'pipe' }]));
    const outcome = await withTimeout({ promise: sendPromise, milliseconds: 1500 });

    expect(outcome).toBe('rejected');
    const error = await captureError(sendPromise);
    expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
  });

  test('an oversized web ReadableStream answers 413 and is cancelled', async () => {
    const { service } = buildService({ maxAttachmentBytes: 64 * 1024 });
    const { stream, state } = buildWebStream({ chunkBytes: 16 * 1024, chunkCount: 1000 });
    const untypedStream: AnyType = stream;

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', content: untypedStream }])),
    );

    expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });
    expect(state.pulledChunks).toBeLessThan(40);
    await Bun.sleep(5);
    expect(state.cancelled).toBe(true);
  });

  test('a web ReadableStream under the limit arrives as its bytes', async () => {
    const { service, transport } = buildService();
    const { stream } = buildWebStream({ chunkBytes: 1024, chunkCount: 3 });
    const untypedStream: AnyType = stream;

    await service.send(buildMessage([{ filename: 'x', content: untypedStream }]));

    const [attachment] = transport.sentMessages[0].attachments ?? [];
    expect(Buffer.isBuffer(attachment.content) ? attachment.content.byteLength : -1).toBe(3072);
  });

  test('a file that grows after its size check is still capped while it is read', async () => {
    fileReadSpy = await spyOnFileReads();
    const handle = await open(secretFile);
    const prototype = Object.getPrototypeOf(handle);
    await handle.close();
    const originalStat = prototype.stat;
    // Reports a 1-byte file, as if the file grew between fstat and the read.
    const statSpy = spyOn(prototype, 'stat').mockImplementation(async function (
      this: AnyType,
      ...args: AnyType[]
    ) {
      const stats = await originalStat.apply(this, args);
      return { isFile: () => stats.isFile(), size: 1 };
    });

    try {
      const { service } = buildService({ attachmentRoot, maxAttachmentBytes: 1024 });
      const error = await captureError(
        service.send(buildMessage([{ filename: 'big.bin', path: 'big.bin' }])),
      );

      expectRefusal({ error, code: TOO_LARGE, statusCode: 413 });
      expect(fileReadSpy.wholeFileReads()).toBe(0);
    } finally {
      statSpy.mockRestore();
    }
  });

  test('missing, directory and escaping paths answer one identical message', async () => {
    const { service } = buildService({ attachmentRoot });
    const messages: string[] = [];

    for (const path of ['does-not-exist.txt', 'invoices', '../secret.txt', 'escape-link.txt']) {
      const error: AnyType = await captureError(
        service.send(buildMessage([{ filename: 'x', path }])),
      );
      messages.push(error.message);
    }

    expect(new Set(messages).size).toBe(1);
  });

  test('a sibling directory whose name starts with the root name is refused', async () => {
    const siblingDirectory = `${attachmentRoot}-evil`;
    mkdirSync(siblingDirectory, { recursive: true });
    writeFileSync(join(siblingDirectory, 'x.txt'), 'evil');
    const { service } = buildService({ attachmentRoot });

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', path: '../root-evil/x.txt' }])),
    );

    expectRefusal({ error, code: PATH_REFUSED, statusCode: 400 });
  });

  test('a root given through a symlink or with a trailing slash still reads files inside it', async () => {
    const linkedRoot = join(scratchDirectory, 'root-link');
    symlinkSync(attachmentRoot, linkedRoot);

    for (const root of [linkedRoot, `${attachmentRoot}/`]) {
      const { service, transport } = buildService({ attachmentRoot: root });
      await service.send(buildMessage([{ path: 'invoices/march.txt' }]));
      expect(transport.sentMessages[0].attachments?.[0].content?.toString()).toBe('invoice body');
    }
  });

  test('a Uint8Array content is sent as bytes', async () => {
    const { service, transport } = buildService();

    await service.send(buildMessage([{ filename: 'x', content: new Uint8Array([1, 2, 3]) }]));

    const [attachment] = transport.sentMessages[0].attachments ?? [];
    expect(Buffer.isBuffer(attachment.content)).toBe(true);
    expect(Buffer.isBuffer(attachment.content) ? attachment.content.byteLength : -1).toBe(3);
  });

  test('a content that is not bytes, text or a stream answers 400, not 500', async () => {
    const { service } = buildService();
    const pathLikeContent: AnyType = { path: '/etc/passwd' };

    const error = await captureError(
      service.send(buildMessage([{ filename: 'x', content: pathLikeContent }])),
    );

    expectRefusal({ error, code: 'core.mail.invalid_configuration', statusCode: 400 });
  });

  test('a transport failure answers a generic message; the raw text stays in cause', async () => {
    const transport = new FakeMailTransport({
      sendError: new Error("ENOENT: no such file or directory, open '/srv/secret/report.pdf'"),
    });
    const options: TMailOptions = { provider: 'custom', config: transport };
    const service = new MailService(options, transport);

    const error: AnyType = await captureError(service.send(buildMessage(undefined)));

    expectRefusal({ error, code: 'core.mail.send_failed', statusCode: 500 });
    expect(error.message).not.toContain('/srv/secret');
    expect(String(error.cause?.message)).toContain('/srv/secret');
  });

  test('nodemailer is told to open no file and fetch no URL on its own', async () => {
    const underTest = buildTransports({}).find(candidate => candidate.name === 'nodemailer');
    expect(underTest).toBeDefined();
    if (!underTest) {
      return;
    }

    await underTest.transport.send(buildMessage(undefined));

    const [mailOptions] = underTest.recorded();
    expect(mailOptions.disableFileAccess).toBe(true);
    expect(mailOptions.disableUrlAccess).toBe(true);
  });
});

describe('Mail body - null counts as absent', () => {
  test('a null html next to a string text is sent', async () => {
    const { service, transport } = buildService();
    const nullBody: AnyType = null;

    const result = await service.send({ to: 'a@b.com', subject: 'Hi', text: 'hi', html: nullBody });

    expect(result.success).toBe(true);
    expect(transport.sentMessages).toHaveLength(1);
  });

  test('a Buffer body is still refused', async () => {
    const { service } = buildService();
    const bufferBody: AnyType = Buffer.from('<p>x</p>');

    const error = await captureError(
      service.send({ to: 'a@b.com', subject: 'Hi', html: bufferBody }),
    );

    expectRefusal({ error, code: 'core.mail.body_source_refused', statusCode: 400 });
  });
});

const buildComponent = (opts: { attachmentRoot?: AnyType; maxAttachmentBytes?: AnyType }) => {
  const container = new Container({ scope: 'MailAttachmentOptionsTest' });
  const transport = new FakeMailTransport();
  const options: TMailOptions = {
    provider: 'custom',
    config: transport,
    attachmentRoot: opts.attachmentRoot,
    maxAttachmentBytes: opts.maxAttachmentBytes,
  };
  container.bind({ key: MailKeys.MAIL_OPTIONS }).toValue(options);
  const application: AnyType = container;

  return new MailComponent(application);
};

describe('Mail component - attachment options are checked at setup', () => {
  const invalidLimits: AnyType[] = [Number.NaN, -1, 0, 1.5, Number.POSITIVE_INFINITY, '1024'];

  for (const maxAttachmentBytes of invalidLimits) {
    test(`maxAttachmentBytes ${String(maxAttachmentBytes)} fails the setup, naming the option`, async () => {
      const error: AnyType = await captureError(buildComponent({ maxAttachmentBytes }).configure());

      expect(error).toBeDefined();
      expect(error.message).toContain('maxAttachmentBytes');
    });
  }

  test('a relative attachmentRoot fails the setup, naming the option', async () => {
    const error: AnyType = await captureError(
      buildComponent({ attachmentRoot: 'relative/dir' }).configure(),
    );

    expect(error?.message).toContain('attachmentRoot');
  });

  test('a missing attachmentRoot directory fails the setup', async () => {
    const error: AnyType = await captureError(
      buildComponent({ attachmentRoot: join(scratchDirectory, 'nope') }).configure(),
    );

    expect(error?.message).toContain('attachmentRoot');
  });

  test('an attachmentRoot that is a file fails the setup', async () => {
    const error: AnyType = await captureError(
      buildComponent({ attachmentRoot: secretFile }).configure(),
    );

    expect(error?.message).toContain('attachmentRoot');
  });

  test('valid attachment options set up cleanly', async () => {
    const error = await captureError(
      buildComponent({ attachmentRoot, maxAttachmentBytes: 1024 }).configure(),
    );

    expect(error).toBeUndefined();
  });
});
