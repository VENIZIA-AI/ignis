import { type TValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { type IWorkerMessageBusHandler } from '../../common';

/** Base for the callbacks a worker bus invokes: `onMessage`, `onClose`, `onError` and `onExit`. */
export abstract class AbstractWorkerMessageBusHandlerHelper<IConsumePayload>
  extends BaseHelper
  implements IWorkerMessageBusHandler<IConsumePayload>
{
  onMessage: (opts: { message: IConsumePayload }) => TValueOrPromise<void>;
  onClose: () => TValueOrPromise<void>;
  onError: (opts: { error: Error }) => TValueOrPromise<void>;
  onExit: (opts: { exitCode: number | string }) => TValueOrPromise<void>;
}
