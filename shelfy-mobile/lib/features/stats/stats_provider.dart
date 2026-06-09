import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/stats_models.dart';

/// ChangeNotifier que gestiona las estadísticas del vendedor.
/// Llama /stats/full (exhibiciones) + /estadisticas/resumen (7 KPIs) + /ventas (SKU).
class StatsProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  StatsProvider({required ApiClient api}) : _api = api;

  StatsData? statsData;
  KpisResumen? kpisResumen;
  VentasData? ventasData;
  bool loading = false;
  String? error;

  Future<void> fetch({bool force = false}) async {
    if (!force && statsData != null && kpisResumen != null && ventasData != null) return;
    loading = true;
    error = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _api.get('/api/vendedor-app/stats/full'),
        _api.get('/api/vendedor-app/estadisticas/resumen'),
        _api.get('/api/vendedor-app/ventas'),
      ]);

      statsData = StatsData.fromJson(results[0]);
      kpisResumen = KpisResumen.fromJson(results[1]);
      ventasData = VentasData.fromJson(results[2]);
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
