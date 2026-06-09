import 'package:flutter/foundation.dart';

/// Tabs del shell: 0=Captura 1=CC 2=Cartera 3=Objetivos 4=Stats 5=Galería.
class HomeTabController extends ChangeNotifier {
  /// Captura por defecto — el vendedor arranca siempre listo para registrar.
  int selectedIndex = 0;

  // Stubs para galería/hub Más — mantenidos para compilación; fuera del nav MVP.
  int? moreSubScreenIndex;
  String? pendingGaleriaClienteErp;

  /// PDV NRO pre-cargado para Captura (lanzado desde Cartera → tab 0).
  String? pendingCapturePdvNro;

  void goToTab(int index) {
    assert(index >= 0 && index <= 5, 'Tab inválido: $index (shell tiene 6 tabs 0–5)');
    if (selectedIndex == index) {
      notifyListeners();
      return;
    }
    selectedIndex = index;
    notifyListeners();
  }

  /// Navega a Captura con un NRO PDV pre-cargado.
  void goToCaptureWithPdv(String nroCliente) {
    pendingCapturePdvNro = nroCliente;
    goToTab(0);
  }

  String? takePendingCapturePdvNro() {
    final v = pendingCapturePdvNro;
    pendingCapturePdvNro = null;
    return v;
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
