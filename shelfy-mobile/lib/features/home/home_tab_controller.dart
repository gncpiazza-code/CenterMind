import 'package:flutter/foundation.dart';

/// Tabs del shell: 0=Captura 1=Cartera 2=Stats 3=Más.
class HomeTabController extends ChangeNotifier {
  int selectedIndex = 0;

  /// Sub-screen activa dentro del hub Más (0=Ventas,1=Cuentas,2=Objetivos,3=Galería).
  int? moreSubScreenIndex;

  /// Cliente ERP a abrir en galería tras un upload exitoso (opcional).
  String? pendingGaleriaClienteErp;

  void goToTab(int index, {String? openGaleriaClienteErp}) {
    if (openGaleriaClienteErp != null) {
      pendingGaleriaClienteErp = openGaleriaClienteErp;
    }
    // Al salir del hub Más, limpiar sub-screen
    if (index != 3) moreSubScreenIndex = null;
    if (selectedIndex == index && openGaleriaClienteErp == null) {
      notifyListeners();
      return;
    }
    selectedIndex = index;
    notifyListeners();
  }

  void pushMoreSubScreen(int subIndex) {
    moreSubScreenIndex = subIndex;
    notifyListeners();
  }

  void popMoreSubScreen() {
    moreSubScreenIndex = null;
    notifyListeners();
  }

  String? takePendingGaleriaCliente() {
    final v = pendingGaleriaClienteErp;
    pendingGaleriaClienteErp = null;
    return v;
  }
}
