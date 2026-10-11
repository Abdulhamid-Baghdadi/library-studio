/**
 * Text rules shared by every module that reads or writes a note: whitespace, line breaks, sorting and the
 * number formats of the reports. Keeping them here means every note is written the same way.
 *
 *   strip(s)               str.strip()
 *   splitLines(s)          str.splitlines()
 *   collapseWhitespace(s)  re.sub(r"\s+", " ", s)
 *   normalizeNewlines(s)   CRLF and lone CR become LF
 *   compareCodePoints(a,b) string order by code point (Python's default)
 *   escapeRegExp(s)        a literal string inside a RegExp
 *   fixed(x, d)            format(x, ".2f")-style, ties rounded half to even
 *   signed(x, d)           format(x, "+.2f")
 *   percent(x)             format(x, ".0%")
 *   general(x, p)          format(x, ".4g")
 * @module domain/text-rules
 */

const WS = "\\s\\u001c-\\u001f\\u0085";
const EDGE_WS = new RegExp(`^[${WS}]+|[${WS}]+$`, "gu");
const RUN_WS = new RegExp(`[${WS}]+`, "gu");
const LINE_BREAKS = new RegExp("\r\n|[\n\r\v\f\u001c-\u001e\u0085\u2028\u2029]");
export const strip = s => String(s).replace(EDGE_WS, "");
export const collapseWhitespace = s => String(s).replace(RUN_WS, " ");
export const normalizeNewlines = s => String(s).replace(/\r\n?/g, "\n");

export function splitLines(s) {
  const lines = String(s).split(LINE_BREAKS);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function compareCodePoints(a, b) {
  a = String(a); b = String(b);
  const x = Array.from(a), y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i].codePointAt(0) - y[i].codePointAt(0);
  }
  return x.length - y.length;
}

export const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** format(x, f".{digits}f"): rounds the exact binary value, ties to even (toFixed rounds ties up). */
export function fixed(x, digits) {
  if (!Number.isFinite(x)) return String(x);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const exp = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  let e;
  if (exp === 0) e = -1074; else { mantissa |= 1n << 52n; e = exp - 1075; }
  let num = mantissa * 10n ** BigInt(digits), den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  let q = num / den;
  const twice = 2n * (num % den);
  if (twice > den || (twice === den && q % 2n === 1n)) q++;
  let s = q.toString().padStart(digits + 1, "0");
  if (digits) s = s.slice(0, -digits) + "." + s.slice(-digits);
  return (negative ? "-" : "") + s;
}

export const signed = (x, digits) => (x >= 0 && !Object.is(x, -0) ? "+" : "") + fixed(x, digits);
export const percent = x => fixed(x * 100, 0) + "%";

/** format(x, ".{p}g"): p significant digits, trailing zeros removed, exponent form outside 1e-4 .. 1e{p}. */
export function general(x, p = 4) {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(p)))));
  if (exp < -4 || exp >= p) {
    const [m, e] = x.toExponential(p - 1).split("e");
    const mant = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    const ex = Number(e);
    return `${mant}e${ex < 0 ? "-" : "+"}${String(Math.abs(ex)).padStart(2, "0")}`;
  }
  const s = x.toFixed(Math.max(0, p - 1 - exp));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
