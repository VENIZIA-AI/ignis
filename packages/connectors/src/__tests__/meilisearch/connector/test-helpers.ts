/** bun's `expect().rejects` is not typed as a Thenable, so rejections are captured explicitly. */
export const captureRejection = async (task: () => Promise<unknown>): Promise<unknown> => {
  try {
    await task();
  } catch (error) {
    return error;
  }

  return undefined;
};
