---
title: "@venizia/ignis-helpers/kafka"
description: "Every export of @venizia/ignis-helpers/kafka, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/kafka`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

40 exports, 40 with TSDoc.

## `BaseKafkaHelper`

*class*

Shared health tracking and broker event wiring for all Kafka helpers (producer, consumer, admin); `TClient` is the platformatic client type, passed by subclasses via `super({ client })`.

Every member below is `protected`, not `private`, so a producer, consumer, or admin helper can extend this class instead of forking it. That visibility is not a stable contract between minor versions.

```ts
export declare abstract class BaseKafkaHelper<TClient extends Base<BaseOptions>> extends BaseHelper {
    protected client: TClient;
    protected readonly shutdownTimeout: number;
    protected healthStatus: TKafkaHealthStatus;
    /** Per-broker connection state. Key = "host:port" */
    protected readonly connectedBrokers: Set<string>;
    protected readonly onBrokerConnect?: TKafkaBrokerEventCallback;
    protected readonly onBrokerDisconnect?: TKafkaBrokerEventCallback;
    constructor(opts: IKafkaBaseOptions<TClient>);
    isHealthy(): boolean;
    isReady(): boolean;
    getHealthStatus(): TKafkaHealthStatus;
    getConnectedBrokerCount(): number;
    protected configureBrokerConnect(): void;
    protected configureBrokerDisconnect(): void;
    protected configureBrokerFailed(): void;
    protected configureBrokerEvents(): void;
    protected unconfigureBrokerEvents(): void;
    protected swapClient(newClient: TClient): void;
    protected resetHealthState(): void;
    protected closeClient(): Promise<void>;
    /** Force-close through the callback overload: only Producer and Consumer expose `close(force, cb)`, and the `Base` type this class is generic over declares no such overload - hence the guard. */
    protected closeClientWithCallback(): Promise<void>;
    protected gracefulCloseClient(): Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/kafka/base.ts`

## `IKafkaAdminOptions`

*interface*

Options for the Kafka admin helper. `shutdownTimeout` is in milliseconds.

```ts
export interface IKafkaAdminOptions extends IKafkaConnectionOptions {
    identifier?: string;
    shutdownTimeout?: number;
    onBrokerConnect?: TKafkaBrokerEventCallback;
    onBrokerDisconnect?: TKafkaBrokerEventCallback;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/admin.ts`

## `IKafkaBaseOptions`

*interface*

Options shared by the Kafka helpers.

```ts
export interface IKafkaBaseOptions<TClient extends Base<BaseOptions>> {
    scope: string;
    identifier: string;
    client: TClient;
    /**
     * Milliseconds the helper waits for in-flight work on shutdown.
     * @default KafkaDefaults.SHUTDOWN_TIMEOUT
     */
    shutdownTimeout?: number;
    onBrokerConnect?: TKafkaBrokerEventCallback;
    onBrokerDisconnect?: TKafkaBrokerEventCallback;
}
```

Source: `packages/helpers/src/modules/queue/kafka/base.ts`

## `IKafkaConnectionOptions`

*interface*

Connection options shared by every Kafka helper. `retryDelay` is in milliseconds.

```ts
export interface IKafkaConnectionOptions extends ConnectionOptions {
    bootstrapBrokers: string[];
    clientId: string;
    retries?: number;
    retryDelay?: number;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/connection.ts`

## `IKafkaConsumerOptions`

*interface*

Options for the Kafka consumer helper. `groupId` is required; timeouts and intervals are in milliseconds and `maxBytes` is in bytes.

