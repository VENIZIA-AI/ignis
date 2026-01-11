import { BaseHelper, getError } from '@/helpers';
import { IMailQueueExecutor, IMailQueueOptions, IMailQueueResult } from '../../common';

export class DirectMailExecutorHelper extends BaseHelper implements IMailQueueExecutor {
  private processor?: (email: string) => Promise<{
    success: boolean;
    message: string;
    expiresInMinutes: number;
    nextResendAt?: string;
  }>;

  constructor() {
    super({ scope: DirectMailExecutorHelper.name });
  }

  setProcessor(
    processor: (email: string) => Promise<{
      success: boolean;
      message: string;
      expiresInMinutes: number;
      nextResendAt?: string;
    }>,
  ): void {
    this.processor = processor;
  }

  async enqueueVerificationEmail(
    email: string,
    _options?: IMailQueueOptions,
  ): Promise<IMailQueueResult> {
    if (!this.processor) {
      throw getError({ message: 'Processor not set. Call setProcessor() first.' });
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
