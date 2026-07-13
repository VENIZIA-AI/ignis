import { describe, expect, test } from 'bun:test';
import { ApplicationError, getError, isApplicationError } from '@venizia/ignis-helpers';
import { Container, getError as inversionGetError } from '@venizia/ignis-inversion';

/**
 * The search connectors decide "an error the framework already shaped" vs "a raw engine failure to
 * sanitize as a 503" before wrapping anything. Class identity cannot carry that decision: inversion
 * ships dual CJS+ESM builds (its DI powers frontend libraries too), so even its own class has two
 * runtime constructors, and helpers keeps a class of its own. `isApplicationError` tests the shape.
 */
describe('isApplicationError recognizes errors across package boundaries', () => {
  test('an error raised through helpers is recognized', () => {
    expect(isApplicationError(getError({ message: 'boom', statusCode: 409 }))).toBe(true);
  });

  test('an error raised through inversion is recognized, though it is NOT instanceof the helpers class', () => {
    const error = inversionGetError({ message: 'not found', statusCode: 404 });

    expect(error instanceof ApplicationError).toBe(false);
    expect(isApplicationError(error)).toBe(true);
  });

  test('an error thrown by the DI container itself is recognized', () => {
    const container = new Container({ scope: 'probe' });

    let caught: unknown;
    try {
      container.get({ key: 'no-such-binding' });
    } catch (error) {
      caught = error;
    }

    // Without this, a DI misconfiguration surfacing inside a connector would be sanitized into a
    // 503 "engine unavailable" and the real cause would be lost.
    expect(isApplicationError(caught)).toBe(true);
  });

  test('a plain Error is NOT recognized - it still gets sanitized', () => {
    expect(isApplicationError(new Error('raw engine failure'))).toBe(false);
  });

  test('non-error values are NOT recognized', () => {
    expect(isApplicationError({ statusCode: 404 })).toBe(false);
    expect(isApplicationError(undefined)).toBe(false);
    expect(isApplicationError('boom')).toBe(false);
  });
});
