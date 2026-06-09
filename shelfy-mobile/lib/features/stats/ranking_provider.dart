import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/ranking_model.dart';

/// ChangeNotifier que gestiona el ranking completo de vendedores.
class RankingProvider extends ChangeNotifier {
  final ApiClient _api;

  RankingResponse? rankingData;
  bool loading = false;
  String? error;

  int selectedYear;
  int selectedMonth;

  RankingProvider({required ApiClient api})
      : _api = api,
        selectedYear = DateTime.now().year,
        selectedMonth = DateTime.now().month;

  /// Obtiene el ranking desde GET /api/vendedor-app/ranking?year=&month=.
  Future<void> fetch({int? year, int? month, bool force = false}) async {
    final newYear = year ?? selectedYear;
    final newMonth = month ?? selectedMonth;
    final periodChanged =
        newYear != selectedYear || newMonth != selectedMonth;
    selectedYear = newYear;
    selectedMonth = newMonth;

    if (!force && !periodChanged && rankingData != null) return;
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _api
          .get('/api/vendedor-app/ranking?year=$selectedYear&month=$selectedMonth');
      rankingData = RankingResponse.fromJson(data);
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Error al cargar el ranking';
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
