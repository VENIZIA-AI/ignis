import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { IScanReport, IScannedArtifact } from './common';
import { ArtifactIndexEmitter } from './emitter';
import { ArtifactScanner } from './scanner';

export interface IGenerateOptions {
  root: string;
  out: string;
  ignore?: string[];
  /** Name of the exported constant; default `GeneratedArtifacts`. */
  exportName?: string;
  /** Extra module specifiers whose stereotype imports count; see `IScanOptions.sourceModules`. */
  sourceModules?: string[];
}

/** Writes the artifact index, and checks that the committed one is still current. */
export class ArtifactIndexGenerator {
  private static render(opts: IGenerateOptions): { content: string } & IScanReport {
    const { artifacts, ignored, skipped } = ArtifactScanner.getInstance().scanWithReport({
      root: opts.root,
      ignore: opts.ignore,
      sourceModules: opts.sourceModules,
    });
    const content = ArtifactIndexEmitter.render({
      artifacts,
      outFile: resolve(opts.out),
      exportName: opts.exportName ?? ArtifactIndexEmitter.DEFAULT_EXPORT_NAME,
      command: {
        root: opts.root,
        out: opts.out,
        ignore: opts.ignore,
        sourceModules: opts.sourceModules,
      },
    });

    return { content, artifacts, ignored, skipped };
  }

  /** Everything below the first line: the header only records the command, so a flag change alone must not read as drift. */
  private static bodyOf(content: string): string {
    return content.slice(content.indexOf('\n') + 1);
  }

  /** Writes the index only when its content changed, so an unchanged tree leaves the file's mtime alone. */
  static generate(opts: IGenerateOptions): { content: string; written: boolean } & IScanReport {
    const { content, artifacts, ignored, skipped } = ArtifactIndexGenerator.render(opts);
    const out = resolve(opts.out);
    const current = existsSync(out) ? readFileSync(out, 'utf8') : undefined;

    if (current === content) {
      return { content, artifacts, ignored, skipped, written: false };
    }

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, content);

    return { content, artifacts, ignored, skipped, written: true };
  }

  /** Renders in memory and compares the body with the committed file - the staleness gate for lint and CI. */
  static check(opts: IGenerateOptions): {
    isFresh: boolean;
    expected: string;
    actual: string | undefined;
    ignored: IScannedArtifact[];
  } {
    const { content: expected, ignored } = ArtifactIndexGenerator.render(opts);
    const out = resolve(opts.out);
    const actual = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
    const isFresh =
      actual !== undefined &&
      ArtifactIndexGenerator.bodyOf(actual) === ArtifactIndexGenerator.bodyOf(expected);

    return { isFresh, expected, actual, ignored };
  }
}
