/** The metadata a schema carries for documentation. Structural on purpose - naming the OpenAPI library's type here would pull it into a browser bundle, which is the whole thing this package avoids. */
export type TSchemaMetadata = {
  description?: string;
  type?: string;
  examples?: Array<unknown>;
};

/** Applies documentation metadata to a schema and returns it. A server passes an OpenAPI decorator; a browser passes nothing and gets the identity. */
export type TSchemaDecorator = <TSchema>(schema: TSchema, metadata: TSchemaMetadata) => TSchema;
