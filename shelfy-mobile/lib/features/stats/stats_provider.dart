import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../ventas/models/ventas_response.dart';
import 'models/stats_models.dart';

/// ChangeNotifier que gestiona las estadísticas del vendedor.
/// Servir: /stats/full + /estadisticas/resumen + /ventas (sin cálculos locales).
class StatsProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  StatsProvider({required ApiClient api}) : _api = api;

  StatsData? statsData;
  KpisResumen? kpisResumen;
  VentasResponse? ventasData;
  bool loading = false;
  String? error;

  Future<void> fetch({bool force = false}) async {
    if (!force && statsData != null && kpisResumen != null && ventasData != null) {
      return;
    }
    loading = true;
    error = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        _api.get('/api/vendedor-app/stats/full'),
        _api.get('/api/vendedor-app/estadisticas/resumen'),
        _api.get('/api/vendedor-app/ventas?modo=mtd'),
      ]);

      statsData = StatsData.fromJson(results[0] as Map<String, dynamic>);
      kpisResumen = KpisResumen.fromJson(results[1] as Map<String, dynamic>);
      ventasData = VentasResponse.fromJson(results[2] as Map<String, dynamic>);
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
