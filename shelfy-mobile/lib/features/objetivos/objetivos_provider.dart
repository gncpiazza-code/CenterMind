import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/objetivo_app.dart';
import 'models/objetivo_detalle.dart';

/// ChangeNotifier que gestiona los objetivos activos del vendedor.
class ObjetivosProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  ObjetivosProvider({required ApiClient api}) : _api = api;

  List<ObjetivoApp> objetivos = [];
  bool loading = false;
  bool hasLoaded = false;
  String? error;

  /// Obtiene los objetivos activos desde GET /api/vendedor-app/objetivos.
  Future<void> fetch({bool force = false}) async {
    if (!force && objetivos.isNotEmpty) return;
    loading = true;
    error = null;
    notifyListeners();

    try {
      final list = await _api.getList('/api/vendedor-app/objetivos');
      final parsed = <ObjetivoApp>[];
      for (final item in list) {
        if (item is! Map<String, dynamic>) continue;
        try {
          parsed.add(ObjetivoApp.fromJson(item));
        } catch (_) {}
      }
      objetivos = parsed;
    } on ApiException catch (e) {
      error = e.message;
    } catch (e) {
      error = 'Error al cargar los objetivos: $e';
    } finally {
      loading = false;
      hasLoaded = true;
      notifyListeners();
    }
  }

  /// Obtiene el detalle de un objetivo por ID desde GET /api/vendedor-app/objetivos/{id}.
  /// Lanza [ApiException] si el servidor responde con error.
  Future<ObjetivoDetalle> fetchDetalle(String id) async {
    final trimmed = id.trim();
    if (trimmed.isEmpty) {
      throw const ApiException(statusCode: 400, message: 'ID de objetivo inválido');
    }
    final path =
        '/api/vendedor-app/objetivos/${Uri.encodeComponent(trimmed)}';
    final data = await _api.get(path);
    return ObjetivoDetalle.fromJson(data);
  }
}
