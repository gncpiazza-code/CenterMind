import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/objetivo_app.dart';

/// ChangeNotifier que gestiona los objetivos activos del vendedor.
class ObjetivosProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  ObjetivosProvider({required ApiClient api}) : _api = api;

  List<ObjetivoApp> objetivos = [];
  bool loading = false;
  String? error;

  /// Obtiene los objetivos activos desde GET /api/vendedor-app/objetivos.
  Future<void> fetch() async {
    loading = true;
    error = null;
    notifyListeners();

    try {
      final list = await _api.getList('/api/vendedor-app/objetivos');
      objetivos = list
          .map((e) => ObjetivoApp.fromJson(e as Map<String, dynamic>))
          .toList();
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Error al cargar los objetivos';
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
