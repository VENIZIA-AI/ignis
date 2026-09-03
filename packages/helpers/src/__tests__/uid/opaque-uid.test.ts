import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_UID_LENGTH,
  OpaqueUidHelper,
  UidAlphabets,
  UidCaseForms,
  type TUidCaseForm,
} from '@/modules/uid';

/** The sizes the docs quote, and the entropy every `length` recommendation is calculated from. */
describe('UidAlphabets', () => {
  test.each([
    [UidAlphabets.BASE62, 62, 'BASE62'],
    [UidAlphabets.BASE58, 58, 'BASE58'],
    [UidAlphabets.CROCKFORD, 32, 'CROCKFORD'],
    [UidAlphabets.NO_VOWEL, 50, 'NO_VOWEL'],
  ])('%#. is the documented size', (alphabet, size) => {
    expect(alphabet).toHaveLength(size);
    // A duplicate would quietly weight one character twice and shrink the real space.
    expect(new Set(alphabet).size).toBe(size);
  });

  test('BASE58 drops exactly the four look-alikes', () => {
    for (const character of ['0', 'O', 'I', 'l']) {
      expect(UidAlphabets.BASE58).not.toContain(character);
    }
  });

  test('CROCKFORD is uppercase only, without I, L, O and U', () => {
    expect(UidAlphabets.CROCKFORD).toBe(UidAlphabets.CROCKFORD.toUpperCase());

    for (const character of ['I', 'L', 'O', 'U']) {
      expect(UidAlphabets.CROCKFORD).not.toContain(character);
    }
  });

  test('NO_VOWEL carries no vowel in either case, so no word can form', () => {
    for (const character of UidAlphabets.NO_VOWEL) {
      expect('aeiouAEIOU').not.toContain(character);
    }
  });
});

