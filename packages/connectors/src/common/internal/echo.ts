/** C0 controls, DEL, C1 controls and the two Unicode line terminators - anything that can break a log line. */
const UNSAFE_ECHO_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

const toUnicodeEscape = (character: string): string =>
  `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;

/** A caller-supplied value made safe to quote in an error message: one line, every unsafe character escaped. */
export const toSafeEcho = (opts: { value: string }): string => {
  return opts.value.replace(UNSAFE_ECHO_CHARACTERS, toUnicodeEscape);
};
