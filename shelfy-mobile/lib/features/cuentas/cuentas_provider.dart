import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/cc_response.dart';

/// ChangeNotifier que gestiona el estado del módulo de cuentas corrientes.
class CuentasProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  CuentasProvider({required ApiClient api}) : _api = api;

  CcResponse? ccData;
  bool loading = false;
  String? error;

  String _modo = 'general';
  String get modo => _modo;

  /// Obtiene las cuentas corrientes desde GET /api/vendedor-app/cc?modo=...
  Future<void> fetch({String modo = 'general'}) async {
    _modo = modo;
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _api.get('/api/vendedor-app/cc?modo=$modo');
      ccData = CcResponse.fromJson(data);
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Error al cargar las cuentas corrientes';
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
