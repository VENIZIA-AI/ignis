import { describe, expect, test } from 'bun:test';
import { Greeting } from './index';

describe('Greeting', () => {
  test('greets by name and names the package', () => {
    expect(Greeting.of({ name: 'IGNIS' })).toBe('Hello, IGNIS, from {{package}}!');
  });
});
