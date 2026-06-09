// ignore_for_file: avoid_print
import '../api/api_client.dart';

/// Stub de integración FCM para vendedores.
///
/// Para activar push real:
///   1. Añadir `firebase_core` y `firebase_messaging` a pubspec.yaml
///   2. Colocar google-services.json (Android) y GoogleService-Info.plist (iOS)
///   3. Descomentar el bloque Firebase en `requestAndRegisterToken()`
///   4. Ejecutar `20260607_vendedor_app_settings_push.sql` en Supabase si pendiente
class VendedorPushService {
  final ApiClient _api;

  VendedorPushService(this._api);

  /// Solicita el token FCM del dispositivo y lo registra en el backend.
  /// Si Firebase no está configurado, retorna silenciosamente.
  Future<void> requestAndRegisterToken() async {
    try {
      // ── Firebase setup requerido ──────────────────────────────────────────
      // Descomentar cuando firebase_messaging esté en pubspec:
      //
      // final messaging = FirebaseMessaging.instance;
      // final settings = await messaging.requestPermission(
      //   alert: true, badge: true, sound: true,
      // );
      // if (settings.authorizationStatus == AuthorizationStatus.denied) return;
      // final token = await messaging.getToken();
      // if (token == null) return;
      // ─────────────────────────────────────────────────────────────────────

      // Placeholder: sin Firebase activo, no registrar
      print('[push] VendedorPushService: Firebase no configurado — token no registrado');
    } catch (e) {
      print('[push] requestAndRegisterToken error: $e');
    }
  }

  /// Registra un token explícito (llamado desde la plataforma o tests).
  Future<void> registerToken(String fcmToken, String platform) async {
    try {
      await _api.post(
        '/api/vendedor-app/device-token',
        {'fcm_token': fcmToken, 'platform': platform},
      );
    } catch (e) {
      print('[push] registerToken error: $e');
    }
  }
}
