import { LuaParseError } from "./errors";

export type LuaValue = string | number | boolean | null | LuaValue[] | { [key: string]: LuaValue };

const MAX_DEPTH = 200;

/**
 * Parses a WoW SavedVariables file: a sequence of `Name = <value>` assignments
 * where a value is a table, string, number, boolean or nil. Hand-written
 * tokenizer + recursive descent; Lua is never executed.
 */
export function parseSavedVariables(source: string): Record<string, LuaValue> {
  return new Parser(source).parseFile();
}

type Tok =
  | { t: "name" | "string" | "punct" | "eof"; v: string; line: number; col: number }
  | { t: "number"; v: number; line: number; col: number };

const isDigit = (c: string) => c >= "0" && c <= "9";
const isHex = (c: string) => isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isNameStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isNameChar = (c: string) => isNameStart(c) || isDigit(c);

class Parser {
  private pos = 0;
  private line = 1;
  private lineStart = 0;
  private tok!: Tok;

  constructor(private readonly src: string) {}

  private fail(msg: string, line = this.line, col = this.pos - this.lineStart + 1): never {
    throw new LuaParseError(msg, line, col);
  }

  private tokFail(msg: string): never {
    return this.fail(msg, this.tok.line, this.tok.col);
  }

  private newline(at: number) {
    // `at` is the index of the "\n" character
    this.line++;
    this.lineStart = at + 1;
  }

  /** Returns level (number of '=') if a long bracket opens at pos, else -1. */
  private longBracketLevel(): number {
    const s = this.src;
    let p = this.pos + 1;
    let level = 0;
    while (s[p] === "=") {
      level++;
      p++;
    }
    return s[p] === "[" ? level : -1;
  }

  private readLongString(level: number): string {
    const startLine = this.line;
    const startCol = this.pos - this.lineStart + 1;
    const s = this.src;
    this.pos += level + 2;
    // A first newline directly after the opening bracket is skipped.
    if (s[this.pos] === "\r") {
      this.pos++;
      if (s[this.pos] === "\n") this.pos++;
      this.newline(this.pos - 1);
    } else if (s[this.pos] === "\n") {
      this.newline(this.pos);
      this.pos++;
    }
    const close = "]" + "=".repeat(level) + "]";
    const end = s.indexOf(close, this.pos);
    if (end < 0) this.fail("Unterminated long string", startLine, startCol);
    const body = s.slice(this.pos, end);
    for (let i = this.pos; i < end; i++) {
      if (s.charCodeAt(i) === 10) this.newline(i);
    }
    this.pos = end + close.length;
    return body;
  }

  private skipTrivia() {
    const s = this.src;
    for (;;) {
      const c = s[this.pos];
      if (c === "\n") {
        this.newline(this.pos);
        this.pos++;
      } else if (c === " " || c === "\t" || c === "\r") {
        this.pos++;
      } else if (c === "-" && s[this.pos + 1] === "-") {
        const startLine = this.line;
        const startCol = this.pos - this.lineStart + 1;
        this.pos += 2;
        if (s[this.pos] === "[") {
          const level = this.longBracketLevel();
          if (level >= 0) {
            try {
              this.readLongString(level);
            } catch {
              this.fail("Unterminated block comment", startLine, startCol);
            }
            continue;
          }
        }
        while (this.pos < s.length && s[this.pos] !== "\n") this.pos++;
      } else {
        return;
      }
    }
  }

  private next() {
    this.skipTrivia();
    const s = this.src;
    const line = this.line;
    const col = this.pos - this.lineStart + 1;
    if (this.pos >= s.length) {
      this.tok = { t: "eof", v: "", line, col };
      return;
    }
    const c = s[this.pos]!;
    if (isNameStart(c)) {
      const start = this.pos;
      while (this.pos < s.length && isNameChar(s[this.pos]!)) this.pos++;
      this.tok = { t: "name", v: s.slice(start, this.pos), line, col };
    } else if (isDigit(c) || (c === "." && isDigit(s[this.pos + 1] ?? ""))) {
      this.tok = { t: "number", v: this.readNumber(), line, col };
    } else if (c === '"' || c === "'") {
      this.tok = { t: "string", v: this.readQuoted(c), line, col };
    } else if (c === "[") {
      const level = this.longBracketLevel();
      if (level >= 0) {
        this.tok = { t: "string", v: this.readLongString(level), line, col };
      } else {
        this.pos++;
        this.tok = { t: "punct", v: "[", line, col };
      }
    } else if ("{}]=,;-".includes(c)) {
      this.pos++;
      this.tok = { t: "punct", v: c, line, col };
    } else {
      this.fail(`Unexpected character ${JSON.stringify(c)}`);
    }
  }

