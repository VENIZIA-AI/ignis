---
title: "@venizia/ignis-helpers/bun-s3"
description: "Every export of @venizia/ignis-helpers/bun-s3, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/bun-s3`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `BunS3Helper`

*class*

Storage helper for S3-compatible object stores through Bun's `S3Client`. Uses separate hosts for calls this process makes and for URLs handed to browsers.

```ts
export declare class BunS3Helper extends BaseStorageHelper {
    readonly storageType = "bun-s3";
    private client;
    private credentials;
    /** Undefined leaves Bun's own defaults in force. */
    private transfer;
    constructor(options: IBunS3HelperOptions);
    /** One bucket's objects, in either addressing style. `audience` picks the host: `server` for a call this process makes, `browser` for a URL it hands out. Virtual-hosted derives the per-bucket host, because the bucket arrives per call. */
    private objectEndpoint;
    /** Per-call overrides, so one client serves every bucket in either addressing style. */
    private presignOptions;
    /**
     * What a call this process makes on one bucket's objects (or its listing) passes to Bun's client. Path style needs only the
     * bucket. Virtual-hosted style needs the bucket's own host as well: Bun puts the bucket in neither the host nor the path in that
     * mode, so a call without it goes to the bare endpoint (`PUT /k.png` on the endpoint host) and never reaches the object.
     */
    private callOptions;
    hasBucket(opts: {
        bucket: IBucketRef;
    }): Promise<boolean>;
    getBuckets(): Promise<IBucketInfo[]>;
    /** S3 exposes a creation date only through `ListBuckets`, so one full listing is the cheapest correct answer. */
    getBucket(opts: {
        bucket: IBucketRef;
    }): Promise<IBucketInfo | null>;
    createBucket(opts: {
        bucket: IBucketRef;
    }): Promise<IBucketInfo | null>;
    removeBucket(opts: {
        bucket: IBucketRef;
    }): Promise<boolean>;
    copyObject(opts: ICopyObjectOptions): Promise<void>;
    presignPost(opts: IPresignPostOptions): Promise<IPostPolicy>;
    presignPut(opts: IPresignPutOptions): Promise<string>;
    presignGet(opts: IPresignGetOptions): Promise<string>;
    getObjectTags(opts: IObjectLocation): Promise<Record<string, string>>;
    replaceObjectTags(opts: IObjectLocation & {
        tags: Record<string, string>;
    }): Promise<void>;
    protected get defaultLinkPrefix(): string;
    protected writeObject(opts: IObjectLocation & {
        file: IUploadFile;
    }): Promise<void>;
    /** Streams without holding the object in memory. `upload` carries a `Buffer`, so it cannot; this is the path for anything large. */
    writeStream(opts: IWriteStreamOptions): Promise<void>;
    /** `S3File.stream()` is lazy: it reaches the network on first read, so a `try` here never sees a 404 - the failure arrives on the stream. */
    getObject(opts: IObjectLocation & {
        options?: unknown;
    }): Promise<Readable>;
    /** The conversion-free path a `Response` body wants. `slice` makes it a ranged GET, so only the requested bytes leave S3. */
    getObjectStream(opts: TObjectStreamOptions): Promise<ReadableStream<Uint8Array>>;
    /** The ETag with the quotes S3 sends and expects in `If-Match`. */
    private static quoteEtag;
    /** Signs and sends one request: the one place credentials, signing and the verb's case meet. */
    private send;
    /** A bucket operation is a call this process makes, so it goes to the default host. */
    private bucketFetch;
    /** One object-level request, addressed in the configured style on the host this process talks to. */
    private signedFetch;
    /** The storage error a response stands for: 412 is a changed object, 404 a missing one, any other failure the backend's own. */
    private assertObjectResponse;
    /** `S3File` cannot send `If-Match` or a version id, so a conditional read is a signed GET. */
    private getConditionalStream;
    /** A signed HEAD rather than `client.stat`, because Bun's stat does not report the version id a pin needs. */
    getStat(opts: IObjectLocation): Promise<IFileStat>;
    removeObject(opts: IObjectLocation): Promise<void>;
    removeObjects(opts: {
        bucket: IBucketRef;
        objects: IObjectRef[];
    }): Promise<void>;
    /** S3 caps a call at 1000 keys and continues through `nextContinuationToken`. `useRecursive: false` maps to `delimiter: '/'`. */
    listObjects(opts: IListObjectsOptions): Promise<IObjectInfo[]>;
}
```

Source: `packages/helpers/src/modules/storage/bun-s3/helper.ts`

## `IBunS3HelperOptions`

*interface*

Options for `BunS3Helper`. Unset `partSize`, `queueSize` and `retry` leave Bun defaults in force.

```ts
export interface IBunS3HelperOptions extends IStorageHelperOptions {
    accessKey: string;
    secretKey: string;
    /** @default 'us-east-1' */
    region?: string;
    sessionToken?: string;
    /** `default` is the host THIS process talks to; `public` is the host a browser is handed. `host` is inside every SigV4 signature, so a URL signed against an internal name cannot be rewritten later - which is why the two are separate rather than one value patched afterwards. */
    endpoint: {
        default: string;
        /** @default endpoint.default */
        public?: string;
    };
    /**
     * `https://<bucket>.<endpoint>/<key>` instead of `<endpoint>/<bucket>/<key>`. AWS requires it; MinIO and R2 do not.
     *
     * @default false
     */
    virtualHostedStyle?: boolean;
    partSize?: number;
    queueSize?: number;
    /** Retries Bun performs on a failed part before the write fails. */
    retry?: number;
}
```

Source: `packages/helpers/src/modules/storage/bun-s3/helper.ts`
