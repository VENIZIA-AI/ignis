import { getError } from '@/common/app-error';
import {
  BOOT_PHASES,
  IBooter,
  IBootExecutionOptions,
  IBootReport,
  IBootstrapper,
  IBootstrapperOptions,
  TBootPhase,
} from '@/common/types';
import { BaseHelper } from '@venizia/ignis-helpers';

/**
 * BaseBootstrapper orchestrates the boot process
 *
 * Responsibilities:
 * 1. Discover all booters
 * 2. Run boot phases (configure, discover, load)
 * 3. Generate boot report
 */
export class BaseBootstrapper extends BaseHelper implements IBootstrapper {
  private booters: IBooter[] = [];
  private phaseStartTimings: Map<string, number> = new Map();
  private phaseEndTimings: Map<string, number> = new Map();

  protected configuration: IBootstrapperOptions;

  constructor(opts: IBootstrapperOptions) {
    super({ scope: opts.scope });
    this.configuration = opts;
  }

  // --------------------------------------------------------------------------------
  async boot(opts: IBootExecutionOptions): Promise<IBootReport> {
    const { phases = BOOT_PHASES, booters } = opts;

    await this.discoverBooters();
    this.logger.debug(`[boot] Starting boot | Number of booters: %d`, this.booters.length);
    for (const phase of phases) {
      await this.runPhase({ phase, booterNames: booters });
    }
    return this.generateReport();
  }

  // --------------------------------------------------------------------------------
  private async discoverBooters(): Promise<void> {
    const booterBindings = this.configuration.application.findByTag<IBooter>({ tag: 'booter' });

    for (const binding of booterBindings) {
      this.booters.push(binding.getValue(this.configuration.application));
      this.logger.debug(`[discoverBooters] Discovered booter: %s`, binding.key);
    }
  }

  // --------------------------------------------------------------------------------
  private async runPhase(opts: { phase: TBootPhase; booterNames?: string[] }): Promise<void> {
    const { phase } = opts; // TODO: booterNames filtering can be implemented later
    this.phaseStartTimings.set(phase, performance.now());
    this.logger.debug(`[runPhase] Starting phase: %s`, phase.toUpperCase());

    for (const booter of this.booters) {
      const phaseMethod = booter[phase];
      if (!phaseMethod) {
        this.logger.debug(
          `[runPhase] SKIP not implemented booter | Phase: %s | Booter: %s`,
          phase,
          booter.constructor.name,
        );
        continue;
      }
      if (typeof phaseMethod !== 'function') {
        this.logger.debug(
          `[runPhase] SKIP not a function booter | Phase: %s | Booter: %s`,
          phase,
          booter.constructor.name,
        );

        continue;
      }

      try {
        this.logger.debug(
          `[runPhase] Running | Phase: %s | Booter: %s`,
          phase,
          booter.constructor.name,
        );
        await phaseMethod.call(booter);
      } catch (error) {
        throw getError({
          message: `[Bootstrapper][runPhase] Error during phase '${phase}' on booter '${booter.constructor.name}': ${error.message}`,
        });
      }
    }

    this.phaseEndTimings.set(phase, performance.now());
    const start = this.phaseStartTimings.get(phase) ?? 0;
    const end = this.phaseEndTimings.get(phase) ?? 0;
    const duration = end - start;

    this.logger.debug(
      `[DEBUG][runPhase] Completed phase: %s | Took: %d ms`,
      phase.toUpperCase(),
      duration,
    );
  }

  // --------------------------------------------------------------------------------
  private generateReport(): IBootReport {
    const report: IBootReport = {
      duration: 0,
      artifacts: {},
      phases: {
        configure: { duration: 0 },
        discover: { duration: 0 },
        load: { duration: 0 },
      },
      success: true,
      totalLoaded: 0,
      totalErrors: 0,
    };

    return report;
  }
}
