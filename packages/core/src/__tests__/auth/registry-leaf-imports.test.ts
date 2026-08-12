import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const AUTH_ROOT = join(__dirname, '../../components/auth');

const readSource = async (opts: { relative: string }): Promise<string> => {
  return Bun.file(join(AUTH_ROOT, opts.relative)).text();
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

  // authorize/common/types.ts is transitively reached by both providers via '../common' - not one of
  // the four originally measured lines, but the same barrel fault, found during the self-review trace.
  test('authorize common types does not import IAuthUser from the authenticate barrel', async () => {
    const source = await readSource({
      relative: 'authorize/common/types.ts',
    });

    expect(source).not.toMatch(/from '\.\.\/\.\.\/authenticate';/);
    expect(source).toMatch(/from '\.\.\/\.\.\/authenticate\/common\/types';/);
  });
});
