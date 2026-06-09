import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Cache de bundle offline en disco.
/// TTL: 24 horas. Se actualiza en background al arrancar la app con red.
class BundleCache {
  static const Duration _ttl = Duration(hours: 24);
  static const String _filename = 'shelfy_bundle_cache.json';

  static Future<File> _cacheFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/$_filename');
  }

  /// Guarda el bundle JSON en disco con timestamp actual.
  static Future<void> save(Map<String, dynamic> bundle) async {
    try {
      final file = await _cacheFile();
      final wrapper = {
        'saved_at': DateTime.now().toIso8601String(),
        'bundle': bundle,
      };
      await file.writeAsString(jsonEncode(wrapper));
    } catch (_) {}
  }

  /// Lee el bundle si existe y no ha expirado. Retorna null si no hay cache válido.
  static Future<Map<String, dynamic>?> load() async {
    try {
      final file = await _cacheFile();
      if (!await file.exists()) return null;
      final raw = await file.readAsString();
      final wrapper = jsonDecode(raw) as Map<String, dynamic>;
      final savedAt = DateTime.tryParse(wrapper['saved_at'] as String? ?? '');
      if (savedAt == null) return null;
      if (DateTime.now().difference(savedAt) > _ttl) return null;
      return wrapper['bundle'] as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  /// Elimina el cache del disco (al logout o cambio de sesión).
  static Future<void> clear() async {
    try {
      final file = await _cacheFile();
      if (await file.exists()) await file.delete();
    } catch (_) {}
  }
}
