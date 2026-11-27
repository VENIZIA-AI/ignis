/** The true words of a boolean setting, as `z.stringbool()` reads them; the false ones are `LoggerDebugGate.FALSE_WORDS`. */
export class TrueWords {
  static readonly PATTERN = /^\s*(?:true|1|yes|on|y|enabled)\s*$/i;
}
