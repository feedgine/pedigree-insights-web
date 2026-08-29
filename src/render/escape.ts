/**
 * Escaping, and the one rule that makes it reliable: nothing reaches the page except
 * through here.
 *
 * Dog names in this database contain apostrophes, ampersands and quotation marks. They are
 * not attacks — they are Finnish and Baltic kennel names — but they break a page just as
 * effectively, and a name is the one thing on this site that comes from outside the code.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

const HTML_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/** Escape text for use in element content or an attribute value. */
export function esc(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES.get(c) ?? c);
}

/**
 * Escape a value being embedded in a `<script>` block as JSON.
 *
 * `JSON.stringify` is not enough on its own: a `</script>` inside a string ends the block
 * wherever it appears, and `<!--` starts an HTML comment. Escaping the angle brackets as
 * unicode keeps the JSON valid and the block intact.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Join template fragments, dropping the empty ones so absent sections leave no gap. */
export function lines(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join('\n');
}
