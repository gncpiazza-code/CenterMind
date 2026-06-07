import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../../core/api/api_client.dart';
import '../../core/offline/upload_queue.dart';
import 'models/batch_upload_result.dart';
import 'models/pdv_candidate.dart';

/// Pasos del flujo de captura.
enum CaptureStep {
  gpsLoading,
  pdvSelection,
  manualInput,
  pdvConfirmed,
  photoCapture,
  typeSelection,
  reviewAndSubmit,
  uploading,
  success,
}

/// ChangeNotifier que gestiona el estado completo del flujo de captura.
class CaptureProvider extends ChangeNotifier {
  final ApiClient _api;
  final ShelfyDatabase _db;

  CaptureStep _currentStep = CaptureStep.gpsLoading;
  PdvCandidate? _selectedPdv;
  String? _manualNro;
  List<File> _photos = [];
  String? _selectedTipo;
  bool _isUploading = false;
  BatchUploadResult? _lastResult;
  String? _errorMessage;

  // Datos de ubicación actuales
  double? _currentLat;
  double? _currentLng;

  CaptureProvider({required ApiClient apiClient, required ShelfyDatabase db})
      : _api = apiClient,
        _db = db;

  // ── Getters ─────────────────────────────────────────────────────────────────

  CaptureStep get currentStep => _currentStep;
  PdvCandidate? get selectedPdv => _selectedPdv;
  String? get manualNro => _manualNro;
  List<File> get photos => List.unmodifiable(_photos);
  String? get selectedTipo => _selectedTipo;
  bool get isUploading => _isUploading;
  BatchUploadResult? get lastResult => _lastResult;
  String? get errorMessage => _errorMessage;
  double? get currentLat => _currentLat;
  double? get currentLng => _currentLng;

  /// Nombre visible del PDV seleccionado (manual o de la lista).
  String get nroCliente => _selectedPdv?.idClienteErp ?? _manualNro ?? '';

  String get pdvDisplayName =>
      _selectedPdv?.nombreDisplay ??
      (_manualNro != null ? 'NRO: $_manualNro' : '');

  // ── Acciones ─────────────────────────────────────────────────────────────────

  /// Llamar al inicio: actualiza la ubicación y va al paso de selección.
  void onGpsReady(double lat, double lng) {
    _currentLat = lat;
    _currentLng = lng;
    _currentStep = CaptureStep.pdvSelection;
    notifyListeners();
  }

  /// GPS falló o permisos denegados: ir directo a input manual.
  void onGpsFailed() {
    _currentStep = CaptureStep.manualInput;
    notifyListeners();
  }

  void selectPdv(PdvCandidate pdv) {
    _selectedPdv = pdv;
    _manualNro = null;
    _currentStep = CaptureStep.pdvConfirmed;
    notifyListeners();
  }

  void goToManualInput() {
    _currentStep = CaptureStep.manualInput;
    notifyListeners();
  }

  void confirmManualNro(String nro) {
    _manualNro = nro.trim();
    _selectedPdv = null;
    _currentStep = CaptureStep.pdvConfirmed;
    notifyListeners();
  }

  void goToPhotoCapture() {
    _currentStep = CaptureStep.photoCapture;
    notifyListeners();
  }

  void addPhoto(File file) {
    if (_photos.length >= 10) return;
    _photos = [..._photos, file];
    notifyListeners();
  }

  void removePhoto(int index) {
    if (index < 0 || index >= _photos.length) return;
    _photos = List.from(_photos)..removeAt(index);
    notifyListeners();
  }

  void goToTypeSelection() {
    _currentStep = CaptureStep.typeSelection;
    notifyListeners();
  }

  void selectTipo(String tipo) {
    _selectedTipo = tipo;
    _currentStep = CaptureStep.reviewAndSubmit;
    notifyListeners();
  }

  void goBackToPhotoCapture() {
    _currentStep = CaptureStep.photoCapture;
    notifyListeners();
  }

  /// Envía la captura: directo al backend si hay red; sino encola en SQLite.
  Future<void> submit() async {
    if (nroCliente.isEmpty || _selectedTipo == null || _photos.isEmpty) return;

    _isUploading = true;
    _errorMessage = null;
    _currentStep = CaptureStep.uploading;
    notifyListeners();

    try {
      final connectivity = await Connectivity().checkConnectivity();
      final hasNetwork = connectivity.any((r) => r != ConnectivityResult.none);

      if (hasNetwork) {
        await _submitDirect();
      } else {
        await _enqueueOffline();
        _lastResult = null;
        _currentStep = CaptureStep.success;
      }
    } catch (e) {
      _errorMessage = e.toString();
      _currentStep = CaptureStep.reviewAndSubmit;
    } finally {
      _isUploading = false;
      notifyListeners();
    }
  }

  Future<void> _submitDirect() async {
    final clientUploadId = const Uuid().v4();

    final fields = <String, String>{
      'nro_cliente': nroCliente,
      'tipo_pdv': _selectedTipo!,
      'client_upload_id': clientUploadId,
      if (_currentLat != null && _currentLng != null)
        'capture_lat_lng': jsonEncode({
          'lat': _currentLat,
          'lng': _currentLng,
        }),
    };

    final files = _photos
        .asMap()
        .entries
        .map((e) => MapEntry('foto_${e.key}', e.value))
        .toList();

    final responseJson = await _api.postMultipart(
      '/api/vendedor-app/exhibiciones/batch',
      fields: fields,
      files: files,
    );

    _lastResult = BatchUploadResult.fromJson(responseJson);
    _currentStep = CaptureStep.success;
  }

  Future<void> _enqueueOffline() async {
    final clientUploadId = const Uuid().v4();
    final pathsJson = jsonEncode(_photos.map((f) => f.path).toList());
    String? latLngJson;
    if (_currentLat != null && _currentLng != null) {
      latLngJson = jsonEncode({'lat': _currentLat, 'lng': _currentLng});
    }

    await _db.enqueueUpload(
      PendingUploadsCompanion.insert(
        clientUploadId: clientUploadId,
        nroCliente: nroCliente,
        tipoPdv: Value(_selectedTipo),
        photoLocalPaths: pathsJson,
        captureLatLng: Value(latLngJson),
        estado: const Value('enCola'),
      ),
    );
  }

  /// Reinicia el provider para una nueva captura.
  void reset() {
    _currentStep = CaptureStep.gpsLoading;
    _selectedPdv = null;
    _manualNro = null;
    _photos = [];
    _selectedTipo = null;
    _isUploading = false;
    _lastResult = null;
    _errorMessage = null;
    _currentLat = null;
    _currentLng = null;
    notifyListeners();
  }
}
