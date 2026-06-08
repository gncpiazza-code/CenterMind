import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import 'session_model.dart';

/// Wrapper de flutter_secure_storage para almacenar JWT y datos de sesión.
class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
      synchronizable: false,
    ),
  );

  static const _keySession = 'shelfy_session';
  static const _keyDeviceId = 'shelfy_device_id';

  static String? _memoryDeviceId;
  static SessionData? _memorySession;

  /// Guarda la sesión completa en almacenamiento seguro.
  static Future<void> saveSession(SessionData session) async {
    _memorySession = session;
    try {
      await _storage.write(
        key: _keySession,
        value: jsonEncode(session.toJson()),
      );
    } catch (_) {
      // Fallback en simulador / keychain bloqueado: memoria de la sesión actual.
    }
  }

  /// Carga la sesión almacenada. Retorna null si no existe.
  static Future<SessionData?> loadSession() async {
    if (_memorySession != null) return _memorySession;
    try {
      final raw = await _storage.read(key: _keySession);
      if (raw == null) return null;
      final map = jsonDecode(raw) as Map<String, dynamic>;
      _memorySession = SessionData.fromJson(map);
      return _memorySession;
    } catch (_) {
      await clearSession();
      return null;
    }
  }

  /// Elimina la sesión activa (logout).
  static Future<void> clearSession() async {
    _memorySession = null;
    try {
      await _storage.delete(key: _keySession);
    } catch (_) {}
  }

  /// Obtiene o genera un Device ID único persistente (UUID v4).
  static Future<String> getDeviceId() async {
    if (_memoryDeviceId != null) return _memoryDeviceId!;
    try {
      final existing = await _storage.read(key: _keyDeviceId);
      if (existing != null && existing.isNotEmpty) {
        _memoryDeviceId = existing;
        return existing;
      }
      final newId = const Uuid().v4();
      await _storage.write(key: _keyDeviceId, value: newId);
      _memoryDeviceId = newId;
      return newId;
    } catch (_) {
      _memoryDeviceId ??= const Uuid().v4();
      return _memoryDeviceId!;
    }
  }
}
