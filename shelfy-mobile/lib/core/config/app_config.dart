/// Configuración global de la app. Los valores se inyectan vía --dart-define
/// durante el build (CI/CD) o por flavors de Android/iOS.
class AppConfig {
  /// URL base del backend Shelfy.
  /// Prod: https://api.shelfycenter.com (Railway) — requiere deploy con vendedor_app.
  /// Dev iPhone físico: http://<IP-LAN-Mac>:8000 (ver config/dev-device.json).
  /// Dev simulador: http://127.0.0.1:8000
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.shelfycenter.com',
  );

  /// Flavor activo (tabaco | aloma | liver | real).
  static const String flavor = String.fromEnvironment(
    'FLAVOR',
    defaultValue: 'tabaco',
  );

  /// Tiempo de expiración del caché de autenticación (ms).
  static const int sessionCacheTtlMs = 3600000; // 1 hora
}
