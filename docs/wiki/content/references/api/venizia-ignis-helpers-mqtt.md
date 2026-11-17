---
title: "@venizia/ignis-helpers/mqtt"
description: "Every export of @venizia/ignis-helpers/mqtt, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/mqtt`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `IMQTTClientOptions`

*interface*

Options for {@link MQTTClientHelper}. `onMessage` is required; `options` go to the `mqtt` client as-is.

```ts
export interface IMQTTClientOptions {
    identifier: string;
    url: string;
    options: mqtt.IClientOptions;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
    onClose?: (error?: Error) => void;
    onMessage: (opts: {
        topic: string;
        message: Buffer;
    }) => void;
}
```

Source: `packages/helpers/src/modules/queue/mqtt/helper.ts`

## `MQTTClientHelper`

*class*

MQTT client that connects to `url` on construction and forwards messages to `onMessage`.

```ts
export declare class MQTTClientHelper extends BaseHelper {
    private url;
    private options;
    private client?;
    private onConnect?;
    private onDisconnect?;
    private onError?;
    private onClose?;
    private onMessage;
    constructor(opts: IMQTTClientOptions);
    configure(): void;
    /** Client factory seam - overridden in tests to run the helper without a broker. */
    protected createClient(opts: {
        url: string;
        options: mqtt.IClientOptions;
    }): mqtt.MqttClient;
    getClient(): mqtt.MqttClient | undefined;
    /** Tear the client down - without it the mqtt client, and its reconnect timer, outlives the helper forever. Resolves once the driver reports the connection ended; safe to call more than once. */
    close(opts?: {
        isForce?: boolean;
    }): Promise<void>;
    subscribe(opts: {
        topics: Array<string>;
    }): Promise<unknown>;
    publish(opts: {
        topic: string;
        message: string | Buffer;
    }): Promise<unknown>;
}
```

Source: `packages/helpers/src/modules/queue/mqtt/helper.ts`
