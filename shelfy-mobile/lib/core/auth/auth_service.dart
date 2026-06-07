import '../api/api_client.dart';
import 'secure_storage.dart';
import 'session_model.dart';

/// Servicio de autenticación para vendedores de campo.
/// Gestiona activación por API key y ciclo de vida de la sesión.
class AuthService {
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
  }

  /// Activa el dispositivo con una API key (formato: sapp_{key_id}_{random32}).
  /// Llama a POST /api/vendedor-app/auth/activate y persiste la sesión.
  Future<SessionData> activate(String apiKey) async {
    final deviceId = await SecureStorageService.getDeviceId();

    final response = await _api.post(
      '/api/vendedor-app/auth/activate',
      {
        'api_key': apiKey.trim(),
        'device_id': deviceId,
      },
    );

    // El backend devuelve: jwt, id_distribuidor, id_vendedor, branding
    final session = SessionData(
      jwt: response['jwt'] as String,
      idDistribuidor: response['id_distribuidor'] as int,
      idVendedor: response['id_vendedor'] as int,
      deviceId: deviceId,
      branding: response['branding'] as Map<String, dynamic>?,
    );

    await SecureStorageService.saveSession(session);
    _currentSession = session;
    _api.setAuth(jwt: session.jwt, deviceId: session.deviceId);
    return session;
  }

  /// Cierra sesión: elimina token del almacenamiento seguro y limpia estado.
  Future<void> logout() async {
    await SecureStorageService.clearSession();
    _currentSession = null;
    _api.clearAuth();
  }
}
