import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/api/api_client.dart';
import 'models/ventas_response.dart';

/// ChangeNotifier que gestiona el estado del módulo de ventas.
class VentasProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  VentasProvider({required ApiClient api}) : _api = api;

  VentasResponse? ventasData;
  bool loading = false;
  String? error;

  bool downloadingPdf = false;
  String? pdfError;
  String? pdfPath;

  /// Obtiene las ventas desde GET /api/vendedor-app/ventas?modo=mtd.
  Future<void> fetch({String modo = 'mtd'}) async {
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _api.get('/api/vendedor-app/ventas?modo=$modo');
      ventasData = VentasResponse.fromJson(data);
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Error al cargar las ventas';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Descarga el PDF de ventas, lo guarda en tmp y retorna la ruta local.
  Future<String?> downloadPdf() async {
    downloadingPdf = true;
    pdfError = null;
    pdfPath = null;
    notifyListeners();

    try {
      final bytes = await _api.getBytes('/api/vendedor-app/ventas/pdf');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/ventas_mtd.pdf');
      await file.writeAsBytes(bytes);
      pdfPath = file.path;
      return file.path;
    } on ApiException catch (e) {
      pdfError = e.message;
      return null;
    } catch (_) {
      pdfError = 'Error al descargar el PDF';
      return null;
    } finally {
      downloadingPdf = false;
      notifyListeners();
    }
  }
}