```ts
export interface IKafkaConsumerOptions<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string> extends IKafkaConnectionOptions {
    groupId: string;
    identifier?: string;
    deserializers?: Partial<Deserializers<KeyType, ValueType, HeaderKeyType, HeaderValueType>>;
    /**
     * Automatic offset commit: a boolean, or a number that sets the commit interval.
     * @default KafkaDefaults.AUTOCOMMIT
     */
    autocommit?: boolean | number;
    /**
     * Milliseconds without a heartbeat before the broker drops the member from the group.
     * @default KafkaDefaults.SESSION_TIMEOUT
     */
    sessionTimeout?: number;
    /**
     * Milliseconds between heartbeats to the group coordinator.
     * @default KafkaDefaults.HEARTBEAT_INTERVAL
     */
    heartbeatInterval?: number;
    /**
     * How long the group waits for members to rejoin on a rebalance.
     * @default the `sessionTimeout` in effect
     */
    rebalanceTimeout?: number;
    /**
     * Messages the consume stream buffers before it applies backpressure.
     * @default KafkaDefaults.HIGH_WATER_MARK
     */
    highWaterMark?: number;
    /**
     * Fewest bytes a fetch waits for before it returns.
     * @default KafkaDefaults.MIN_BYTES
     */
    minBytes?: number;
    /**
     * Most bytes a fetch returns.
     * @default KafkaDefaults.MAX_BYTES
     */
    maxBytes?: number;
    /**
     * Milliseconds a fetch waits for `minBytes` before it returns anyway.
     * @default KafkaDefaults.MAX_WAIT_TIME
     */
    maxWaitTime?: number;
    /**
     * Milliseconds before the cluster metadata is refreshed.
     * @default KafkaDefaults.METADATA_MAX_AGE
     */
    metadataMaxAge?: number;
    /**
     * The consumer group protocol.
     * @default KafkaDefaults.GROUP_PROTOCOL
     */
    groupProtocol?: TKafkaGroupProtocol;
    groupInstanceId?: string;
    /**
     * Milliseconds the helper waits for in-flight work on shutdown.
     * @default KafkaDefaults.SHUTDOWN_TIMEOUT
     */
    shutdownTimeout?: number;
    registry?: SchemaRegistry<unknown, unknown, KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    onBrokerConnect?: TKafkaBrokerEventCallback;
    onBrokerDisconnect?: TKafkaBrokerEventCallback;
    onMessage?: TKafkaMessageCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    onMessageDone?: TKafkaMessageDoneCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    onMessageError?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    /** Stream 'error' events; falls back to `onMessageError` when unset. */
    onStreamError?: TKafkaStreamErrorCallback;
    /** Reconnect failures (client rebuild or the reconnect attempt); falls back to `onMessageError` when unset. */
    onReconnectError?: TKafkaReconnectErrorCallback;
    onGroupJoin?: TKafkaGroupJoinCallback;
    onGroupLeave?: TKafkaGroupLeaveCallback;
    onGroupRebalance?: TKafkaGroupRebalanceCallback;
    onHeartbeatError?: TKafkaHeartbeatErrorCallback;
    onLag?: TKafkaLagCallback;
    onLagError?: TKafkaLagErrorCallback;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/consumer.ts`

## `IKafkaConsumeStartOptions`

*interface*

Options for starting consumption. `reconnectDelayMs` is in milliseconds.

```ts
export interface IKafkaConsumeStartOptions {
    topics: string[];
    /**
     * Where a new consume stream starts reading.
     * @default KafkaDefaults.CONSUME_MODE
     */
    mode?: MessagesStreamModeValue;
    /**
     * Where the stream starts when `mode` finds no committed offset.
     * @default KafkaDefaults.CONSUME_FALLBACK_MODE
     */
    fallbackMode?: MessagesStreamFallbackModeValue;
    /**
     * Milliseconds between reconnect attempts.
     * @default KafkaDefaults.RECONNECT_DELAY
     */
    reconnectDelayMs?: number;
    /**
     * Reconnect attempts before the consume loop gives up.
     * @default KafkaDefaults.MAX_RECONNECT_ATTEMPTS
     */
    maxReconnectAttempts?: number;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/consumer.ts`

## `IKafkaProducerOptions`

*interface*

Options for the Kafka producer helper. `acks` takes a {@link KafkaAcks} value; `shutdownTimeout` is in milliseconds.

```ts
export interface IKafkaProducerOptions<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string> extends IKafkaConnectionOptions {
    identifier?: string;
    serializers?: Partial<Serializers<KeyType, ValueType, HeaderKeyType, HeaderValueType>>;
    compression?: CompressionAlgorithmValue;
    acks?: TKafkaAcks;
    idempotent?: boolean;
    transactionalId?: string;
    strict?: boolean;
    autocreateTopics?: boolean;
    shutdownTimeout?: number;
    registry?: SchemaRegistry<unknown, unknown, KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    onBrokerConnect?: TKafkaBrokerEventCallback;
    onBrokerDisconnect?: TKafkaBrokerEventCallback;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/producer.ts`

## `IKafkaSchemaRegistryOptions`

*interface*

Options for a Confluent schema registry client, with an optional logger `identifier`.

```ts
export interface IKafkaSchemaRegistryOptions extends ConfluentSchemaRegistryOptions {
    identifier?: string;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/connection.ts`

