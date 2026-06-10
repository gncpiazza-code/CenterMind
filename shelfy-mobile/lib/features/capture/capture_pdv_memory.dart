import 'package:shared_preferences/shared_preferences.dart';

/// Persiste el último tipo de ingreso registrado por PDV.
/// Clave: `capture_ingreso_{distId}_{vendorId}_{nro}`.
abstract final class CapturePdvMemory {
  static String _key(int distId, int vendorId, String nro) =>
      'capture_ingreso_${distId}_${vendorId}_$nro';

  static Future<String?> get(int? distId, int? vendorId, String nro) async {
    if (distId == null || vendorId == null) return null;
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_key(distId, vendorId, nro));
  }

  static Future<void> save(int? distId, int? vendorId, String nro, String tipo) async {
    if (distId == null || vendorId == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(distId, vendorId, nro), tipo);
  }

  static Future<void> clear(int? distId, int? vendorId, String nro) async {
    if (distId == null || vendorId == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key(distId, vendorId, nro));
  }
}
