import { BaseHelper } from '@/modules/base';
import { voidExecution } from '@/utilities/promise.utility';
import { CronJob, CronOnCompleteCommand, CronTime } from 'cron';
import isEmpty from 'lodash/isEmpty';
import { ApplicationError } from '../error';

export interface ICronHelperOptions {
  cronTime: string;
  onTick: () => void | Promise<void>;
  onCompleted?: CronOnCompleteCommand | null;
  autoStart?: boolean;
  tz?: string;
  errorHandler?: (error: unknown) => void | null;
}

export class CronHelper extends BaseHelper {
  private cronTime: string;
  private onTick: () => void | Promise<void>;
  private onCompleted?: CronOnCompleteCommand | null;
  private autoStart: boolean;
  private tz?: string;
  private errorHandler?: (error: unknown) => void | null;

  public instance: CronJob;

  constructor(opts: ICronHelperOptions) {
    super({ scope: CronHelper.name, identifier: opts.cronTime ?? CronHelper.name });

    const { cronTime, onTick, onCompleted, autoStart = false, tz, errorHandler } = opts;
    this.cronTime = cronTime;
    this.onTick = onTick;
    this.onCompleted = onCompleted;
    this.autoStart = autoStart ?? false;
    this.tz = tz;
    this.errorHandler = errorHandler;

    this.buildInstance();
  }

  static newInstance(opts: ICronHelperOptions) {
    return new CronHelper(opts);
  }

  /** Builds the job. Synchronous, so the constructor still THROWS on a bad cronTime. */
  protected buildInstance(): void {
    if (!this.cronTime || isEmpty(this.cronTime)) {
      throw ApplicationError.getError({
        message: '[CronHelper][configure] Invalid cronTime to configure application cron!',
      });
    }

    try {
      this.instance = CronJob.from({
        cronTime: this.cronTime,
        onTick: this.onTick,
        onComplete: this.onCompleted,
        start: this.autoStart,
        errorHandler: this.errorHandler,
        timeZone: this.tz,
      });
    } catch (error) {
      throw ApplicationError.getError({
        message: `[CronHelper][configure] Invalid cron expression | cronTime: ${this.cronTime} | error: ${error}`,
      });
    }
  }

  /**
   * Async because `CronJob.stop()` resolves only once an IN-FLIGHT tick has finished. Fire-and-
   * forgetting it lets the replacement job start while the old handler is still running - the very
   * double-fire this stop exists to prevent.
   */
  async configure(): Promise<void> {
    if (this.instance) {
      await this.instance.stop();
    }

    this.buildInstance();
  }

  start() {
    if (!this.instance) {
      this.logger.for('start').error(' Invalid cron instance to start cronjob!');
      return;
    }

    this.instance.start();
  }

  async stop() {
    if (!this.instance) {
      this.logger.for(this.stop.name).error('Invalid cron instance to stop cronjob!');
      return;
    }

    await this.instance.stop();
  }

  modifyCronTime(opts: { cronTime: string; shouldFireOnTick?: boolean }) {
    const { cronTime, shouldFireOnTick = false } = opts;

    let nextCronTime: CronTime;
    try {
      nextCronTime = new CronTime(cronTime, this.tz);
    } catch (error) {
      throw ApplicationError.getError({
        message: `[CronHelper][modifyCronTime] Invalid cron expression | cronTime: ${cronTime} | error: ${error}`,
      });
    }

    this.instance.setTime(nextCronTime);
    this.cronTime = cronTime;

    if (shouldFireOnTick) {
      voidExecution({
        logger: this.logger,
        scope: this.modifyCronTime.name,
        execution: this.instance.fireOnTick(),
      });
    }
  }

  duplicate(opts: { cronTime: string }) {
    const { cronTime } = opts;

    const options: ICronHelperOptions = {
      cronTime: cronTime,
      onTick: this.onTick,
      onCompleted: this.onCompleted,
      autoStart: this.autoStart,
      tz: this.tz,
      errorHandler: this.errorHandler,
    };

    return CronHelper.newInstance(options);
  }
}
