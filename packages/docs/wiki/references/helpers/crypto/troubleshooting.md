# Troubleshooting

## "Unsupported state or unable to authenticate data"

**Cause:** The ciphertext or auth tag was modified in transit, or you are decrypting GCM ciphertext with a CBC instance (or vice versa). CBC and GCM produce incompatible ciphertext formats.

**Fix:** Ensure the same algorithm mode is used for both encrypt and decrypt:

```typescript
// Both must use the same mode
const aes = AES.withAlgorithm('aes-256-gcm');
const encrypted = aes.encrypt({ message, secret });
const decrypted = aes.decrypt({ message: encrypted, secret }); // same instance or same mode
```

## "ECDH decrypt throws even though both sides used each other's public keys"

**Cause:** Each call to `deriveAESKey` without a `salt` parameter generates a new random 32-byte salt. If both sides generate their own salt, they derive different AES keys.

**Fix:** The initiator calls `deriveAESKey` without `salt` (generates one), then sends the returned `salt` string to the responder. The responder passes that `salt` into their `deriveAESKey` call.

```typescript
// Initiator
const { key: aliceKey, salt } = await ecdh.deriveAESKey({
  privateKey: alice.keyPair.privateKey,
  peerPublicKey: bobPub,
});
// Send `salt` to responder

// Responder
const { key: bobKey } = await ecdh.deriveAESKey({
  privateKey: bob.keyPair.privateKey,
  peerPublicKey: alicePub,
  salt, // <-- use initiator's salt
});
```

## "SHA256 hash returns the original text instead of a hash"

**Cause:** The `SHA256` algorithm uses `createHmac` internally, which requires a `secret` parameter. When `secret` is `undefined`, the function short-circuits and returns the original text.

**Fix:** Always provide a `secret` when using `SHA256`:

```typescript
const hashed = hash('text', {
  algorithm: 'SHA256',
  secret: 'my-hmac-key',
  outputType: 'hex',
});
```