## `IKafkaTransactionContext`

*interface*

Handle passed to a transaction body: the open `transaction`, plus `send`, `addConsumer` and `addOffset` bound to it.

```ts
export interface IKafkaTransactionContext<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    transaction: Awaited<ReturnType<Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>['beginTransaction']>>;
    send: (opts: SendOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>) => Promise<ProduceResult>;
    addConsumer: <ConsumerKeyType, ConsumerValueType, ConsumerHeaderKeyType, ConsumerHeaderValueType>(consumer: Consumer<ConsumerKeyType, ConsumerValueType, ConsumerHeaderKeyType, ConsumerHeaderValueType>) => Promise<void>;
    addOffset: <MessageKeyType, MessageValueType, MessageHeaderKeyType, MessageHeaderValueType>(message: Message<MessageKeyType, MessageValueType, MessageHeaderKeyType, MessageHeaderValueType>) => Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `KafkaAcks`

*class*

Producer acknowledgment level, as the Kafka `acks` number: `0` none, `1` leader, `-1` all in-sync replicas.

```ts
export declare class KafkaAcks {
    static readonly NONE = 0;
    static readonly LEADER = 1;
    static readonly ALL = -1;
    static readonly SCHEME_SET: Set<number>;
    static isValid(ack: number): boolean;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `KafkaAdminHelper`

*class*

Wrapper around `@platformatic/kafka` Admin with lifecycle management and health tracking; `getAdmin()` exposes the full Admin API directly.

```ts
export declare class KafkaAdminHelper extends BaseKafkaHelper<Admin> {
    constructor(opts: IKafkaAdminOptions);
    static newInstance(opts: IKafkaAdminOptions): KafkaAdminHelper;
    getAdmin(): Admin;
    close(opts?: {
        isForce?: boolean;
    }): Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/kafka/admin.ts`

## `KafkaBrokersDownReasons`

*class*

Why every broker of a consumer is gone: DISCONNECTED (the connections closed) or FAILED (they errored).

```ts
export declare class KafkaBrokersDownReasons {
    static readonly DISCONNECTED = "disconnected";
    static readonly FAILED = "failed";
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `KafkaBundlerPluginNames`

*class*

Names of the bundler plugins that patch `@platformatic/kafka` for a single-file build.

```ts
export declare class KafkaBundlerPluginNames {
    static readonly PLATFORMATIC_WASM = "ignis:platformatic-wasm";
    static readonly PLATFORMATIC_REQUIRE = "ignis:platformatic-require";
}
```

Source: `packages/helpers/src/modules/queue/kafka/bundler/common/constants.ts`

## `KafkaClientEvents`

*class*

Names of the `@platformatic/kafka` client, consumer-group and stream events the helpers listen to.

```ts
export declare class KafkaClientEvents {
    static readonly BROKER_CONNECT = "client:broker:connect";
    static readonly BROKER_DISCONNECT = "client:broker:disconnect";
    static readonly BROKER_FAILED = "client:broker:failed";
    static readonly CONSUMER_GROUP_JOIN = "consumer:group:join";
    static readonly CONSUMER_GROUP_LEAVE = "consumer:group:leave";
    static readonly CONSUMER_GROUP_REBALANCE = "consumer:group:rebalance";
    static readonly CONSUMER_HEARTBEAT_ERROR = "consumer:heartbeat:error";
    static readonly CONSUMER_LAG = "consumer:lag";
    static readonly CONSUMER_LAG_ERROR = "consumer:lag:error";
    static readonly STREAM_DATA = "data";
    static readonly STREAM_ERROR = "error";
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `KafkaConsumerHelper`

*class*

Wrapper around `@platformatic/kafka` Consumer with lifecycle management, health tracking, graceful shutdown, message callbacks, and lag monitoring.

Every member below is `protected`, not `private`, so a consumer extends this class instead of forking it. That visibility is not a stable contract between minor versions.

```ts
export declare class KafkaConsumerHelper<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string> extends BaseKafkaHelper<Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>> {
    protected stream: MessagesStream<KeyType, ValueType, HeaderKeyType, HeaderValueType> | null;
    protected consumeLoop: Promise<void> | null;
    protected consumeStartOptions: IKafkaConsumeStartOptions | null;
    protected lagMonitoringActive: boolean;
    protected lagMonitoringOptions: {
        topics: string[];
        interval?: number;
    } | null;
    protected sessionLikelyStale: boolean;
    protected readonly onMessage?: TKafkaMessageCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    protected readonly onMessageDone?: TKafkaMessageDoneCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    protected readonly onMessageError?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    protected readonly onStreamError?: TKafkaStreamErrorCallback;
    protected readonly onReconnectError?: TKafkaReconnectErrorCallback;
    protected readonly onGroupJoin?: TKafkaGroupJoinCallback;
    protected readonly onGroupLeave?: TKafkaGroupLeaveCallback;
    protected readonly onGroupRebalance?: TKafkaGroupRebalanceCallback;
    protected readonly onHeartbeatError?: TKafkaHeartbeatErrorCallback;
    protected readonly onLag?: TKafkaLagCallback;
    protected readonly onLagError?: TKafkaLagErrorCallback;
    protected readonly initialOptions: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    constructor(opts: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>);
    static newInstance<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string>(opts: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>): KafkaConsumerHelper<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    /** The instance seam every rebuild goes through; the constructor alone uses the static factory because no instance exists yet. Override this to hand a rebuilt consumer different options or a test double. */
    protected buildClient(opts: {
        options: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    }): Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    protected static buildConsumerClient<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string>(opts: IKafkaConsumerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>): Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    getConsumer(): Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    getStream(): MessagesStream<KeyType, ValueType, HeaderKeyType, HeaderValueType> | null;
    isReady(): boolean;
    start(opts: IKafkaConsumeStartOptions): Promise<void>;
    startLagMonitoring(opts: {
        topics: string[];
        interval?: number;
    }): void;
    stopLagMonitoring(): void;
    protected closeClient(): Promise<void>;
    close(opts?: {
        isForce?: boolean;
    }): Promise<void>;
    protected startConsumeLoop(opts: {
        messageHandler: TKafkaMessageCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
        doneHandler?: TKafkaMessageDoneCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
        errorHandler?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
        reconnectDelayMs: number;
        maxReconnectAttempts: number;
    }): Promise<void>;
    protected consumeMessages(opts: {
        reconnectDelayMs: number;
        maxReconnectAttempts: number;
        errorHandler?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    }): AsyncGenerator<import("@platformatic/kafka").Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>, void, any>;
    /** Silent only while the consume loop is alive AND the erroring stream is the one it drains - the iterator then reports the same error once. A dead or replaced stream, or pull mode, reports here. */
    protected reportStreamError(opts: {
        error: Error;
        scope: string;
        stream: unknown;
    }): void;
    protected drainStream(opts: {
        errorHandler?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    }): AsyncGenerator<import("@platformatic/kafka").Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>, void, any>;
    protected attemptReconnect(opts: {
        attempt: number;
        maxAttempts: number;
        delayMs: number;
        errorHandler?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    }): Promise<void>;
    protected rebuildClient(): Promise<void>;
    protected closeOldClient(oldClient: Consumer<KeyType, ValueType, HeaderKeyType, HeaderValueType>): Promise<void>;
    protected handleAllBrokersDown(reason: TKafkaBrokersDownReason): void;
    protected destroyDeadStream(): void;
    protected closeStream(): Promise<void>;
    protected unconfigureBrokerEvents(): void;
    protected configureBrokerEvents(): void;
}
```

Source: `packages/helpers/src/modules/queue/kafka/consumer.ts`

## `KafkaDefaults`

*class*

The option values the Kafka helpers use for a field the caller leaves unset. Timeouts, delays and intervals are in milliseconds; `MAX_BYTES` is in bytes.

```ts
export declare class KafkaDefaults {
    static readonly RETRIES = 3;
    static readonly RETRY_DELAY = 1000;
    static readonly STRICT = true;
    static readonly AUTOCREATE_TOPICS = false;
    static readonly AUTOCOMMIT = false;
    static readonly SESSION_TIMEOUT = 60000;
    static readonly HEARTBEAT_INTERVAL = 10000;
    static readonly HIGH_WATER_MARK = 1024;
    static readonly MIN_BYTES = 1;
    static readonly MAX_BYTES: number;
    static readonly MAX_WAIT_TIME = 5000;
    static readonly METADATA_MAX_AGE = 300000;
    static readonly GROUP_PROTOCOL = "classic";
    static readonly CONSUME_MODE = "committed";
    static readonly CONSUME_FALLBACK_MODE = "latest";
    static readonly RECONNECT_DELAY = 2000;
    static readonly MAX_RECONNECT_ATTEMPTS = 5;
    static readonly SHUTDOWN_TIMEOUT = 30000;
    static readonly LAG_MONITOR_INTERVAL = 30000;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `KafkaGroupProtocol`

*class*

Consumer group protocol: `classic` or `consumer`.

```ts
export declare class KafkaGroupProtocol {
    static readonly CLASSIC = "classic";
    static readonly CONSUMER = "consumer";
    static readonly SCHEME_SET: Set<string>;
    static isValid(mode: string): boolean;
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `KafkaHealthStatuses`

*class*

Connection health of a Kafka helper, as reported by `getHealthStatus()`.

```ts
export declare class KafkaHealthStatuses {
    static readonly CONNECTED = "connected";
    static readonly DISCONNECTED = "disconnected";
    static readonly UNKNOWN = "unknown";
}
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `KafkaProducerHelper`

*class*

Wrapper around `@platformatic/kafka` Producer with lifecycle management, health tracking, graceful shutdown, and a transaction helper; `runInTransaction` requires both `transactionalId` and `idempotent` set on the producer.

```ts
export declare class KafkaProducerHelper<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string> extends BaseKafkaHelper<Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>> {
    constructor(opts: IKafkaProducerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>);
    static newInstance<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string>(opts: IKafkaProducerOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>): KafkaProducerHelper<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    getProducer(): Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    runInTransaction<ResultType>(callback: TKafkaTransactionCallback<ResultType, KeyType, ValueType, HeaderKeyType, HeaderValueType>): Promise<ResultType>;
    protected closeClient(): Promise<void>;
    close(opts?: {
        isForce?: boolean;
    }): Promise<void>;
}
```

Source: `packages/helpers/src/modules/queue/kafka/producer.ts`

## `KafkaSchemaRegistryHelper`

*class*

Wrapper around `@platformatic/kafka` ConfluentSchemaRegistry; exposes the registry for producer/consumer helpers to share.

```ts
export declare class KafkaSchemaRegistryHelper<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string> extends BaseHelper {
    private readonly registry;
    constructor(opts: IKafkaSchemaRegistryOptions);
    static newInstance<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string>(opts: IKafkaSchemaRegistryOptions): KafkaSchemaRegistryHelper<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    getRegistry(): ConfluentSchemaRegistry<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    getSerializers(): Serializers<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
    getDeserializers(): Deserializers<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}
```

Source: `packages/helpers/src/modules/queue/kafka/schema/registry.ts`

## `PlatformaticKafkaPlugins`

*class*

Every `@platformatic/kafka` fix needed by `bun build --compile`: a service compile script registers `build()` instead of tracking the individual plugins.

```ts
export declare class PlatformaticKafkaPlugins {
    /** `@platformatic/kafka` 2.8-2.9 resolves some dependencies through `createRequire(import.meta.url)` at module scope; `bun build --compile` cannot see through that, so the specifier stays unresolved and the binary dies with "Cannot find package" before boot - this plugin hoists those calls to static imports at bundle time. 2.10 removed the module-scope require(), so on >= 2.10 the plugin matches nothing and is inert. */
    static buildRequirePlugin(): BunPlugin;
    /** `@platformatic/wasm-utils`'s default entrypoint reads `native.wasm` from disk at module load and `bun build --compile` embeds JS only, so it resolves against `/$bunfs` and the binary dies with ENOENT - this plugin redirects the import to the `/bundled` entrypoint (wasm inlined). */
    static buildWasmPlugin(): BunPlugin;
    static build(): BunPlugin[];
}
```

Source: `packages/helpers/src/modules/queue/kafka/bundler/plugins.ts`

## `PlatformaticRequireSpecifiers`

*class*

Patterns and settings the require plugin uses to hoist module-scope `require()` calls in `@platformatic/kafka` to static imports.

```ts
export declare class PlatformaticRequireSpecifiers {
    /** Modules whose module-scope `require()` calls must be hoisted to static imports. */
    static readonly MODULE_FILTER: RegExp;
    /** `const <binding> = require('<specifier>');` at module scope; anchored so a lazy `require()` nested inside a function body never matches. */
    static readonly REQUIRE_PATTERN: RegExp;
    /** Optional peers of `@platformatic/kafka`; a static import would break builds that do not install them. */
    static readonly SKIPPED_SPECIFIERS: readonly string[];
    /** Prefix for the injected import bindings, namespaced to avoid colliding with upstream identifiers. */
    static readonly IMPORT_ALIAS_PREFIX = "__ignisRequire";
}
```

Source: `packages/helpers/src/modules/queue/kafka/bundler/common/constants.ts`

## `PlatformaticWasmSpecifiers`

*class*

Module specifiers and filter the WASM plugin matches for `@platformatic/wasm-utils`.

```ts
export declare class PlatformaticWasmSpecifiers {
    static readonly ENTRYPOINT = "@platformatic/wasm-utils";
    static readonly BUNDLED_ENTRYPOINT = "@platformatic/wasm-utils/bundled";
    static readonly ENTRYPOINT_FILTER: RegExp;
}
```

Source: `packages/helpers/src/modules/queue/kafka/bundler/common/constants.ts`

## `TKafkaAcks`

*type*

A {@link KafkaAcks} value.

```ts
export type TKafkaAcks = TConstValue<typeof KafkaAcks>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `TKafkaBrokerEventCallback`

*type*

Called when a broker connects or disconnects.

```ts
export type TKafkaBrokerEventCallback = (opts: {
    broker: Broker;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaBrokersDownReason`

*type*

Valid Kafka brokers-down reason values.

```ts
export type TKafkaBrokersDownReason = TConstValue<typeof KafkaBrokersDownReasons>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `TKafkaGroupJoinCallback`

*type*

Called when the consumer joins its group.

```ts
export type TKafkaGroupJoinCallback = (opts: {
    groupId: string;
    memberId: string;
    generationId?: number;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaGroupLeaveCallback`

*type*

Called when the consumer leaves its group; `memberId` is `null` when it has none.

```ts
export type TKafkaGroupLeaveCallback = (opts: {
    groupId: string;
    memberId: string | null;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaGroupProtocol`

*type*

A {@link KafkaGroupProtocol} value.

```ts
export type TKafkaGroupProtocol = TConstValue<typeof KafkaGroupProtocol>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `TKafkaGroupRebalanceCallback`

*type*

Called when the consumer group rebalances.

```ts
export type TKafkaGroupRebalanceCallback = (opts: {
    groupId: string;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaHealthStatus`

*type*

A {@link KafkaHealthStatuses} value.

```ts
export type TKafkaHealthStatus = TConstValue<typeof KafkaHealthStatuses>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/constants.ts`

## `TKafkaHeartbeatErrorCallback`

*type*

Called when a group heartbeat fails.

```ts
export type TKafkaHeartbeatErrorCallback = (opts: {
    error: Error;
    groupId?: string;
    memberId?: string | null;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaLagCallback`

*type*

Called with the consumer lag offsets from the lag monitor.

```ts
export type TKafkaLagCallback = (opts: {
    lag: Offsets;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaLagErrorCallback`

*type*

Called when the lag monitor fails to read lag.

```ts
export type TKafkaLagErrorCallback = (opts: {
    error: Error;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaMessageCallback`

*type*

Called with each consumed message.

```ts
export type TKafkaMessageCallback<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string> = (opts: {
    message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaMessageDoneCallback`

*type*

Called after a message has been handled.

```ts
export type TKafkaMessageDoneCallback<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string> = (opts: {
    message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaMessageErrorCallback`

*type*

Called when handling fails; `message` is absent when the error is not tied to one message.

```ts
export type TKafkaMessageErrorCallback<KeyType = string, ValueType = string, HeaderKeyType = string, HeaderValueType = string> = (opts: {
    error: Error;
    message?: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaReconnectErrorCallback`

*type*

A reconnect failure (client rebuild or the reconnect attempt itself) - falls back to `onMessageError` when unset.

```ts
export type TKafkaReconnectErrorCallback = (opts: {
    error: Error;
    attempt: number;
    maxAttempts: number;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaStreamErrorCallback`

*type*

The stream 'error' event - falls back to `onMessageError` when unset.

```ts
export type TKafkaStreamErrorCallback = (opts: {
    error: Error;
}) => ValueOrPromise<void>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`

## `TKafkaTransactionCallback`

*type*

Body of a producer transaction; receives the {@link IKafkaTransactionContext} and resolves to the transaction result.

```ts
export type TKafkaTransactionCallback<ResultType, KeyType, ValueType, HeaderKeyType, HeaderValueType> = (ctx: IKafkaTransactionContext<KeyType, ValueType, HeaderKeyType, HeaderValueType>) => Promise<ResultType>;
```

Source: `packages/helpers/src/modules/queue/kafka/common/types/callbacks.ts`
