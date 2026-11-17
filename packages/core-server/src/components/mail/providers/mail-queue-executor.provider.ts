import { BaseProvider } from '@venizia/ignis-kernel';
import type { Container } from '@/helpers';
import { getError } from '@venizia/ignis-helpers/core';
import type { IMailQueueExecutor, TMailQueueExecutorConfig } from '../common';
import { MailQueueExecutorTypes } from '../common';
import {
  BullMQMailExecutorHelper,
  DirectMailExecutorHelper,
  InternalQueueMailExecutorHelper,
} from '../helpers';

/** Builds the queue executor for a config; throws when the config for its `type` is missing or the type is unknown. */
export type TGetMailQueueExecutorFn = (config: TMailQueueExecutorConfig) => IMailQueueExecutor;

/** Provides the `TGetMailQueueExecutorFn` factory bound at `MailKeys.MAIL_QUEUE_EXECUTOR_PROVIDER`. */
export class MailQueueExecutorProvider extends BaseProvider<TGetMailQueueExecutorFn> {
  constructor() {
    super({ scope: MailQueueExecutorProvider.name });
  }

  value(_container: Container): TGetMailQueueExecutorFn {
    return (config: TMailQueueExecutorConfig) => {
      this.logger
        .for(this.value.name)
        .info('Creating mail queue executor of type: %s', config.type);

      switch (config.type) {
        case MailQueueExecutorTypes.DIRECT: {
          return new DirectMailExecutorHelper();
        }

        case MailQueueExecutorTypes.INTERNAL_QUEUE: {
          return new InternalQueueMailExecutorHelper({
            identifier: config.options.identifier,
          });
        }

        case MailQueueExecutorTypes.BULLMQ: {
          return new BullMQMailExecutorHelper(config.options);
        }

        default: {
          // Only plain-JS input gets here: the union is exhausted for a typed caller. The type alone is named, the rest of the config can hold a Redis password.
          const unknownConfig: never = config;

          throw getError({
            message: `Unknown mail queue executor type: ${String(Reflect.get(unknownConfig, 'type'))}`,
          });
        }
      }
    };
  }
}
