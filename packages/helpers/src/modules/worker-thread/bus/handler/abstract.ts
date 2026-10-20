import { type ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { type IWorkerMessageBusHandler } from '../../common';

export abstract class AbstractWorkerMessageBusHandlerHelper<IConsumePayload>
  extends BaseHelper
  implements IWorkerMessageBusHandler<IConsumePayload>
{
  onMessage: (opts: { message: IConsumePayload }) => ValueOrPromise<void>;
  onClose: () => ValueOrPromise<void>;
  onError: (opts: { error: Error }) => ValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => ValueOrPromise<void>;
}
