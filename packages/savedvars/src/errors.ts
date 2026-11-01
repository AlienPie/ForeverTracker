export class LuaParseError extends Error {
  readonly line: number;
  readonly column: number;

  constructor(message: string, line: number, column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "LuaParseError";
    this.line = line;
    this.column = column;
  }
}
