import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// The auth seam moved to the kernel package (`base/auth`, was `components/auth`) - the leaf-import
// discipline this guards still matters there, so the read crosses into the sibling package.
const AUTH_ROOT = join(__dirname, '../../../../kernel/src/base/auth');

const readSource = async (opts: { relative: string }): Promise<string> => {
  return Bun.file(join(AUTH_ROOT, opts.relative)).text();
};

const listTypeScriptFiles = async (opts: { relative: string }): Promise<string[]> => {
  const entries = await readdir(join(AUTH_ROOT, opts.relative));
  return entries.filter(entry => entry.endsWith('.ts') && entry !== 'index.ts').sort();
};

describe('auth providers import registry leaves, not barrels', () => {
  test('AuthenticationProvider does not import the strategies barrel', async () => {
    const source = await readSource({
      relative: 'authenticate/providers/authentication.provider.ts',
    });

    expect(source).not.toMatch(/from '\.\.\/strategies';/);
    expect(source).toMatch(/from '\.\.\/strategies\/strategy-registry';/);
  });

  test('AuthorizationProvider does not import the enforcers barrel', async () => {
    const source = await readSource({
      relative: 'authorize/providers/authorization.provider.ts',
    });

    expect(source).not.toMatch(/from '\.\.\/enforcers';/);
    expect(source).toMatch(/from '\.\.\/enforcers\/enforcer-registry';/);
  });

  test('AuthorizationProvider does not import IAuthUser from the authenticate barrel', async () => {
    const source = await readSource({
      relative: 'authorize/providers/authorization.provider.ts',
    });

    expect(source).not.toMatch(/from '\.\.\/\.\.\/authenticate';/);
    expect(source).toMatch(/from '\.\.\/\.\.\/authenticate\/common\/types';/);
  });

  test('AuthorizationEnforcerRegistry does not import IAuthUser from the authenticate barrel', async () => {
    const source = await readSource({
      relative: 'authorize/enforcers/enforcer-registry.ts',
    });

    expect(source).not.toMatch(/from '\.\.\/\.\.\/authenticate';/);
    expect(source).toMatch(/from '\.\.\/\.\.\/authenticate\/common\/types';/);
  });

  // authorize/common/types/ is transitively reached by both providers via '../common' - not one of
  // the four originally measured lines, but the same barrel fault. Checked file-by-file since the
  // import lives in whichever leaf of that folder needs it, not in one fixed file.
  test('authorize common types does not import IAuthUser from the authenticate barrel', async () => {
    const files = await listTypeScriptFiles({ relative: 'authorize/common/types' });
    const sources = await Promise.all(
      files.map(file => readSource({ relative: `authorize/common/types/${file}` })),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/from '\.\.\/\.\.\/\.\.\/authenticate';/);
    }
    expect(
      sources.some(source => /from '\.\.\/\.\.\/\.\.\/authenticate\/common\/types';/.test(source)),
    ).toBe(true);
  });
});
