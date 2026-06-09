import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import 'bundle_cache.dart';

/// Maneja el bundle offline: fetch en background al iniciar y cache en disco.
/// Provee slices del bundle a otros providers cuando están offline.
class BundleProvider extends ChangeNotifier {
  final ApiClient _api;

  Map<String, dynamic>? _bundle;
  bool _loading = false;

  BundleProvider({required ApiClient api}) : _api = api;

  Map<String, dynamic>? get bundle => _bundle;
  bool get hasCache => _bundle != null;

  /// Inicializa desde cache de disco, luego refresca en background.
  Future<void> init() async {
    _bundle = await BundleCache.load();
    if (_bundle != null) notifyListeners();
    _fetchInBackground();
  }

  /// Fuerza un refetch del bundle (ej. pull-to-refresh).
  Future<void> refresh() async {
    if (_loading) return;
    await _fetchInBackground();
  }

  Future<void> _fetchInBackground() async {
    _loading = true;
    try {
      final fresh = await _api.get('/api/vendedor-app/bundle');
      _bundle = fresh;
      await BundleCache.save(fresh);
      notifyListeners();
    } catch (_) {
      // Sin red: usa cache existente sin avisar al usuario
    } finally {
      _loading = false;
    }
  }

  /// Limpia la cache al logout.
  Future<void> clear() async {
    _bundle = null;
    await BundleCache.clear();
    notifyListeners();
  }

  // ── Helpers de slices ────────────────────────────────────────────────────────

  Map<String, dynamic>? get carteraHoy =>
      _bundle?['cartera_hoy'] as Map<String, dynamic>?;

  List<dynamic> get objetivos =>
      (_bundle?['objetivos'] as List<dynamic>?) ?? [];

  Map<String, dynamic>? get stats =>
      _bundle?['stats'] as Map<String, dynamic>?;

  List<dynamic> get exhibicionesRecientes =>
      (_bundle?['exhibiciones_recientes'] as List<dynamic>?) ?? [];
}
