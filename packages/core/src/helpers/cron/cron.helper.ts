import { BaseHelper } from '@/base/helpers';
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

// --------------------------------------------------------
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

    this.configure();
  }

  static newInstance(opts: ICronHelperOptions) {
    return new CronHelper(opts);
  }

  configure() {
    if (!this.cronTime || isEmpty(this.cronTime)) {
      throw ApplicationError.getError({
        message: '[CronHelper][configure] Invalid cronTime to configure application cron!',
      });
    }

    this.instance = CronJob.from({
      cronTime: this.cronTime,
      onTick: this.onTick,
      onComplete: this.onCompleted,
      start: this.autoStart,
      errorHandler: this.errorHandler,
      timeZone: this.tz,
    });
  }

  start() {
    if (!this.instance) {
      this.logger.error('[CronHelper][start] Invalid cron instance to start cronjob!');
      return;
    }

    this.instance.start();
  }

  modifyCronTime(opts: { cronTime: string; shouldFireOnTick?: boolean }) {
    const { cronTime, shouldFireOnTick = false } = opts;

    this.instance.setTime(new CronTime(cronTime));

    if (shouldFireOnTick) {
      this.instance.fireOnTick();
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
