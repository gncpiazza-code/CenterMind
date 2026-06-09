import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import 'models/galeria_models.dart';

/// ChangeNotifier que gestiona el estado de la galería de exhibiciones.
class GaleriaProvider extends ChangeNotifier {
  final ApiClient _api;

  GaleriaProvider({required ApiClient api}) : _api = api;

  // ─── Lista de clientes ───────────────────────────────────────────────────
  List<GaleriaCliente> clientes = [];
  bool loadingClientes = false;
  String? errorClientes;

  // ─── Timeline de un cliente ──────────────────────────────────────────────
  GaleriaClienteTimeline? timelineActual;
  bool loadingTimeline = false;
  String? errorTimeline;

  // ─── Vista activa ────────────────────────────────────────────────────────
  /// 'grid' o 'mapa'
  String viewMode = 'grid';

  void setViewMode(String mode) {
    viewMode = mode;
    notifyListeners();
  }

  /// Carga la lista de clientes con exhibiciones.
  Future<void> fetchClientes({bool force = false}) async {
    if (!force && clientes.isNotEmpty) return;
    loadingClientes = true;
    errorClientes = null;
    notifyListeners();

    try {
      final data = await _api.get('/api/vendedor-app/galeria/clientes');
      final raw = data['clientes'] as List<dynamic>? ?? [];
      clientes = raw
          .map((e) => GaleriaCliente.fromJson(e as Map<String, dynamic>))
          .toList();
    } on ApiException catch (e) {
      errorClientes = e.message;
    } catch (_) {
      errorClientes = 'Error al cargar la galería';
    } finally {
      loadingClientes = false;
      notifyListeners();
    }
  }

  /// Carga el timeline de exhibiciones para un cliente específico.
  Future<void> fetchTimeline(String idClienteErp) async {
    loadingTimeline = true;
    errorTimeline = null;
    timelineActual = null;
    notifyListeners();

    try {
      final data = await _api.get(
        '/api/vendedor-app/galeria/cliente/$idClienteErp/timeline',
      );
      timelineActual = GaleriaClienteTimeline.fromJson(data);
    } on ApiException catch (e) {
      errorTimeline = e.message;
    } catch (_) {
      errorTimeline = 'Error al cargar el historial';
    } finally {
      loadingTimeline = false;
      notifyListeners();
    }
  }

  /// Refresca la lista y opcionalmente precarga el timeline de un PDV.
  Future<void> refreshAfterUpload(String idClienteErp) async {
    await fetchClientes(force: true);
    final normalized = idClienteErp.trim();
    if (normalized.isEmpty) return;
    final match = clientes.where((c) => c.idClienteErp == normalized);
    if (match.isEmpty) {
      // Reintento: backend puede devolver ERP con/sin ceros a la izquierda.
      final stripped = normalized.replaceFirst(RegExp(r'^0+'), '');
      if (stripped.isNotEmpty) {
        final alt = clientes.where((c) =>
            c.idClienteErp == stripped ||
            c.idClienteErp.replaceFirst(RegExp(r'^0+'), '') == stripped);
        if (alt.isNotEmpty) {
          await fetchTimeline(alt.first.idClienteErp);
          return;
        }
      }
      return;
    }
    await fetchTimeline(normalized);
  }

  /// Limpia el timeline al cerrar el sheet.
  void clearTimeline() {
    timelineActual = null;
    errorTimeline = null;
    loadingTimeline = false;
    notifyListeners();
  }
}
