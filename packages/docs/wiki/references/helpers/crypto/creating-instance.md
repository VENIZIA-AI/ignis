# Creating an Instance

All crypto algorithm classes extend `BaseHelper` (via `AbstractCryptoAlgorithm`), providing scoped logging. Each class uses a static `withAlgorithm()` factory method.

```typescript
import { AES, RSA, ECDH } from '@venizia/ignis-helpers';

// AES — choose CBC or GCM mode
const aesCbc = AES.withAlgorithm('aes-256-cbc');
const aesGcm = AES.withAlgorithm('aes-256-gcm');

// RSA — single algorithm, no parameters
const rsa = RSA.withAlgorithm();

// ECDH — optional HKDF info for key isolation
const ecdh = ECDH.withAlgorithm();
const ecdhCustom = ECDH.withAlgorithm({
  algorithm: 'ecdh-p256',
  hkdfInfo: 'my-app-session-keys',
});
```

::: details AES options

| Algorithm | Mode | Features |
|-----------|------|----------|
| `aes-256-cbc` | CBC | Standard block cipher, widely compatible |
| `aes-256-gcm` | GCM | Authenticated encryption -- detects tampering |

:::

::: details ECDH options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `algorithm` | `'ecdh-p256'` | `'ecdh-p256'` | Curve algorithm |
| `hkdfInfo` | `string` | `'ignis-ecdh-p256-aes-256-gcm-v1'` | HKDF info string for key derivation isolation |

Different `hkdfInfo` values produce **incompatible keys** from the same ECDH shared secret. Use this to isolate key derivation between different application contexts.

:::

::: details Type hierarchy

All crypto algorithms share a common type hierarchy with 7 generic type parameters:

```
ICryptoAlgorithm (interface)
  └── AbstractCryptoAlgorithm (extends BaseHelper)
        ├── BaseCryptoAlgorithm (adds normalizeSecretKey, getAlgorithmKeySize)
        │     ├── AES
        │     └── RSA
        └── ECDH (uses CryptoKey objects, not string secrets)
```

**Why two base classes?**
- `BaseCryptoAlgorithm` adds `normalizeSecretKey()` and `getAlgorithmKeySize()` -- useful for AES/RSA which use string secrets with size normalization
- `ECDH` extends `AbstractCryptoAlgorithm` directly because it uses `CryptoKey` objects (Web Crypto), not string secrets

```typescript
interface ICryptoAlgorithm<
  AlgorithmNameType extends string,
  EncryptInputType = unknown,
  DecryptInputType = unknown,
  SecretKeyType = unknown,
  EncryptReturnType = unknown,
  DecryptReturnType = unknown,
  ExtraOptions = unknown,
> {
  algorithm: AlgorithmNameType;
  encrypt(opts: { message: EncryptInputType; secret: SecretKeyType; opts?: ExtraOptions }): EncryptReturnType;
  decrypt(opts: { message: DecryptInputType; secret: SecretKeyType; opts?: ExtraOptions }): DecryptReturnType;
}
```

:::
