import 'reflect-metadata';

import { beforeEach, describe, expect, test } from 'bun:test';
import { Container } from '../modules/container/container';

class NoteService {}
class AuditService {}

describe('the container counts what it hands out', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container({ scope: 'resolution-counts-test' });
    container.bind({ key: 'services.NoteService' }).toClass(NoteService);
    container.bind({ key: 'services.AuditService' }).toClass(AuditService);
    container.startResolutionCounting();
  });

  test('a key that was read is counted; a key that was only bound is absent', () => {
    container.get({ key: 'services.NoteService' });

    const counts = container.getResolutionCounts();

    expect(counts.get('services.NoteService')).toBe(1);
    expect(counts.has('services.AuditService')).toBe(false);
  });

  test('reading twice counts twice', () => {
    container.get({ key: 'services.NoteService' });
    container.get({ key: 'services.NoteService' });

    expect(container.getResolutionCounts().get('services.NoteService')).toBe(2);
  });

  test('a miss is not a resolution', () => {
    container.get({ key: 'services.Absent', isOptional: true });

    expect(container.getResolutionCounts().has('services.Absent')).toBe(false);
  });

  test('starting again clears a count that was there', () => {
    container.get({ key: 'services.NoteService' });
    expect(container.getResolutionCounts().size).toBe(1);

    container.startResolutionCounting();

    expect(container.getResolutionCounts().size).toBe(0);
  });

  /** Off by default: an application that never reads the report pays nothing on the hottest path. */
  test('nothing is counted before counting starts', () => {
    const fresh = new Container({ scope: 'off-by-default' });
    fresh.bind({ key: 'services.NoteService' }).toClass(NoteService);

    fresh.get({ key: 'services.NoteService' });

    expect(fresh.getResolutionCounts().size).toBe(0);
  });

  test('stopping keeps what was counted and stops adding', () => {
    container.get({ key: 'services.NoteService' });
    container.stopResolutionCounting();

    container.get({ key: 'services.NoteService' });

    expect(container.getResolutionCounts().get('services.NoteService')).toBe(1);
  });

  /** The report is read-only: a caller must not be able to forge a count. */
  test('the returned map is a copy, not the container state', () => {
    container.get({ key: 'services.NoteService' });

    const counts = container.getResolutionCounts();
    expect(counts.get('services.NoteService')).toBe(1);

    container.get({ key: 'services.NoteService' });
    expect(counts.get('services.NoteService')).toBe(1);
  });
});
