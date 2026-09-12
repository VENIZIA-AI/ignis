export class HealthCheckHeaders {
  /** Where a gated stats request carries its key; lowercase because Hono normalises header names. */
  static readonly SECRET_KEY = 'x-health-key';
}
