import { describe, expect, test } from 'bun:test';
import { LogLevels } from '@/modules/logger';
import {
  BUFFER_SIZE,
  ENTRY_SIZE,
  HF_LEVEL_CODES,
  HF_LEVEL_NAMES,
  HF_MESSAGE_MAX_BYTES,
  HF_SCOPE_MAX_BYTES,
} from '@/modules/logger/hf/common';
import { HfLogRing } from '@/modules/logger/hf/ring';

describe('hf constants', () => {
  test('every TLogLevel has a code and the legacy five keep their numbers', () => {
    for (const level of LogLevels.SCHEME_SET) {
      expect(HF_LEVEL_CODES[level as keyof typeof HF_LEVEL_CODES]).toBeNumber();
    }
    expect(HF_LEVEL_CODES.debug).toBe(0);
    expect(HF_LEVEL_CODES.info).toBe(1);
    expect(HF_LEVEL_CODES.warn).toBe(2);
    expect(HF_LEVEL_CODES.error).toBe(3);
    expect(HF_LEVEL_CODES.emerg).toBe(4);
  });

  test('codes and names are mutual inverses', () => {
    for (const [name, code] of Object.entries(HF_LEVEL_CODES)) {
      expect(HF_LEVEL_NAMES[code as number]).toBe(name as (typeof HF_LEVEL_NAMES)[number]);
    }
  });

  test('the entry layout adds up to one slot', () => {
    expect(8 + 1 + 1 + HF_SCOPE_MAX_BYTES + 1 + HF_MESSAGE_MAX_BYTES).toBe(ENTRY_SIZE);
    expect(BUFFER_SIZE & (BUFFER_SIZE - 1)).toBe(0); // power of two - the mask depends on it
  });

  test('the ring is a lazy singleton', () => {
    const first = HfLogRing.get();
    expect(first.bytes.byteLength).toBe(BUFFER_SIZE * ENTRY_SIZE);
    expect(HfLogRing.get()).toBe(first);
    expect(first.bytes.buffer).toBe(first.f64.buffer);
  });
});
