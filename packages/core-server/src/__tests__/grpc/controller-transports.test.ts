import { describe, test, expect } from 'bun:test';
import { ControllerTransports } from '@venizia/ignis-kernel';

describe('ControllerTransports', () => {
  test('should have REST and GRPC constants', () => {
    expect(ControllerTransports.REST).toBe('rest');
    expect(ControllerTransports.GRPC).toBe('grpc');
  });
});
