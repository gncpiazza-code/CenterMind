/// Identificador de build — visible en UI para confirmar que el APK instalado es el correcto.
abstract final class BuildInfo {
  static const String tag = String.fromEnvironment(
    'APP_BUILD_TAG',
    defaultValue: 'dev',
  );

  static const String versionLabel = String.fromEnvironment(
    'APP_VERSION_LABEL',
    defaultValue: '1.0.2',
  );
}
