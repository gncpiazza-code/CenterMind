import 'package:flutter/foundation.dart';

/// Controla el tab activo del shell principal (Captura, Galería, etc.).
class HomeTabController extends ChangeNotifier {
  int selectedIndex = 0;

  /// Cliente ERP a abrir en galería tras un upload exitoso (opcional).
  String? pendingGaleriaClienteErp;

  void goToTab(int index, {String? openGaleriaClienteErp}) {
    if (openGaleriaClienteErp != null) {
      pendingGaleriaClienteErp = openGaleriaClienteErp;
    }
    if (selectedIndex == index && openGaleriaClienteErp == null) {
      notifyListeners();
      return;
    }
    selectedIndex = index;
    notifyListeners();
  }

  String? takePendingGaleriaCliente() {
    final v = pendingGaleriaClienteErp;
    pendingGaleriaClienteErp = null;
    return v;
  }
}
