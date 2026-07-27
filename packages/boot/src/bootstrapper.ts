import {
  BOOT_PHASES,
  IApplication,
  IBooter,
  IBootExecutionOptions,
  IBootReport,
  IBootstrapper,
  TBootPhase,
} from '@/common/types';
import { BaseHelper, getError } from '@venizia/ignis-helpers';
import { inject } from '@venizia/ignis-inversion';

export class Bootstrapper extends BaseHelper implements IBootstrapper {
  private booters: IBooter[] = [];
  private phaseStartTimings: Map<string, number> = new Map();
  private phaseEndTimings: Map<string, number> = new Map();

  constructor(@inject({ key: '@app/instance' }) private readonly application: IApplication) {
    super({ scope: Bootstrapper.name });
  }

  async boot(opts: IBootExecutionOptions): Promise<IBootReport> {
    const { phases = BOOT_PHASES, booters } = opts;
    const startedAt = performance.now();

    await this.discoverBooters({ booterNames: booters });
    this.logger
      .for(this.boot.name)
      .debug(`Starting boot | Number of booters: %d`, this.booters.length);

    for (const phase of phases) {
      await this.runPhase({ phase });
    }

    return this.generateReport({ phases, totalDurationMs: performance.now() - startedAt });
  }

  private async discoverBooters(opts: { booterNames?: string[] }): Promise<void> {
    const { booterNames } = opts;

    // Reset first: on a second boot(), pushing onto the previous run's list registers every artifact again.
    this.booters = [];
    this.phaseStartTimings.clear();
    this.phaseEndTimings.clear();

    const wanted = booterNames?.length ? new Set(booterNames) : undefined;
    const booterBindings = this.application.findByTag<IBooter>({ tag: 'booter' });

    for (const binding of booterBindings) {
      const booter = binding.getValue(this.application);

      // An ignored filter is worse than no filter: the caller believes it scoped the boot.
      if (wanted && !wanted.has(booter.constructor.name)) {
        this.logger
          .for(this.discoverBooters.name)
          .debug(`SKIP booter not in filter | Booter: %s`, booter.constructor.name);
        continue;
      }

      this.booters.push(booter);
      this.logger.for(this.discoverBooters.name).debug(`Discovered booter: %s`, binding.key);
    }
  }

  private async runPhase(opts: { phase: TBootPhase }): Promise<void> {
    const { phase } = opts;
    this.phaseStartTimings.set(phase, performance.now());
    this.logger.for(this.runPhase.name).debug(`Starting phase: %s`, phase.toUpperCase());

    for (const booter of this.booters) {
      const phaseMethod = booter[phase];
      if (!phaseMethod) {
        this.logger
          .for(this.runPhase.name)
          .debug(
            `SKIP not implemented booter | Phase: %s | Booter: %s`,
            phase,
            booter.constructor.name,
          );
        continue;
      }
      if (typeof phaseMethod !== 'function') {
        this.logger
          .for(this.runPhase.name)
          .debug(
            `SKIP not a function booter | Phase: %s | Booter: %s`,
            phase,
            booter.constructor.name,
          );
        continue;
      }

      try {
        this.logger
          .for(this.runPhase.name)
          .debug(`Running | Phase: %s | Booter: %s`, phase, booter.constructor.name);
        await phaseMethod.call(booter);
      } catch (error) {
        const errorMessage = (error as Error)?.message || String(error);

        // Without the cause, the stack of the booter that actually threw - the real diagnosis - is gone.
        throw getError({
          message: `[Bootstrapper][runPhase] Error during phase '${phase}' on booter '${booter.constructor.name}': ${errorMessage}`,
          cause: error,
        });
      }
    }

    this.phaseEndTimings.set(phase, performance.now());
    const start = this.phaseStartTimings.get(phase) ?? 0;
    const end = this.phaseEndTimings.get(phase) ?? 0;
    const duration = end - start;

    this.logger
      .for(this.runPhase.name)
      .debug(`Completed phase: %s | Took: %d ms`, phase.toUpperCase(), duration);
  }

  private generateReport(opts: { phases: TBootPhase[]; totalDurationMs: number }): IBootReport {
    const { phases, totalDurationMs } = opts;

    const report: IBootReport = {
      booters: this.booters.map(booter => booter.constructor.name),
      phases: phases.map(phase => ({
        phase,
        durationMs:
          (this.phaseEndTimings.get(phase) ?? 0) - (this.phaseStartTimings.get(phase) ?? 0),
      })),
      totalDurationMs,
    };

    this.logger.for(this.generateReport.name).debug(`Boot report: %j`, report);

    return report;
  }
}
