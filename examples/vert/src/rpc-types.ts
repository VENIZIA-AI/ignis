import type { Application } from './application';
export type AppType = ReturnType<InstanceType<typeof Application>['getRootRouter']>;

export interface ITypedClient {
  'health-check': {
    $get: () => Promise<Response>;
  };

  test: {
    '1': {
      $get: () => Promise<Response>;
    };
    '2': {
      $get: (options?: { headers?: { Authorization?: string } }) => Promise<Response>;
    };
  };

  view: {
    $get: () => Promise<Response>;
  };
}

/**
 * Response type helpers for type-safe JSON parsing
 */
export interface IHealthCheckResponse {
  status: string;
}
