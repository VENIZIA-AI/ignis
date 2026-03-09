# How `buildSignedRequest` Works

## Background

Bun's `S3Client` handles AWS authentication automatically for object-level operations
(`.write()`, `.file()`, `.delete()`, `.list()`, `.stat()`). However, it has **no API
for bucket management** — creating, deleting, or listing buckets.

To fill that gap, `getBuckets`, `createBucket`, and `removeBucket` fall back to raw
`fetch()` calls against the S3 API endpoint. A raw HTTP request carries no AWS identity,
so the server will reject it with a 403. `buildSignedRequest` solves this by computing
the `Authorization` header that proves the request is authentic and untampered — the same
thing Bun does internally, just done manually here.

---

## The Protocol: AWS Signature Version 4 (SigV4)

AWS Signature Version 4 is the authentication scheme used by S3 and every other AWS
service. It works by:

1. Describing the exact request in a canonical, deterministic string.
2. Deriving a short-lived signing key from your credentials, the date, region, and service.
3. Signing the canonical request with that key using HMAC-SHA256.
4. Attaching the signature to the `Authorization` header.

The server recomputes the same signature independently. If they match, the request is
authentic.

---

## Step-by-Step Walkthrough

### Step 1 — Timestamps

```ts
const amzDate  = "20240315T123456Z"   // ISO 8601 compact, UTC
const dateStamp = "20240315"           // date-only prefix of amzDate
```

Both values are derived from `new Date()` at call time. They are included in the request
headers and in the signature scope so that replayed requests expire quickly (AWS rejects
requests older than 15 minutes by default).

---

### Step 2 — Payload Hash

```ts
const payloadHash = await sha256Hex(body)
// body is "" for GET/DELETE/PUT-bucket (no body), so this is the SHA-256 of an empty string
```

The body is hashed to detect tampering. Even for requests with no body the hash is
included (`sha256("")` is a well-known constant). It is sent as the `x-amz-content-sha256`
header and also embedded in the canonical request.

---

### Step 3 — Canonical Request

```
GET
/
                                  ← empty query string
host:my-bucket.s3.amazonaws.com
x-amz-content-sha256:<payloadHash>
x-amz-date:20240315T123456Z

host;x-amz-content-sha256;x-amz-date
<payloadHash>
```

Format:
```
METHOD\n
URI_PATH\n
QUERY_STRING\n
HEADER_NAME:VALUE\n   (one per signed header, sorted alphabetically, each ends with \n)
\n                    (blank line terminating the header block)
SIGNED_HEADERS\n      (semicolon-separated header names in the same sorted order)
PAYLOAD_HASH
```

Rules:
- Headers are **sorted alphabetically** by name.
- Each header line ends with `\n`, producing a trailing blank line after the block.
- The `signed_headers` field lists exactly the same headers that appear above.
- Only headers listed here are covered by the signature; adding extra headers later is safe.

If a session token is present (`x-amz-security-token`) it is added to the header block
and the signed-headers list before sorting.

---

### Step 4 — String to Sign

```
AWS4-HMAC-SHA256
20240315T123456Z
20240315/us-east-1/s3/aws4_request
<sha256hex of canonical request>
```

Format:
```
ALGORITHM\n
TIMESTAMP\n
CREDENTIAL_SCOPE\n
HEX(SHA256(CANONICAL_REQUEST))
```

The credential scope `date/region/service/aws4_request` pins the signature to a specific
day, AWS region, and service. A signature produced for `s3` in `us-east-1` cannot be
replayed against a different region or service.

---

### Step 5 — Signing Key Derivation

Instead of signing directly with the long-lived secret key, a short-lived derived key is
produced through a chain of four HMAC-SHA256 operations:

```
kDate    = HMAC-SHA256("AWS4" + secretAccessKey,  dateStamp)
kRegion  = HMAC-SHA256(kDate,                      region)
kService = HMAC-SHA256(kRegion,                    "s3")
kSigning = HMAC-SHA256(kService,                   "aws4_request")
```

Each step binds the key more tightly to the current context. The final `kSigning` is only
valid for requests made to S3 on that calendar date in that region. This limits the blast
radius if a derived key is ever exposed: it expires at midnight UTC and cannot be reused
for any other service or region.

---

### Step 6 — Signature

```ts
const signature = toHex(HMAC-SHA256(kSigning, stringToSign))
```

The string-to-sign is signed with the derived key, producing a 64-character hex string.

---

### Step 7 — Authorization Header

```
Authorization: AWS4-HMAC-SHA256
  Credential=AKIAIOSFODNN7EXAMPLE/20240315/us-east-1/s3/aws4_request,
  SignedHeaders=host;x-amz-content-sha256;x-amz-date,
  Signature=<64-char hex>
```

This single header carries everything the server needs to verify the request:
- **Credential** — who is making the request and the scope they claimed.
- **SignedHeaders** — which headers were covered by the signature.
- **Signature** — the proof.

---

## What the function returns

```ts
return {
  url,      // full URL: endpoint + path
  headers: {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    // 'x-amz-security-token': sessionToken  (only if present)
    Authorization: authHeader,
    'Content-Length': String(body.length),
  }
}
```

The caller passes these directly to `fetch()`:

```ts
const { url, headers } = await buildSignedRequest({ method: 'PUT', path: '/my-bucket', ... })
const res = await fetch(url, { method: 'PUT', headers })
```

---

## Why only for bucket operations?

| Operation | Implementation | Signing |
|---|---|---|
| upload, getFile, getStat, removeObject, listObjects | `this.client.*` (Bun S3Client) | Automatic — Bun handles it |
| getBuckets, createBucket, removeBucket | raw `fetch()` | Manual — `buildSignedRequest` |

Bun's `S3Client` deliberately covers only object-level operations. Buckets are treated as
pre-existing infrastructure. Because there is no Bun API for bucket management, those
three methods bypass the client entirely and call the S3 REST API directly, which requires
manual signing.

---

## References

- [AWS Signature Version 4 — signing process](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_aws-signing.html)
- [Creating a signed AWS API request](https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html)
- [S3 REST API — CreateBucket](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html)
- [S3 REST API — ListBuckets](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListBuckets.html)
- [S3 REST API — DeleteBucket](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteBucket.html)
- [Bun S3Client API Reference](https://bun.sh/reference/bun/S3Client)
- [Bun S3 Docs](https://bun.sh/docs/runtime/s3)
