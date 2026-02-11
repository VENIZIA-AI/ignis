/**
 * WebSocket Core Component Test Suite
 *
 * Tests for WebSocketBindingKeys and WebSocketComponent.
 *
 * The WebSocketComponent requires a mocked BaseApplication for DI container
 * operations. Full integration tests require a running Bun server and Redis.
 *
 * Test Categories:
 * 1. WebSocketBindingKeys - Binding key constants
 * 2. WebSocketComponent - Constructor, bindings, resolveBindings, runtime check
 *
 * @module __tests__/websocket
 */

import { describe, test, expect } from 'bun:test';
import { WebSocketBindingKeys } from '@/components/websocket/common/keys';

// =============================================================================
// WebSocketBindingKeys Tests
// =============================================================================

describe('WebSocketBindingKeys', () => {
  test('should have correct binding key for WEBSOCKET_INSTANCE', () => {
    expect(WebSocketBindingKeys.WEBSOCKET_INSTANCE).toBe('@app/websocket/instance');
  });

  test('should have correct binding key for SERVER_OPTIONS', () => {
    expect(WebSocketBindingKeys.SERVER_OPTIONS).toBe('@app/websocket/server-options');
  });

  test('should have correct binding key for REDIS_CONNECTION', () => {
    expect(WebSocketBindingKeys.REDIS_CONNECTION).toBe('@app/websocket/redis-connection');
  });

  test('should have correct binding key for AUTHENTICATE_HANDLER', () => {
    expect(WebSocketBindingKeys.AUTHENTICATE_HANDLER).toBe('@app/websocket/authenticate-handler');
  });

  test('should have correct binding key for VALIDATE_ROOM_HANDLER', () => {
    expect(WebSocketBindingKeys.VALIDATE_ROOM_HANDLER).toBe('@app/websocket/validate-room-handler');
  });

  test('should have correct binding key for CLIENT_CONNECTED_HANDLER', () => {
    expect(WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER).toBe(
      '@app/websocket/client-connected-handler',
    );
  });

  test('should have correct binding key for CLIENT_DISCONNECTED_HANDLER', () => {
    expect(WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER).toBe(
      '@app/websocket/client-disconnected-handler',
    );
  });

  test('should have correct binding key for MESSAGE_HANDLER', () => {
    expect(WebSocketBindingKeys.MESSAGE_HANDLER).toBe('@app/websocket/message-handler');
  });

  test('all keys should start with @app/websocket/', () => {
    const keys = [
      WebSocketBindingKeys.WEBSOCKET_INSTANCE,
      WebSocketBindingKeys.SERVER_OPTIONS,
      WebSocketBindingKeys.REDIS_CONNECTION,
      WebSocketBindingKeys.AUTHENTICATE_HANDLER,
      WebSocketBindingKeys.VALIDATE_ROOM_HANDLER,
      WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER,
      WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER,
      WebSocketBindingKeys.MESSAGE_HANDLER,
    ];

    for (const key of keys) {
      expect(key.startsWith('@app/websocket/')).toBe(true);
    }
  });

  test('all keys should be unique', () => {
    const keys = [
      WebSocketBindingKeys.WEBSOCKET_INSTANCE,
      WebSocketBindingKeys.SERVER_OPTIONS,
      WebSocketBindingKeys.REDIS_CONNECTION,
      WebSocketBindingKeys.AUTHENTICATE_HANDLER,
      WebSocketBindingKeys.VALIDATE_ROOM_HANDLER,
      WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER,
      WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER,
      WebSocketBindingKeys.MESSAGE_HANDLER,
    ];

    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  test('should have exactly 10 binding keys', () => {
    const keys = Object.getOwnPropertyNames(WebSocketBindingKeys).filter(
      k => !['length', 'prototype', 'name'].includes(k),
    );
    expect(keys).toHaveLength(10);
  });
});
