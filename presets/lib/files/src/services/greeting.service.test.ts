import { describe, expect, test } from 'bun:test';
import { GreetingService } from '#src/services/greeting.service';

describe('GreetingService', () => {
  test('greets by name', () => {
    expect(new GreetingService().greet({ name: 'IGNIS' })).toBe('Hello, IGNIS!');
  });
});
