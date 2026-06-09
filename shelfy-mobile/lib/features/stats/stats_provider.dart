import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/stats_models.dart';

/// ChangeNotifier que gestiona las estadísticas del vendedor.
class StatsProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  StatsProvider({required ApiClient api}) : _api = api;

  StatsData? statsData;
  bool loading = false;
  String? error;

  /// Obtiene las estadísticas desde GET /api/vendedor-app/stats/full.
  Future<void> fetch({bool force = false}) async {
    if (!force && statsData != null) return;
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _api.get('/api/vendedor-app/stats/full');
      statsData = StatsData.fromJson(data);
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Error al cargar las estadísticas';
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
