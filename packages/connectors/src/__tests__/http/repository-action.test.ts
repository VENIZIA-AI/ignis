import { HttpDataSource } from '@/http/datasource';
import { HttpRepository } from '@/http/repository';
import { FetchSchemaError } from '@venizia/ignis-helpers/core';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { afterEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface ICall {
  url: URL;
  method: string;
  body?: unknown;
  headers: Headers;
}

const stubFetch = (spec: { status?: number; body?: unknown }) => {
  const calls: Array<ICall> = [];

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(url)),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: new Headers(init?.headers),
    });

    return new Response(spec.body === undefined ? null : JSON.stringify(spec.body), {
      status: spec.status ?? 200,
    });
  }) as never;

  return calls;
};

const SignUpAnswer = z.object({ id: z.string(), email: z.string() });

/** A repository the way an app writes one: its routes beside the CRUD ones call `action`. */
class AuthRepository extends HttpRepository {
  constructor() {
    super({
      dataSource: new HttpDataSource({ baseUrl: 'https://api.example.com' }),
      resource: 'auth',
    });
  }

  signUp(opts: { email: string }) {
    return this.action({ paths: ['auth', 'sign-up'], body: opts, schema: SignUpAnswer });
  }

  requestReset(opts: { email: string }) {
    return this.action({ paths: ['auth', 'forgot-password', 'request'], body: opts });
  }

  withMethod() {
    return this.action({ paths: ['auth', 'session'], method: 'DELETE' });
  }

  withOptions(opts: { signal: AbortSignal }) {
    return this.action({
      paths: ['auth', 'ping'],
      options: { headers: { 'x-trace': 't1' }, signal: opts.signal },
    });
  }

  sloppy(opts: { schema: z.ZodType }) {
    return this.action({ paths: ['auth', 'x'], schema: opts.schema });
  }

  transformed() {
    return this.action({
      paths: ['auth', 'count'],
      schema: z.object({ n: z.string() }).transform((value) => Number(value.n)),
    });
  }
}

const repository = () => new AuthRepository();

describe('HttpRepository.action', () => {
  test('a call with a schema returns the parsed data, typed by the schema', async () => {
    const calls = stubFetch({ body: { id: 'u1', email: 'a@b.com' } });
    const answer = await repository().signUp({ email: 'a@b.com' });

    // The type is z.output of the schema: these lines compile only if it is.
    const id: string = answer.id;
    // @ts-expect-error `missing` is not in the schema
    const missing: string = answer.missing;

    expect(id).toBe('u1');
    expect(missing).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url.pathname).toBe('/auth/sign-up');
    expect(calls[0]?.body).toEqual({ email: 'a@b.com' });
  });

  test('a schema with a transform answers its output type', async () => {
    stubFetch({ body: { n: '42' } });
    const count: number = await repository().transformed();

    expect(count).toBe(42);
  });

  test('a call without a schema returns nothing and does not read the answer', async () => {
    const calls = stubFetch({ body: { anything: true } });
    const answer: void = await repository().requestReset({ email: 'a@b.com' });

    expect(answer).toBeUndefined();
    expect(calls[0]?.url.pathname).toBe('/auth/forgot-password/request');
    expect(calls[0]?.method).toBe('POST');
  });

  test('a 204 with no body is fine without a schema', async () => {
    stubFetch({ status: 204 });

    await repository().requestReset({ email: 'a@b.com' });
  });

  test('method is POST unless given', async () => {
    const calls = stubFetch({ status: 204 });

    await repository().withMethod();

    expect(calls[0]?.method).toBe('DELETE');
  });

  test('options carry headers and an abort signal, as every repository call does', async () => {
    const calls = stubFetch({ status: 204 });
    const controller = new AbortController();

    await repository().withOptions({ signal: controller.signal });

    expect(calls[0]?.headers.get('x-trace')).toBe('t1');
  });

  test('an answer the schema refuses is a FetchSchemaError (502) naming paths and rules, never the value', async () => {
    stubFetch({ body: { id: 7, email: 'secret@x.com' } });

    const error = await RejectionUtility.rejectionOf({
      task: repository().signUp({ email: 'a@b.com' }),
    });

    expect(FetchSchemaError.is(error)).toBe(true);
    expect(error).toMatchObject({ statusCode: 502, status: 200 });
    expect(error instanceof Error ? error.message : '').toContain('id: invalid_type');
    expect(error instanceof Error ? error.message : '').not.toContain('secret@x.com');
    expect(error instanceof Error ? error.message : '').toContain('/auth/sign-up');
  });

  test('a non-2xx answer throws with the server status and message, as a write does', async () => {
    stubFetch({
      status: 409,
      body: {
        message: 'Email already registered',
        statusCode: 409,
        normalized: { text: 'Email already registered', code: 'auth.email_taken' },
      },
    });

    const error = await RejectionUtility.rejectionOf({
      task: repository().signUp({ email: 'a@b.com' }),
    });

    expect(error).toMatchObject({ statusCode: 409 });
    expect(error instanceof Error ? error.message : '').toContain('Email already registered');
  });

  test('a null answer with a schema that accepts it is parsed', async () => {
    stubFetch({ body: null });
    const answer = await repository().sloppy({ schema: z.null() });

    expect(answer).toBeNull();
  });
});
