import { describe, expect, test } from 'bun:test';
import { ApplicationError, getError, MessageCode } from '@/modules/error';

/** Clients branch on `messageCode`, never message text - an error raised without one gets a default code instead of an unmappable absence, and every framework code comes from one builder rather than a bare string per throw site. */
describe('normalized.code - the default', () => {
  test('an error raised without a code still carries the default one', () => {
    const error = getError({ message: 'something broke' });

    expect(error.normalized.code).toBe(MessageCode.DEFAULT);
    expect(MessageCode.DEFAULT).toBe('core.system_error');
  });

  test('an explicit code always wins over the default', () => {
    const error = getError({ message: 'nope', messageCode: 'core.not_supported' });

    expect(error.normalized.code).toBe('core.not_supported');
  });

  test('an explicitly EMPTY code falls back to the default, not to an empty string', () => {
    // An empty string is unmappable and would read as "this error has a code" to every consumer.
    const error = getError({ message: 'nope', messageCode: '' });

    expect(error.normalized.code).toBe(MessageCode.DEFAULT);
  });

  test('the class constructor and the static factory behave identically', () => {
    expect(new ApplicationError({ message: 'x' }).normalized.code).toBe(MessageCode.DEFAULT);
    expect(ApplicationError.getError({ message: 'x' }).normalized.code).toBe(MessageCode.DEFAULT);
  });
});

describe('MessageCode.build - the builder', () => {
  test('joins segments into the dotted, machine-readable form', () => {
    expect(
      MessageCode.build({
        parts: ['core', 'repository', 'operation_not_allowed'],
      }),
    ).toBe('core.repository.operation_not_allowed');
  });

  test('a two-segment code is the shortest legal one', () => {
    expect(MessageCode.build({ parts: ['core', 'not_supported'] })).toBe('core.not_supported');
  });

  test('rejects a code with fewer than two segments - a bare word is not a namespace', () => {
    expect(() => MessageCode.build({ parts: ['core'] })).toThrow(/at least 2 segments/);
    expect(() => MessageCode.build({ parts: [] })).toThrow(/at least 2 segments/);
  });

  test('rejects anything but lower snake_case in a segment', () => {
    // These would each produce a code that looks fine but cannot be matched by a consumer that normalizes case, or that splits on '.'.
    for (const bad of ['Core', 'not-supported', 'has space', 'has.dot', '']) {
      expect(() => MessageCode.build({ parts: ['core', bad] })).toThrow(/Invalid segment/);
    }
  });

  test('the built code is what the error actually carries', () => {
    const messageCode = MessageCode.build({
      parts: ['core', 'search_engine', 'not_found'],
    });
    const error = getError({ message: 'missing', messageCode });

    expect(error.normalized.code).toBe('core.search_engine.not_found');
  });
});

describe('MessageCode.isValid / resolve', () => {
  test('isValid accepts a well-formed code and rejects a malformed one', () => {
    expect(MessageCode.isValid('core.repository.operation_not_allowed')).toBe(true);
    expect(MessageCode.isValid('core.not_supported')).toBe(true);

    expect(MessageCode.isValid('bareword')).toBe(false);
    expect(MessageCode.isValid('Core.NotSupported')).toBe(false);
    expect(MessageCode.isValid('core..empty_segment')).toBe(false);
    expect(MessageCode.isValid('')).toBe(false);
  });

  test('resolve normalizes an absent or empty code to the default, and passes a real one through', () => {
    expect(MessageCode.resolve()).toBe(MessageCode.DEFAULT);
    expect(MessageCode.resolve('')).toBe(MessageCode.DEFAULT);
    expect(MessageCode.resolve('core.not_supported')).toBe('core.not_supported');
  });

  test('every code MessageCode.build produces satisfies isValid', () => {
    const built = MessageCode.build({ parts: ['core', 'search_engine', 'task_timeout'] });

    expect(MessageCode.isValid(built)).toBe(true);
    // The default is itself a legal code - a client can map it like any other.
    expect(MessageCode.isValid(MessageCode.DEFAULT)).toBe(true);
  });
});
