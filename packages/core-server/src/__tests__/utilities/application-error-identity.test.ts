import { describe, expect, test } from 'bun:test';
import { ApplicationError, getError, isApplicationError } from '@venizia/ignis-helpers/core';
import { Container, getError as inversionGetError } from '@venizia/ignis-inversion';

/** `instanceof ApplicationError` cannot work across packages: inversion ships dual CJS+ESM builds, so one source class yields two runtime constructors and CJS and ESM importers hold different classes - `isApplicationError()` is the only safe check. */
describe('isApplicationError recognizes errors across package boundaries', () => {
  test('an error raised through helpers is recognized', () => {
    expect(isApplicationError(getError({ message: 'boom', statusCode: 409 }))).toBe(true);
  });

  test('an error raised through inversion is recognized, whatever instanceof happens to answer', () => {
    const error = inversionGetError({ message: 'not found', statusCode: 404 });

    // `instanceof` is deliberately NOT asserted either way. Its answer depends on which build each
    // importer resolved - and that moved once already, when helpers gained its own ESM half and the
    // two sides started agreeing again. Pinning it would pin an accident of resolution; the point
    // of this test is that the predicate holds no matter what resolution does.
    expect(typeof (error instanceof ApplicationError)).toBe('boolean');
    expect(isApplicationError(error)).toBe(true);
  });

  test('both entry points now agree on what an error looks like', () => {
    // They used to not: inversion carried its own ApplicationError that never ran `messageCode` through MessageCode.resolve, so its errors could carry `messageCode: undefined` while the helpers ones never could.
    const viaHelpers = getError({ message: 'x' });
    const viaInversion = inversionGetError({ message: 'x' });

    expect(viaInversion.normalized.code).toBe(viaHelpers.normalized.code);
    expect(viaInversion.normalized).toEqual(viaHelpers.normalized);
  });

  test('an error thrown by the DI container itself is recognized', () => {
    const container = new Container({ scope: 'probe' });

    let caught: unknown;
    try {
      container.get({ key: 'no-such-binding' });
    } catch (error) {
      caught = error;
    }

    // Without this, a DI misconfiguration surfacing inside a connector would be sanitized into a 503 "engine unavailable" and the real cause would be lost.
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
