import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import { namingConventionConfigs } from '../linters/eslint';

const findings = (code: string) =>
  new Linter({ cwd: '/project' })
    .verify(code, namingConventionConfigs, { filename: '/project/src/subject.ts' })
    .map((message) => message.message);

describe('NamingConventionRule: type aliases and interfaces', () => {
  test.each([
    'type TUser = string;',
    'type T2fa = string;',
    'type UserType = string;',
    'interface IUser {}',
    'type ValueOrPromise<TValue> = TValue;',
    'type ValueOf<TValue> = TValue;',
    'type ValueOptional<TValue> = TValue;',
    'type ValueOptionalExcept<TValue> = TValue;',
    'type PGliteCRUDRepository = object;',
    "declare module 'hono' { interface ContextVariableMap {} }",
    'declare global { interface Window {} }',
    'function f<Value>(value: Value) { return value; }',
    'class User {}',
  ])('accepts %s', (code) => {
    expect(findings(code)).toEqual([]);
  });

  test.each([
    ['type User = string;', 'User'],
    ['type IUser = string;', 'IUser'],
    ['type Table = string;', 'Table'],
    ['type userType = string;', 'userType'],
    ['interface User {}', 'User'],
    ['interface Ifoo {}', 'Ifoo'],
    ['interface Item {}', 'Item'],
    ['interface TUser {}', 'TUser'],
  ])('reports %s', (code, name) => {
    const messages = findings(code);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(`\`${name}\``);
  });
});
