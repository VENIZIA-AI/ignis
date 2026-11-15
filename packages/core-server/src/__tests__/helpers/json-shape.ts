/** Feeds a value the declared type forbids to a typed seam, on purpose: `JSON.parse` is untyped, so the target type is inferred from where the result goes and no cast is written. */
export const wrongShape = <Target>(value: unknown): Target => JSON.parse(JSON.stringify(value));

/** Reads a response body as the shape the test then asserts on: `Response.json()` is `unknown`, and each assertion on the result is what proves the shape. */
export const readJson = async <Shape>(response: Response): Promise<Shape> => {
  const text = await response.text();

  return JSON.parse(text);
};
