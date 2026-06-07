/** Subset HTML compatible con Telegram parse_mode=HTML */

const ALLOWED = new Set(["b", "i", "u", "s", "code", "pre"]);

/** Limpia HTML guardado (DB) antes de editar o previsualizar. */
export function sanitizeStoredTelegramHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<(b|i|u|s|code|pre)\b[^>]*>/gi, "<$1>")
    .replace(/<\/(b|i|u|s|code|pre)\b[^>]*>/gi, "</$1>")
    .replace(/<\/?(?:span|font|div|p)\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u200b/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** Normaliza HTML del contentEditable → string Telegram (saltos = \\n). */
export function normalizeTelegramHtml(raw: string): string {
  if (!raw) return "";

  let html = raw
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

  // Colapsar tags anidados del mismo tipo consecutivos vacíos
  html = html.replace(/(<(\w+)>)\s*(<\2>)+/gi, "$1");
  html = html.replace(/(<\/(\w+)>)\s*(<\/\2>)+/gi, "$1");

  return html.trim();
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
