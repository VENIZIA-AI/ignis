import { TLogLevel } from '../../common';

/** BYTES per ring entry. Every entry occupies exactly this many bytes, used or not. */
export const ENTRY_SIZE = 256;

/** ENTRIES (slots) in the ring, not bytes - must stay a power of two (the slot mask depends on it). Total ring memory = BUFFER_SIZE x ENTRY_SIZE = 16MB, allocated lazily on first use. */
export const BUFFER_SIZE = 65536;

/** Max scope size in UTF-8 BYTES (not characters - a multibyte scope truncates by byte). */
export const HF_SCOPE_MAX_BYTES = 32;

/** Max message size in UTF-8 BYTES (not characters); longer messages truncate silently. */
export const HF_MESSAGE_MAX_BYTES = 213;

/** Field offsets inside one 256-byte entry. The two length bytes are what make reads exact. */
export const OFFSET_LEVEL = 8;
export const OFFSET_SCOPE_LENGTH = 9;
export const OFFSET_SCOPE = 10;
export const OFFSET_MESSAGE_LENGTH = 42;
export const OFFSET_MESSAGE = 43;

/** One byte code per TLogLevel, stable since the original implementation. */
export const HF_LEVEL_CODES: Record<TLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  emerg: 4,
};

export const HF_LEVEL_NAMES: Array<TLogLevel> = ['debug', 'info', 'warn', 'error', 'emerg'];

export const MESSAGE_CACHE_CAP = 4096;
export const HF_DEFAULT_BATCH_SIZE = 1024;
export const HF_DEFAULT_FLUSH_INTERVAL_MS = 100;
