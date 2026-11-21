import { ConstClass } from '@venizia/ignis-helpers/common';

/** The document UI implementations the API reference can render. `isValid` checks a string against them. */
export class DocumentUITypes extends ConstClass {
  static readonly SWAGGER = 'swagger';
  static readonly SCALAR = 'scalar';
}
