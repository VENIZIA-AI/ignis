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

/**
 * BaseBootstrapper orchestrates the boot process
 *
 * Responsibilities:
 * 1. Discover all booters
 * 2. Run boot phases (configure, discover, load)
 * 3. Generate boot report
 */
export class BaseBootstrapper implements IBootstrapper {
  private booters: IBooter[] = [];
  private phaseStartTimings: Map<string, number> = new Map();
  private phaseEndTimings: Map<string, number> = new Map();
  protected debug: boolean = false;

  protected configuration: IBootstrapperOptions;

  constructor(opts: IBootstrapperOptions) {
    this.configuration = opts;
    this.debug = this.configuration.application.bootOptions?.debug ?? false;
  }

  // --------------------------------------------------------------------------------
  async boot(opts: IBootExecutionOptions): Promise<IBootReport> {
    const { phases = BOOT_PHASES, booters } = opts;

    await this.discoverBooters();
    if (this.debug) {
      console.log(`\n[DEBUG]🚀 Starting boot with ${this.booters.length} booters\n`);
    }
    for (const phase of phases) {
      this.runPhase({ phase, booterNames: booters });
    }
    return this.generateReport();
  }

  // --------------------------------------------------------------------------------
  private async discoverBooters(): Promise<void> {
    const booterBindings = this.configuration.application.findByTag<IBooter>({ tag: 'booter' });
    console.log('oooooooooooooooooooooooooooooooooooooooooooooooooo')
    console.log(`Discovered ${booterBindings.length} booters.`);

    for (const binding of booterBindings) {
      this.booters.push(binding.getValue(this.configuration.application));
      if(this.debug) {
        console.log(
          `[DEBUG][discoverBooters] Discovered booter: ${binding.key}`,
        );
      }
    }
  }

  // --------------------------------------------------------------------------------
  private async runPhase(opts: { phase: TBootPhase; booterNames?: string[] }): Promise<void> {
    const { phase, booterNames } = opts;
    this.phaseStartTimings.set(phase, performance.now());
    if (this.debug) {
      console.log(`[DEBUG][runPhase] Starting phase: ${phase.toUpperCase()}`);
    }

    const bootersToRun = booterNames
      ? this.booters.filter(b => booterNames.includes(b.name))
      : this.booters;

    for (const booter of bootersToRun) {
      const phaseMethod = booter[phase];
      if (!phaseMethod) {
        if (this.debug) {
          console.log(
            `[DEBUG][runPhase] Skipping phase '${phase}' on booter '${booter.name}' (method not implemented)`,
          );
        }
        continue;
      }
      if (typeof phaseMethod !== 'function') {
        if (this.debug) {
          console.log(
            `[DEBUG][runPhase] Phase '${phase}' on booter '${booter.name}' (not a function)`,
          );
        }
        continue;
      }

      try {
        if (this.debug) {
          console.log(`[DEBUG]➡️  Running ${phase.toUpperCase()} on ${booter.name}`);
        }
        phaseMethod.call(booter);
      } catch (error) {
        throw getError({
          message: `[Bootstrapper][runPhase] Error during phase '${phase}' on booter '${booter.name}': ${error.message}`,
        });
      }
    }

    this.phaseEndTimings.set(phase, performance.now());
    const start = this.phaseStartTimings.get(phase) ?? 0;
    const end = this.phaseEndTimings.get(phase) ?? 0;
    const duration = end - start;

    if (this.debug) {
      console.log(
        `[DEBUG][runPhase] Completed phase: ${phase.toUpperCase()} | Took: ${duration} ms`,
      );
    }
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

    // Log report if debug mode
    if (this.debug) {
      console.log('\n[DEBUG] Boot Report:');
      console.log(JSON.stringify(report, null, 2));
    }

    return report;
  }
}
