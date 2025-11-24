import C from 'node:crypto';

export const hash = (
  text: string,
  options: {
    algorithm: 'SHA256' | 'MD5';
    secret?: string;
    outputType: C.BinaryToTextEncoding;
  },
): string => {
  const { algorithm, secret, outputType } = options;

  switch (algorithm) {
    case 'SHA256': {
      if (!secret) {
        return text;
      }

      return C.createHmac(algorithm, secret).update(text).digest(outputType);
    }
    case 'MD5': {
      return C.createHash(algorithm).update(text).digest(outputType);
    }
    default: {
      return text;
    }
  }
};
