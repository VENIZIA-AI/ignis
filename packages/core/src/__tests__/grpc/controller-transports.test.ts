import { describe, test, expect } from 'bun:test';
import { ControllerTransports } from '@/base/controllers/common/constants';

describe('ControllerTransports', () => {
  test('should have REST and GRPC constants', () => {
    expect(ControllerTransports.REST).toBe('rest');
    expect(ControllerTransports.GRPC).toBe('grpc');
  });

  test('should validate known transports', () => {
    expect(ControllerTransports.isValid('rest')).toBe(true);
    expect(ControllerTransports.isValid('grpc')).toBe(true);
  });

  test('should reject unknown transports', () => {
    expect(ControllerTransports.isValid('http')).toBe(false);
    expect(ControllerTransports.isValid('websocket')).toBe(false);
    expect(ControllerTransports.isValid('')).toBe(false);
  });

  test('SCHEME_SET should contain both transports', () => {
    expect(ControllerTransports.SCHEME_SET.size).toBe(2);
    expect(ControllerTransports.SCHEME_SET.has('rest')).toBe(true);
    expect(ControllerTransports.SCHEME_SET.has('grpc')).toBe(true);
  });
});
