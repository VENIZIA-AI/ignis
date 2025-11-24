export interface ISwaggerOptions {
  restOptions: {
    path: {
      base: string;
      doc: string;
      ui: string;
    };
  };
  explorer: {
    openapi: string;
    info?: {
      title: string;
      version: string;
      description: string;
      contact?: { name: string; email: string };
    };
    servers?: Array<{
      url: string;
      description?: string;
    }>;
  };
}
