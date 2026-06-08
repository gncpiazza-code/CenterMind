import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/api/api_client.dart';
import 'models/cc_response.dart';

/// ChangeNotifier que gestiona el estado del módulo de cuentas corrientes.
class CuentasProvider extends ChangeNotifier {
  final ApiClient _api;

  // ignore: prefer_initializing_formals
  CuentasProvider({required ApiClient api}) : _api = api;

  CcResponse? ccData;
  bool loading = false;
  String? error;

  String _modo = 'general';
  String get modo => _modo;

  bool downloadingPdf = false;
  String? pdfError;
  String? pdfPath;

  /// Obtiene las cuentas corrientes desde GET /api/vendedor-app/cc?modo=...
  Future<void> fetch({String modo = 'general'}) async {
    _modo = modo;
    loading = true;
    error = null;
    notifyListeners();

    try {
      final data = await _api.get('/api/vendedor-app/cc?modo=$modo');
      ccData = CcResponse.fromJson(data);
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Error al cargar las cuentas corrientes';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Descarga el PDF de cuentas corrientes y retorna la ruta local.
  Future<String?> downloadPdf() async {
    downloadingPdf = true;
    pdfError = null;
    pdfPath = null;
    notifyListeners();

    try {
      final bytes = await _api.getBytes('/api/vendedor-app/cc/pdf');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/cuentas_corrientes.pdf');
      await file.writeAsBytes(bytes);
      pdfPath = file.path;
      return file.path;
    } on ApiException catch (e) {
      pdfError = e.message;
      return null;
    } catch (e) {
      pdfError = 'Error al descargar el PDF';
      return null;
    } finally {
      downloadingPdf = false;
      notifyListeners();
    }
  }
}
