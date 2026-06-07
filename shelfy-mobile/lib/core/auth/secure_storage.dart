import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import 'session_model.dart';

/// Wrapper de flutter_secure_storage para almacenar JWT y datos de sesión.
class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _keySession = 'shelfy_session';
  static const _keyDeviceId = 'shelfy_device_id';

  /// Guarda la sesión completa en almacenamiento seguro.
  static Future<void> saveSession(SessionData session) async {
    await _storage.write(
      key: _keySession,
      value: jsonEncode(session.toJson()),
    );
  }

  /// Carga la sesión almacenada. Retorna null si no existe.
  static Future<SessionData?> loadSession() async {
    final raw = await _storage.read(key: _keySession);
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return SessionData.fromJson(map);
    } catch (_) {
      await clearSession();
      return null;
    }
  }

  /// Elimina la sesión activa (logout).
  static Future<void> clearSession() async {
    await _storage.delete(key: _keySession);
  }

  /// Obtiene o genera un Device ID único persistente (UUID v4).
  static Future<String> getDeviceId() async {
    final existing = await _storage.read(key: _keyDeviceId);
    if (existing != null && existing.isNotEmpty) return existing;
    final newId = const Uuid().v4();
    await _storage.write(key: _keyDeviceId, value: newId);
    return newId;
  }
}
