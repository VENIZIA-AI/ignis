import { BaseProvider } from '@/base/providers';
import { Container, getError } from '@/helpers';
import { IMailQueueExecutor, IMailQueueExecutorConfig, MailQueueExecutorTypes } from '../common';
import {
  BullMQMailExecutorHelper,
  DirectMailExecutorHelper,
  InternalQueueMailExecutorHelper,
} from '../helpers';

export type TGetMailQueueExecutorFn = (config: IMailQueueExecutorConfig) => IMailQueueExecutor;

export class MailQueueExecutorProvider extends BaseProvider<TGetMailQueueExecutorFn> {
  constructor() {
    super({ scope: MailQueueExecutorProvider.name });
  }

  value(_container: Container): TGetMailQueueExecutorFn {
    return (config: IMailQueueExecutorConfig) => {
      this.logger
        .for(this.value.name)
        .info('Creating mail queue executor of type: %s', config.type);
      switch (config.type) {
        case MailQueueExecutorTypes.DIRECT: {
          return new DirectMailExecutorHelper();
        }

        case MailQueueExecutorTypes.INTERNAL_QUEUE: {
          if (!config.internalQueue) {
            throw getError({ message: 'Internal queue configuration is missing' });
          }

          return new InternalQueueMailExecutorHelper({
            identifier: config.internalQueue.identifier,
          });
        }

        case MailQueueExecutorTypes.BULLMQ: {
          if (!config.bullmq) {
            throw getError({ message: 'BullMQ configuration is missing' });
          }

          return new BullMQMailExecutorHelper(config.bullmq);
        }

        default: {
          throw getError({ message: `Unknown mail queue executor type: ${config.type}` });
        }
      }
    };
  }
}
