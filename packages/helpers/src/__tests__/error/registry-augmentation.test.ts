import { describe, expect, test } from 'bun:test';
import { HTTP } from '@/common/constants';
import type { TErrorDefinition, TErrorKey, TRegisterErrors } from '@/modules/error';
import { getError } from '@/modules/error';

/**
 * `IErrorKeyRegistry` is DECLARED in `@venizia/ignis-inversion` and re-exported by helpers. An
 * application may augment EITHER module name - merging follows the re-exported declaration, so both
 * populate the same registry and `TErrorKey` sees the keys through either route.
 *
 * The rule that actually bites is different, and invisible: TypeScript only treats `declare module`
 * as an AUGMENTATION when the file imports that module. Augment a module the file does not import
 * and it silently becomes an inert ambient declaration - no error, no keys, autocomplete quietly
 * empty. So: augment whichever module you already import from.
 */
const InventoryErrors = {
  MATERIAL_NOT_FOUND: {
    message: {
      text: 'Material not found: %{materialId}',
      code: 'server.inventory.material.not_found',
    },
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
  },
} as const satisfies Record<string, TErrorDefinition>;

declare module '@venizia/ignis-inversion' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof InventoryErrors> {}
}

// The same augmentation aimed at the RE-EXPORTING module. It populates the same registry: this is
// the route an application takes, since it imports `getError` from helpers and never names
// inversion. BANA's 73 catalogs migrate by renaming '@nx/core' to '@venizia/ignis-helpers' here.
const ViaHelpers = {
  X: {
    message: { text: 'x', code: 'server.commerce.category.create.duplicate_name' },
    statusCode: 409,
  },
} as const satisfies Record<string, TErrorDefinition>;

declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof ViaHelpers> {}
}

describe('key registry augmentation reaches through the helpers re-export', () => {
  test('a registered key is assignable to TErrorKey', () => {
    const key: TErrorKey = 'server.inventory.material.not_found';

    expect(key).toBe(InventoryErrors.MATERIAL_NOT_FOUND.message.code);
  });

  test('an unregistered string is NOT assignable to TErrorKey once the registry is populated', () => {
    // @ts-expect-error 'nope.not_registered' was never declared in IErrorKeyRegistry
    const key: TErrorKey = 'nope.not_registered';

    // `key` is typed as the registered literal, so `toBe` would reject the argument on type
    // grounds - which is itself the proof that the augmentation landed.
    expect(key as string).toBe('nope.not_registered');
  });

  test('messageCode still accepts an unregistered string - a package cannot see another package keys', () => {
    // Autocomplete offers the registered keys, but any string stays legal: BANA's core raises
    // `server.sale.*` codes that the sale package owns, and core cannot depend on sale.
    const error = getError({ message: 'x', messageCode: 'server.sale.sale.combo.invalid' });

    expect(error.normalized.code).toBe('server.sale.sale.combo.invalid');
  });

  test('augmenting the re-exporting module populates the same registry', () => {
    // Registered via '@venizia/ignis-helpers', yet `TErrorKey` - declared in inversion - sees it.
    const key: TErrorKey = 'server.commerce.category.create.duplicate_name';

    expect(key).toBe(ViaHelpers.X.message.code);
  });

  test('the catalogued form carries the strictness instead', () => {
    const error = getError({
      error: InventoryErrors.MATERIAL_NOT_FOUND,
      messageArgs: { materialId: 'M1' },
    });

    expect(error.normalized.code).toBe('server.inventory.material.not_found');
    expect(error.normalized.args).toEqual({ materialId: 'M1' });
  });
});
