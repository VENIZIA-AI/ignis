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

/**
 * BaseBootstrapper orchestrates the boot process
 *
 * Responsibilities:
 * 1. Discover all booters
 * 2. Run boot phases (configure, discover, load)
 * 3. Generate boot report
 */
export class Bootstrapper extends BaseHelper implements IBootstrapper {
  private booters: IBooter[] = [];
  private phaseStartTimings: Map<string, number> = new Map();
  private phaseEndTimings: Map<string, number> = new Map();

  constructor(@inject({ key: '@app/instance' }) private readonly application: IApplication) {
    super({ scope: Bootstrapper.name });
  }

  // --------------------------------------------------------------------------------
  async boot(opts: IBootExecutionOptions): Promise<IBootReport> {
    const { phases = BOOT_PHASES, booters } = opts;

    await this.discoverBooters();
    this.logger
      .for(this.boot.name)
      .debug(`Starting boot | Number of booters: %d`, this.booters.length);
    for (const phase of phases) {
      await this.runPhase({ phase, booterNames: booters });
    }
    return this.generateReport();
  }

  // --------------------------------------------------------------------------------
  private async discoverBooters(): Promise<void> {
    const booterBindings = this.application.findByTag<IBooter>({ tag: 'booter' });

    for (const binding of booterBindings) {
      this.booters.push(binding.getValue(this.application));
      this.logger.for(this.discoverBooters.name).debug(`Discovered booter: %s`, binding.key);
    }
  }

  // --------------------------------------------------------------------------------
  private async runPhase(opts: { phase: TBootPhase; booterNames?: string[] }): Promise<void> {
    const { phase } = opts; // TODO: booterNames filtering can be implemented later
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

        throw getError({
          message: `[Bootstrapper][runPhase] Error during phase '${phase}' on booter '${booter.constructor.name}': ${errorMessage}`,
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

  // --------------------------------------------------------------------------------
  private generateReport(): IBootReport {
    const report: IBootReport = {};
    this.logger.for(this.generateReport.name).debug(`Boot report: %j`, report);

    return report;
  }
}
