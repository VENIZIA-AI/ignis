import { type ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { type MessagePort, type Transferable } from 'node:worker_threads';
import { type IWorkerBus, type IWorkerMessageBusHandler } from '../common';

export abstract class AbstractWorkerBusHelper<IConsumePayload, IPublishPayload>
  extends BaseHelper
  implements IWorkerBus<IConsumePayload, IPublishPayload>
{
  port: MessagePort;
  handler: IWorkerMessageBusHandler<IConsumePayload>;

  abstract onBeforePostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  abstract onAfterPostMessage?(opts: { message: IPublishPayload }): ValueOrPromise<void>;
  abstract postMessage(opts: {
    message: IPublishPayload;
    transferList: readonly Transferable[] | undefined;
  }): ValueOrPromise<void>;
}
