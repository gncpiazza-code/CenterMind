import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../offline/bundle_cache.dart';
import '../platform/app_platform.dart';
import 'secure_storage.dart';
import 'session_model.dart';

int _readInt(dynamic value, String field) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  throw ApiException(
    statusCode: 500,
    message: 'Respuesta inválida del servidor ($field)',
  );
}

Map<String, dynamic>? _readBranding(dynamic value) {
  if (value == null) return null;
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return null;
}

/// Servicio de autenticación para vendedores de campo.
/// Gestiona activación por API key y ciclo de vida de la sesión.
class AuthService extends ChangeNotifier {
  final ApiClient _api;
  SessionData? _currentSession;

  AuthService({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  SessionData? get currentSession => _currentSession;

  bool get isLoggedIn => _currentSession != null;

  /// Expone el cliente HTTP para su uso en providers de features.
  ApiClient get api => _api;

  /// Carga la sesión guardada al iniciar la app.
  Future<void> initialize() async {
    _currentSession = await SecureStorageService.loadSession();
    if (_currentSession != null) {
      _api.setAuth(
        jwt: _currentSession!.jwt,
        deviceId: _currentSession!.deviceId,
      );
    }
    notifyListeners();
  }

  /// Activa el dispositivo con una API key (formato: sapp_{key_id}_{random32}).
  /// Llama a POST /api/vendedor-app/auth/activate y persiste la sesión.
  Future<SessionData> activate(String apiKey) async {
    await _api.pingHealth();

    final deviceId = await SecureStorageService.getDeviceId();

    final response = await _api.post(
      '/api/vendedor-app/auth/activate',
      {
        'key': apiKey.trim(),
        'device_id': deviceId,
        'platform': appPlatform,
        'app_version': '1.0.1',
      },
    );

    final token = response['session_token'] as String? ??
        response['jwt'] as String?;
    if (token == null || token.isEmpty) {
      throw ApiException(
        statusCode: 500,
        message: 'Respuesta inválida del servidor (sin token de sesión)',
      );
    }

    final session = SessionData(
      jwt: token,
      idDistribuidor: _readInt(response['id_distribuidor'], 'id_distribuidor'),
      idVendedor: _readInt(response['id_vendedor'], 'id_vendedor'),
      deviceId: deviceId,
      branding: _readBranding(response['branding']),
    );

    await SecureStorageService.saveSession(session);
    _currentSession = session;
    _api.setAuth(jwt: session.jwt, deviceId: session.deviceId);
    notifyListeners();
    return session;
  }

  /// Cierra sesión: elimina token, cache bundle y limpia estado.
  Future<void> logout() async {
    await SecureStorageService.clearSession();
    await BundleCache.clear();
    _currentSession = null;
    _api.clearAuth();
    notifyListeners();
  }

  /// Solo tests: simula sesión activa sin llamar al backend.
  @visibleForTesting
  void debugSetSession(SessionData session) {
    _currentSession = session;
    _api.setAuth(jwt: session.jwt, deviceId: session.deviceId);
    notifyListeners();
  }
}
