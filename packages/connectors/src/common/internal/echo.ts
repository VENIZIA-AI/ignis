/** C0 controls, DEL, C1 controls and the two Unicode line terminators - anything that can break a log line. */
const isUnsafeEchoCode = (code: number): boolean =>
  code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;

/** A caller-supplied value made safe to quote in an error message: one line, every unsafe character escaped. */
export const toSafeEcho = (opts: { value: string }): string => {
  const { value } = opts;
  let safe = '';
  let copiedUpTo = 0;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (!isUnsafeEchoCode(code)) {
      continue;
    }

    safe += `${value.slice(copiedUpTo, index)}\\u${code.toString(16).padStart(4, '0')}`;
    copiedUpTo = index + 1;
  }

  return copiedUpTo === 0 ? value : safe + value.slice(copiedUpTo);
};
