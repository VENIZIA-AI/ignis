/** What a decorated class is to the application - the one fact the artifact generator and the registration methods both read. */
export class ArtifactTypes {
  static readonly COMPONENT = 'component';
  static readonly CONTROLLER = 'controller';
  static readonly SERVICE = 'service';
  static readonly REPOSITORY = 'repository';
  static readonly DATASOURCE = 'datasource';
  static readonly MODEL = 'model';

  static readonly SCHEME_SET = new Set<string>([
    this.COMPONENT,
    this.CONTROLLER,
    this.SERVICE,
    this.REPOSITORY,
    this.DATASOURCE,
    this.MODEL,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}
