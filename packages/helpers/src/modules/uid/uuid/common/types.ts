/** What a UUID says about itself. `createdAt` is present only for a version that carries a clock. */
export interface IUuidInspection {
  version: number;
  createdAt?: Date;
}
