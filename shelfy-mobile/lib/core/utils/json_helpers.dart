/// Convierte valores JSON (int, double, String) a String de forma segura.
String jsonAsString(dynamic value, {String fallback = ''}) {
  if (value == null) return fallback;
  return value.toString();
}
