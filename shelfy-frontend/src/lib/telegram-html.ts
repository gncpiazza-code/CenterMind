/** Subset HTML compatible con Telegram parse_mode=HTML */

const ALLOWED = new Set(["b", "i", "u", "s", "code", "pre"]);

/** Secuencias literales \\n en DB (seed SQL sin E'…') → saltos reales. */
function unescapeLiteralBackslashSequences(text: string): string {
  return text.replace(/\\([nrt])/g, (_, ch: string) => {
    if (ch === "n") return "\n";
    if (ch === "r") return "\r";
    return "\t";
  });
}

/** Limpia HTML guardado (DB) antes de editar o previsualizar. */
export function sanitizeStoredTelegramHtml(text: string): string {
  if (!text) return "";
  return unescapeLiteralBackslashSequences(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<(b|i|u|s|code|pre)\b[^>]*>/gi, "<$1>")
    .replace(/<\/(b|i|u|s|code|pre)\b[^>]*>/gi, "</$1>")
    .replace(/<\/?(?:span|font)\b[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u200b/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n (?=[^\s•])/g, "\n");
}

/** Normaliza HTML del contentEditable → string Telegram (saltos = \\n). */
export function normalizeTelegramHtml(raw: string): string {
  if (!raw) return "";

  let html = unescapeLiteralBackslashSequences(raw)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<strong\b[^>]*>/gi, "<b>")
    .replace(/<\/strong>/gi, "</b>")
    .replace(/<em\b[^>]*>/gi, "<i>")
    .replace(/<\/em>/gi, "</i>")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/?(?:span|font)\b[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u200b/g, "");

  html = html.replace(/<(b|i|u|s|code|pre)\b[^>]*>/gi, "<$1>");
  html = html.replace(/<\/(b|i|u|s|code|pre)\b[^>]*>/gi, "</$1>");

  // Quitar tags no permitidos (conservar contenido)
  html = html.replace(/<(\/?)([\w]+)([^>]*)>/gi, (match, slash, tag) => {
    const t = tag.toLowerCase();
    if (ALLOWED.has(t)) return match;
    return "";
  });

  html = html.replace(/\n{3,}/g, "\n\n");
  html = html.replace(/\n (?=[^\s•])/g, "\n");

  // Colapsar tags anidados del mismo tipo consecutivos vacíos
  html = html.replace(/(<(\w+)>)\s*(<\2>)+/gi, "$1");
  html = html.replace(/(<\/(\w+)>)\s*(<\/\2>)+/gi, "$1");

  // No trim(): preserva \n inicial/final en plantillas dinámicas (filas ranking, items objetivos).
  return html.replace(/^\s+/, "").replace(/[ \t]+$/, "");
}

/** Telegram HTML → HTML seguro para render en preview (contentEditable). */
export function telegramHtmlToRenderHtml(text: string): string {
  if (!text) return "";
  const clean = sanitizeStoredTelegramHtml(text);
  const escaped = clean
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/&lt;b&gt;/gi, "<b>")
    .replace(/&lt;\/b&gt;/gi, "</b>")
    .replace(/&lt;i&gt;/gi, "<i>")
    .replace(/&lt;\/i&gt;/gi, "</i>")
    .replace(/&lt;u&gt;/gi, "<u>")
    .replace(/&lt;\/u&gt;/gi, "</u>")
    .replace(/&lt;s&gt;/gi, "<s>")
    .replace(/&lt;\/s&gt;/gi, "</s>")
    .replace(/&lt;code&gt;/gi, "<code>")
    .replace(/&lt;\/code&gt;/gi, "</code>")
    .replace(/\n/g, "<br>");
}

export function isTelegramHtmlEmpty(text: string): boolean {
  const plain = text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  return plain.length === 0;
}