  private readNumber(): number {
    const s = this.src;
    const start = this.pos;
    const line = this.line;
    const col = this.pos - this.lineStart + 1;
    let value: number;
    if (s[this.pos] === "0" && (s[this.pos + 1] === "x" || s[this.pos + 1] === "X")) {
      this.pos += 2;
      const hs = this.pos;
      while (isHex(s[this.pos] ?? "")) this.pos++;
      if (this.pos === hs) this.fail("Malformed number", line, col);
      value = parseInt(s.slice(hs, this.pos), 16);
    } else {
      while (isDigit(s[this.pos] ?? "")) this.pos++;
      if (s[this.pos] === ".") {
        this.pos++;
        while (isDigit(s[this.pos] ?? "")) this.pos++;
      }
      if (s[this.pos] === "e" || s[this.pos] === "E") {
        this.pos++;
        if (s[this.pos] === "+" || s[this.pos] === "-") this.pos++;
        const es = this.pos;
        while (isDigit(s[this.pos] ?? "")) this.pos++;
        if (this.pos === es) this.fail("Malformed number", line, col);
      }
      value = Number(s.slice(start, this.pos));
    }
    if (isNameChar(s[this.pos] ?? "") || Number.isNaN(value)) this.fail("Malformed number", line, col);
    return value;
  }

  private readQuoted(quote: string): string {
    const s = this.src;
    const line = this.line;
    const col = this.pos - this.lineStart + 1;
    this.pos++;
    let out = "";
    let chunk = this.pos;
    for (;;) {
      if (this.pos >= s.length) this.fail("Unterminated string", line, col);
      const c = s[this.pos]!;
      if (c === quote) {
        out += s.slice(chunk, this.pos);
        this.pos++;
        return out;
      }
      if (c === "\n") this.fail("Unterminated string", line, col);
      if (c !== "\\") {
        this.pos++;
        continue;
      }
      out += s.slice(chunk, this.pos);
      this.pos++;
      const e = s[this.pos];
      if (e === undefined) this.fail("Unterminated string", line, col);
      const simple: Record<string, string> = {
        n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v",
        "\\": "\\", '"': '"', "'": "'",
      };
      if (e in simple) {
        out += simple[e];
        this.pos++;
      } else if (e === "\n") {
        out += "\n";
        this.newline(this.pos);
        this.pos++;
      } else if (e === "\r") {
        out += "\n";
        this.pos++;
        if (s[this.pos] === "\n") this.pos++;
        this.newline(this.pos - 1);
      } else if (isDigit(e)) {
        let n = 0;
        let len = 0;
        while (len < 3 && isDigit(s[this.pos] ?? "")) {
          n = n * 10 + (s.charCodeAt(this.pos) - 48);
          this.pos++;
          len++;
        }
        if (n > 255) this.fail("Decimal escape too large");
        out += String.fromCharCode(n);
      } else if (e === "x") {
        const h = s.slice(this.pos + 1, this.pos + 3);
        if (h.length !== 2 || !isHex(h[0]!) || !isHex(h[1]!)) this.fail("Invalid hex escape");
        out += String.fromCharCode(parseInt(h, 16));
        this.pos += 3;
      } else if (e === "z") {
        this.pos++;
        while (this.pos < s.length && /\s/.test(s[this.pos]!)) {
          if (s[this.pos] === "\n") this.newline(this.pos);
          this.pos++;
        }
      } else {
        this.fail(`Invalid escape sequence \\${e}`);
      }
      chunk = this.pos;
    }
  }

  private isPunct(v: string): boolean {
    return this.tok.t === "punct" && this.tok.v === v;
  }

  private expectPunct(v: string) {
    if (!this.isPunct(v)) this.tokFail(`Expected '${v}'`);
    this.next();
  }

