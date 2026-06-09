import 'package:flutter/foundation.dart';

/// Tabs del shell MVP: 0=Captura 1=CC 2=Cartera 3=Objetivos 4=Stats.
class HomeTabController extends ChangeNotifier {
  /// Captura por defecto — el vendedor arranca siempre listo para registrar.
  int selectedIndex = 0;

  // Stubs para galería/hub Más — mantenidos para compilación; fuera del nav MVP.
  int? moreSubScreenIndex;
  String? pendingGaleriaClienteErp;

  void goToTab(int index) {
    assert(index >= 0 && index <= 4, 'Tab inválido: $index (shell tiene 5 tabs 0–4)');
    if (selectedIndex == index) {
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

  /// Galería fuera del MVP — placeholder para acceso futuro.
  void openGaleriaHub({String? clienteErp}) {}
}
