import { BaseHelper, getError } from '@venizia/ignis-helpers';
import type {
  IMailProcessorResult,
  IMailQueueExecutor,
  IMailQueueOptions,
  IMailQueueResult,
} from '../../common';
import { MailExecutorErrors } from '../../common';

export class DirectMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
  private processor?: (email: string) => Promise<IMailProcessorResult>;

  constructor() {
    super({ scope: DirectMailExecutorHelper.name });
  }

  setProcessor(processor: (email: string) => Promise<IMailProcessorResult>): void {
    this.processor = processor;
  }

  async enqueueVerificationEmail(
    email: string,
    _options?: IMailQueueOptions,
  ): Promise<IMailQueueResult> {
    if (!this.processor) {
      throw getError({ message: MailExecutorErrors.PROCESSOR_NOT_SET });
    }

    this.logger
      .for(this.enqueueVerificationEmail.name)
      .info('Executing immediately (no queue) for: %s', email);
    const result = await this.processor(email);

    return {
      queued: false,
      message: 'Email sent immediately (no queue)',
      result,
    };
  }
}