  parseFile(): Record<string, LuaValue> {
    const result: Record<string, LuaValue> = Object.create(null) as Record<string, LuaValue>;
    this.next();
    while (this.tok.t !== "eof") {
      if (this.tok.t !== "name") this.tokFail("Expected variable name");
      const name = this.tok.v as string;
      this.next();
      this.expectPunct("=");
      result[name] = this.parseValue(0);
      if (this.isPunct(";")) this.next();
    }
    return { ...result };
  }

  private parseValue(depth: number): LuaValue {
    const tok = this.tok;
    switch (tok.t) {
      case "string":
        this.next();
        return tok.v;
      case "number":
        this.next();
        return tok.v;
      case "name":
        if (tok.v === "true" || tok.v === "false" || tok.v === "nil") {
          this.next();
          return tok.v === "nil" ? null : tok.v === "true";
        }
        return this.tokFail(`Unexpected identifier '${tok.v}'`);
      case "punct":
        if (tok.v === "-") {
          this.next();
          if (this.tok.t !== "number") this.tokFail("Expected number after '-'");
          const n = this.tok.v;
          this.next();
          return -n;
        }
        if (tok.v === "{") return this.parseTable(depth + 1);
        return this.tokFail(`Unexpected '${tok.v}'`);
      default:
        return this.tokFail("Unexpected end of input");
    }
  }

  private parseTable(depth: number): LuaValue {
    if (depth > MAX_DEPTH) this.tokFail(`Tables nested deeper than ${MAX_DEPTH}`);
    this.next(); // {
    const positional: LuaValue[] = [];
    const keyed = new Map<string, LuaValue>();
    let hasKeyed = false;
    while (!this.isPunct("}")) {
      if (this.tok.t === "eof") this.tokFail("Unexpected end of input in table");
      if (this.isPunct("[")) {
        this.next();
        let key: string;
        if (this.tok.t === "string") {
          key = this.tok.v;
        } else if (this.tok.t === "number" || this.isPunct("-")) {
          let neg = false;
          if (this.isPunct("-")) {
            neg = true;
            this.next();
          }
          if (this.tok.t !== "number") this.tokFail("Expected number");
          key = String(neg ? -this.tok.v : this.tok.v);
        } else {
          return this.tokFail("Unsupported table key");
        }
        this.next();
        this.expectPunct("]");
        this.expectPunct("=");
        keyed.set(key, this.parseValue(depth));
        hasKeyed = true;
      } else if (this.tok.t === "name" && this.peekIsAssign()) {
        const key = this.tok.v as string;
        this.next();
        this.next(); // =
        keyed.set(key, this.parseValue(depth));
        hasKeyed = true;
      } else {
        positional.push(this.parseValue(depth));
      }
      if (this.isPunct(",") || this.isPunct(";")) this.next();
      else if (!this.isPunct("}")) this.tokFail("Expected ',' or '}'");
    }
    this.next(); // }
    return this.buildTable(positional, keyed, hasKeyed);
  }

  /** After a name token: is the next significant token '=' (and not '==')? */
  private peekIsAssign(): boolean {
    const save = { pos: this.pos, line: this.line, lineStart: this.lineStart, tok: this.tok };
    this.next();
    const isAssign = this.isPunct("=");
    this.pos = save.pos;
    this.line = save.line;
    this.lineStart = save.lineStart;
    this.tok = save.tok;
    return isAssign;
  }

  private buildTable(positional: LuaValue[], keyed: Map<string, LuaValue>, hasKeyed: boolean): LuaValue {
    // Positional entries occupy integer keys 1..n (explicit [i]= entries take precedence over them? Lua
    // assigns positionals last; mirror that by letting positionals overwrite).
    positional.forEach((v, i) => keyed.set(String(i + 1), v));
    if (!hasKeyed) return positional.length > 0 ? positional : {};
    const n = keyed.size;
    let isArray = true;
    for (let i = 1; i <= n; i++) {
      if (!keyed.has(String(i))) {
        isArray = false;
        break;
      }
    }
    if (isArray && n > 0) {
      const arr: LuaValue[] = [];
      for (let i = 1; i <= n; i++) arr.push(keyed.get(String(i))!);
      return arr;
    }
    const obj: { [key: string]: LuaValue } = {};
    for (const [k, v] of keyed) Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
    return obj;
  }
}
