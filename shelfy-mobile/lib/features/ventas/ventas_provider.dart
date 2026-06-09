import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/ventas_response.dart';

/// ChangeNotifier que gestiona el estado del módulo de ventas.
class VentasProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  VentasProvider({required ApiClient api}) : _api = api;

  VentasResponse? ventasData;
  bool loading = false;
  bool hasLoaded = false;
  String? error;

  /// Obtiene las ventas desde GET /api/vendedor-app/ventas?modo=mtd.
  Future<void> fetch({String modo = 'mtd', bool force = false}) async {
    if (!force && ventasData != null) return;
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _api.get('/api/vendedor-app/ventas?modo=$modo');
      ventasData = VentasResponse.fromJson(data);
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Error al cargar las ventas';
    } finally {
      loading = false;
      hasLoaded = true;
      notifyListeners();
    }
  }
}
