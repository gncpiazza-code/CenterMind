import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/cartera_models.dart';

/// ChangeNotifier que gestiona el estado de la cartera (modo hoy y general).
class CarteraProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  CarteraProvider({required ApiClient api}) : _api = api;

  CarteraResponse? cartaHoy;
  CarteraResponse? cartaGeneral;

  bool loadingHoy = false;
  bool loadingGeneral = false;

  String? errorHoy;
  String? errorGeneral;

  /// Carga la cartera para el [mode] indicado ('hoy' o 'general').
  Future<void> fetchCartera(String mode) async {
    assert(mode == 'hoy' || mode == 'general');

    if (mode == 'hoy') {
      loadingHoy = true;
      errorHoy = null;
    } else {
      loadingGeneral = true;
      errorGeneral = null;
    }
    notifyListeners();

    try {
      final data = await _api.get('/api/vendedor-app/cartera?mode=$mode');
      final response = CarteraResponse.fromJson(data);
      if (mode == 'hoy') {
        cartaHoy = response;
      } else {
        cartaGeneral = response;
      }
    } on ApiException catch (e) {
      if (mode == 'hoy') {
        errorHoy = e.message;
      } else {
        errorGeneral = e.message;
      }
    } catch (e) {
      if (mode == 'hoy') {
        errorHoy = 'Error al cargar la cartera';
      } else {
        errorGeneral = 'Error al cargar la cartera';
      }
    } finally {
      if (mode == 'hoy') {
        loadingHoy = false;
      } else {
        loadingGeneral = false;
      }
      notifyListeners();
    }
  }
}
