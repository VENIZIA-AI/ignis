---
title: ECDH runs in a browser
description: "ECDH and AbstractCryptoAlgorithm in @venizia/ignis-helpers can now be imported from @venizia/ignis-helpers/core, so a page and a server speak one ECDH wire format with one class."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-02

## ECDH runs in a browser

<Badge type="tip" text="New Feature" />

**In one line.** Import `ECDH` from `@venizia/ignis-helpers/core` to run the ECDH key exchange and AES-GCM session encryption in a browser or a Worker, in the same wire format as the server.

## What changed

- **`ECDH` and `AbstractCryptoAlgorithm` are on `@venizia/ignis-helpers/core`.** The types `ECDHAlgorithmType`, `IECDHEncryptedPayload` and `IECDHExtraOptions` come with them. The `/core` entry stays free of `node:*`.
- **`ECDH` no longer uses `Buffer`.** It turns base64 into bytes with `btoa` and `atob`, with the same checks and the same `[ECDH.fromBase64] Invalid base64 input` error.
- **The wire format does not change.** A server `ECDH` and a browser `ECDH` derive the same key and read each other's `{ iv, ct }` payloads, with or without `additionalData`. Payloads written before this release decrypt as before.
- **`AbstractCryptoAlgorithm` moved to its own file.** It still extends `BaseHelper`, and it is still exported from the package root. `AES` and `RSA` still extend it through `BaseCryptoAlgorithm`.

## Who is affected

- **Browser and Worker apps that talk to a server `ECDH` endpoint.** You can drop your own WebCrypto copy and import `ECDH` from `@venizia/ignis-helpers/core`.
- **Everyone else.** No action. `ECDH.withAlgorithm()`, `new ECDH({ algorithm, hkdfInfo })` and every method keep their signatures, and every current import path keeps working.

## Details

```typescript
import { ECDH } from '@venizia/ignis-helpers/core';

const ecdh = ECDH.withAlgorithm();
const { keyPair, publicKeyB64 } = await ecdh.generateKeyPair();

// publicKeyB64 goes to the server; the server's public key and the salt come back.
const peerPublicKey = await ecdh.importPublicKey({ rawKeyB64: serverPublicKeyB64 });
const { key } = await ecdh.deriveAESKey({
  privateKey: keyPair.privateKey,
  peerPublicKey,
  salt: saltB64,
});

const payload = await ecdh.encrypt({ message: 'hello', secret: key });
```

`AES` and `RSA` stay server-side: they are synchronous over `node:crypto`, and WebCrypto is asynchronous.