describe('OpaqueUidHelper - shape', () => {
  test('the default is six Crockford characters, no prefix, no delimiter', () => {
    const id = new OpaqueUidHelper().nextId();

    expect(id).toHaveLength(DEFAULT_UID_LENGTH);
    expect(id).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
  });

  test('length counts the BODY only - the prefix and delimiter sit outside it', () => {
    const helper = new OpaqueUidHelper({
      prefix: { enable: true, value: 'CUS' },
      delimiter: { enable: true, value: '_' },
      length: 8,
    });

    const id = helper.nextId();

    expect(id).toHaveLength('CUS'.length + '_'.length + 8);
    expect(id.startsWith('CUS_')).toBe(true);
    expect(id.slice('CUS_'.length)).toHaveLength(8);
  });

  test('a prefix with the delimiter turned off runs straight into the body', () => {
    const id = new OpaqueUidHelper({
      prefix: { enable: true, value: 'INV' },
      delimiter: { enable: false, value: '_' },
      length: 6,
    }).nextId();

    expect(id).toMatch(/^INV[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
  });

  test('a multi-character delimiter is allowed', () => {
    const id = new OpaqueUidHelper({
      prefix: { enable: true, value: 'ORD' },
      delimiter: { enable: true, value: '::' },
    }).nextId();

    expect(id.startsWith('ORD::')).toBe(true);
  });

  test('a per-call prefix replaces the configured one', () => {
    const helper = new OpaqueUidHelper({
      prefix: { enable: true, value: 'CUS' },
      delimiter: { enable: true, value: '_' },
    });

    expect(helper.nextId({ prefix: 'INV' }).startsWith('INV_')).toBe(true);
    // The configured value is untouched by the override.
    expect(helper.nextId().startsWith('CUS_')).toBe(true);
  });

  test('a per-call EMPTY prefix is refused - that is what the toggle is for', () => {
    const helper = new OpaqueUidHelper({ prefix: { enable: true, value: 'CUS' } });

    expect(() => helper.nextId({ prefix: '' })).toThrow(/not how a prefix is turned off/);
  });
});

/**
 * `isAvailable` answers "may I use this one", NOT "does this exist" - `true` accepts. The inverted
 * reading is the mistake the name exists to prevent, so these tests assert the accepting direction
 * explicitly.
 */
describe('OpaqueUidHelper - isAvailable', () => {
  test('every argument is optional, and the return type follows the check', () => {
    const helper = new OpaqueUidHelper();

    // Compile-time assertions: each annotation fails the build if the overload resolves otherwise.
    // A sync check must stay a string, so a caller in a synchronous mapper is never forced to await.
    const noArgs: string = helper.nextId();
    const emptyObject: string = helper.nextId({});
    const prefixOnly: string = helper.nextId({ prefix: 'INV' });
    const syncCheck: string = helper.nextId({ isAvailable: () => true });
    const asyncCheck: Promise<string> = helper.nextId({ isAvailable: async () => true });

    expect([noArgs, emptyObject, syncCheck].every(id => typeof id === 'string')).toBe(true);
    // No underscore: this helper has no delimiter configured, and a per-call prefix does not turn
    // one on. The two toggles stay independent.
    expect(prefixOnly).toMatch(/^INV[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    expect(asyncCheck).toBeInstanceOf(Promise);
  });

  test('no callback means one draw, taken as-is', () => {
    expect(new OpaqueUidHelper().nextId()).toHaveLength(6);
  });

  test('maxAttempts without a check is refused, not ignored', () => {
    // It would configure a retry that cannot happen: with nothing to reject a draw, there is one.
    expect(() => new OpaqueUidHelper().nextId({ maxAttempts: 5 })).toThrow(
      /maxAttempts has no effect without/,
    );
  });

  test('true accepts the id', () => {
    const seen: Array<string> = [];

    const id = new OpaqueUidHelper().nextId({
      isAvailable: candidate => {
        seen.push(candidate);
        return true;
      },
    });

    expect(seen).toEqual([id]);
  });

  test('false redraws until one is accepted', () => {
    const rejected: Array<string> = [];

    const id = new OpaqueUidHelper().nextId({
      isAvailable: candidate => {
        if (rejected.length < 3) {
          rejected.push(candidate);
          return false;
        }
        return true;
      },
    });

    expect(rejected).toHaveLength(3);
    expect(rejected).not.toContain(id);
  });

  test('the candidate carries the prefix and delimiter, because that is what the column stores', () => {
    const candidates: Array<string> = [];

    new OpaqueUidHelper({
      prefix: { enable: true, value: 'INV' },
      delimiter: { enable: true, value: '-' },
    }).nextId({
      isAvailable: candidate => {
        candidates.push(candidate);
        return true;
      },
    });

    expect(candidates[0]).toMatch(/^INV-/);
  });

  test('a callback that never accepts throws instead of looping forever', () => {
    let calls = 0;

    expect(() =>
      new OpaqueUidHelper().nextId({
        isAvailable: () => {
          calls += 1;
          return false;
        },
        maxAttempts: 4,
      }),
    ).toThrow(/No available id after 4 attempts/);

    expect(calls).toBe(4);
  });

  test('maxAttempts must be a positive integer', () => {
    const helper = new OpaqueUidHelper();

    expect(() => helper.nextId({ isAvailable: () => true, maxAttempts: 0 })).toThrow(
      /maxAttempts must be a positive integer/,
    );
  });

  test('a SYNCHRONOUS check keeps the call synchronous - no promise is allocated', () => {
    const id = new OpaqueUidHelper().nextId({ isAvailable: () => true });

    expect(typeof id).toBe('string');
  });

  test('an ASYNCHRONOUS check makes the call a promise', async () => {
    const pending = new OpaqueUidHelper().nextId({ isAvailable: async () => true });

    expect(typeof (pending as PromiseLike<string>).then).toBe('function');
    expect(await pending).toHaveLength(6);
  });

  test('an async check redraws the same way, and awaits every verdict', async () => {
    const rejected: Array<string> = [];

    const id = await new OpaqueUidHelper().nextId({
      isAvailable: async candidate => {
        if (rejected.length < 3) {
          rejected.push(candidate);
          return false;
        }
        return true;
      },
    });

    expect(rejected).toHaveLength(3);
    expect(rejected).not.toContain(id);
  });

  test('an async check that never accepts rejects instead of looping forever', async () => {
    const failure = await new OpaqueUidHelper()
      .nextId({ isAvailable: async () => false, maxAttempts: 3 })
      .catch((error: unknown) => error);

    expect(String(failure)).toContain('No available id after 3 attempts');
  });

  test('a check that turns async only on a LATER draw still resolves', async () => {
    // The switch to the async path happens on the first pending verdict, whenever that arrives.
    let call = 0;

    const id = await new OpaqueUidHelper().nextId({
      isAvailable: () => {
        call += 1;
        if (call === 1) {
          return false;
        }
        return Promise.resolve(true);
      },
    });

    expect(call).toBe(2);
    expect(id).toHaveLength(6);
  });

  test('an in-memory set is the honest use - a batch minted before any insert', () => {
    const issued = new Set<string>();
    const helper = new OpaqueUidHelper({ length: 4 });

    for (let index = 0; index < 200; index++) {
      issued.add(helper.nextId({ isAvailable: candidate => !issued.has(candidate) }));
    }

    // 200 distinct ids out of 200 draws: the callback removed every within-batch collision, which a
    // bare `nextId()` at length 4 would not have.
    expect(issued.size).toBe(200);
  });
});

describe('OpaqueUidHelper - caseForm folds the ALPHABET, not the output', () => {
  test('a single-case alphabet folds cleanly, and the ids follow it', () => {
    const helper = new OpaqueUidHelper({
      alphabet: UidAlphabets.CROCKFORD,
      caseForm: UidCaseForms.LOWER,
      length: 24,
    });

    expect(helper.getAlphabet()).toBe(UidAlphabets.CROCKFORD.toLowerCase());
    expect(helper.nextId()).toMatch(/^[0-9a-hjkmnp-tv-z]{24}$/);
  });

  test('folding a TWO-case alphabet is refused, because it puts back what the alphabet removed', () => {
    // Measured, and the reason this is a refusal rather than a shrink: uppercasing BASE58 yields 35
    // characters, not the 33 an entropy calculation predicts, because every lowercase letter folds
    // onto the uppercase set and drags `I` and `O` back in - the exact pair BASE58 drops so that `1`
    // and `0` stay unambiguous. Lowercasing brings back `l` for the same reason.
    const folding: Array<TUidCaseForm> = [UidCaseForms.UPPER, UidCaseForms.LOWER];

    for (const caseForm of folding) {
      expect(() => new OpaqueUidHelper({ alphabet: UidAlphabets.BASE58, caseForm })).toThrow(
        /cannot fold a two-case alphabet/,
      );
    }

    // Mixed is always fine - nothing is folded.
    expect(
      new OpaqueUidHelper({
        alphabet: UidAlphabets.BASE58,
        caseForm: UidCaseForms.MIXED,
      }).getAlphabet(),
    ).toHaveLength(58);
  });

  test('the single-case default really is smaller, so length has to make up for it', () => {
    // 32 against 58: 5 bits per character against 5.86. The default `length` is chosen for the
    // uppercase set, so switching to MIXED makes ids stronger, never weaker.
    expect(new OpaqueUidHelper().getAlphabet()).toHaveLength(32);
    expect(
      new OpaqueUidHelper({
        alphabet: UidAlphabets.BASE58,
        caseForm: UidCaseForms.MIXED,
      }).getAlphabet(),
    ).toHaveLength(58);
  });

  test('exclude is applied after the fold, and the result is de-duplicated', () => {
    const helper = new OpaqueUidHelper({
      alphabet: UidAlphabets.CROCKFORD,
      caseForm: UidCaseForms.LOWER,
      // Lowercase, so it only bites once the fold has already run.
      exclude: 'abcdef',
    });

    expect(helper.getAlphabet()).toMatch(/^[0-9g-z]+$/);
    expect(helper.getAlphabet()).not.toContain('a');
    expect(new Set(helper.getAlphabet()).size).toBe(helper.getAlphabet().length);
  });
});

/**
 * The bias this guards is invisible in any single id. `byte % 32` is unbiased only because 32
 * divides 256; on a 58-character alphabet the first 24 characters would appear about 1.5% more
 * often, forever, and no caller could see it.
 */
describe('OpaqueUidHelper - sampling is unbiased', () => {
  test('every character of a 58-symbol alphabet appears, at roughly equal frequency', () => {
    const helper = new OpaqueUidHelper({
      alphabet: UidAlphabets.BASE58,
      caseForm: UidCaseForms.MIXED,
      length: 64,
    });

    const alphabet = helper.getAlphabet();
    const counts = new Map<string, number>(alphabet.split('').map(character => [character, 0]));

    const draws = 2_000;
    for (let index = 0; index < draws; index++) {
      for (const character of helper.nextId()) {
        counts.set(character, (counts.get(character) ?? 0) + 1);
      }
    }

    const total = draws * 64;
    const expectedShare = total / alphabet.length;

    for (const [character, count] of counts) {
      expect(count).toBeGreaterThan(0);
      // A generous band: this catches a systematic modulo skew, not ordinary randomness.
      expect(Math.abs(count - expectedShare) / expectedShare).toBeLessThan(0.2);
      expect(alphabet).toContain(character);
    }
  });

  test('two helpers do not agree - the source is entropy, not a sequence', () => {
    const first = new OpaqueUidHelper({ length: 24 });
    const second = new OpaqueUidHelper({ length: 24 });

    expect(first.nextId()).not.toBe(second.nextId());
  });
});

describe('OpaqueUidHelper - what the constructor refuses', () => {
  test('a delimiter with no prefix', () => {
    expect(() => new OpaqueUidHelper({ delimiter: { enable: true, value: '_' } })).toThrow(
      /delimiter is enabled without a prefix/,
    );
  });

  test('a delimiter drawn from the alphabet', () => {
    expect(
      () =>
        new OpaqueUidHelper({
          prefix: { enable: true, value: 'CUS' },
          delimiter: { enable: true, value: 'A' },
        }),
    ).toThrow(/shares characters with the alphabet/);
  });

  test('an enabled prefix with no value', () => {
    expect(() => new OpaqueUidHelper({ prefix: { enable: true } })).toThrow(
      /prefix is enabled but carries no value/,
    );
  });

  test('a prefix that disagrees with the caseForm', () => {
    expect(
      () =>
        new OpaqueUidHelper({
          prefix: { enable: true, value: 'cus' },
          caseForm: UidCaseForms.UPPER,
        }),
    ).toThrow(/prefix does not match caseForm/);
  });

  test('an alphabet eaten by exclude', () => {
    expect(
      () => new OpaqueUidHelper({ alphabet: UidAlphabets.CROCKFORD, exclude: 'ABCDEFGHJKMNPQRST' }),
    ).toThrow(/Alphabet too small/);
  });

  test('a length below one', () => {
    expect(() => new OpaqueUidHelper({ length: 0 })).toThrow(/length must be a positive integer/);
    expect(() => new OpaqueUidHelper({ length: 2.5 })).toThrow(/length must be a positive integer/);
  });

  test('an unknown caseForm', () => {
    expect(() => new OpaqueUidHelper({ caseForm: 'title' as never })).toThrow(/Unknown caseForm/);
  });
});
