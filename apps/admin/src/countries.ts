/** A country's flag emoji from its two-letter code. */
export function flag(code: string) {
  return code.toUpperCase().replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}
