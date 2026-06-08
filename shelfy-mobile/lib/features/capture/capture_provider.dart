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
import 'models/post_upload_summary.dart';

/// Máximo de fotos permitidas por exhibición.
const int kMaxPhotosPerExhibicion = 6;

/// Pasos del flujo de captura (cámara primero, PDV después de la foto).
enum CaptureStep {
  camera,
  pdvConfirm,
  manualInput,
  ingresoChoice,
  uploading,
  success,
}

/// ChangeNotifier que gestiona el estado completo del flujo de captura.
class CaptureProvider extends ChangeNotifier {
  final ApiClient _api;
  final ShelfyDatabase _db;

  CaptureStep _currentStep = CaptureStep.camera;
  PdvCandidate? _selectedPdv;
  PdvCandidate? _detectedPdv;
  String? _manualNro;

  /// Lista de fotos capturadas en la sesión actual (máximo [kMaxPhotosPerExhibicion]).
  List<File> _photos = [];

  String? _selectedTipo;
  bool _isUploading = false;
  bool _nearbyLoading = false;
  BatchUploadResult? _lastResult;
  PostUploadSummary? _postUploadSummary;
  String? _errorMessage;

  double? _currentLat;
  double? _currentLng;

  CaptureProvider({required ApiClient apiClient, required ShelfyDatabase db})
      : _api = apiClient,
        _db = db;

  CaptureStep get currentStep => _currentStep;
  PdvCandidate? get selectedPdv => _selectedPdv;
  PdvCandidate? get detectedPdv => _detectedPdv;
  String? get manualNro => _manualNro;

  /// Lista inmutable de fotos capturadas.
  List<File> get photos => List.unmodifiable(_photos);

  /// Número de fotos actualmente capturadas.
  int get photoCount => _photos.length;

  /// Si se puede agregar otra foto (no se ha llegado al límite).
  bool get canAddMorePhotos => _photos.length < kMaxPhotosPerExhibicion;

  /// Si hay al menos 1 foto (requisito mínimo para subir).
  bool get hasPhotos => _photos.isNotEmpty;

  String? get selectedTipo => _selectedTipo;
  bool get isUploading => _isUploading;
  bool get nearbyLoading => _nearbyLoading;
  BatchUploadResult? get lastResult => _lastResult;
  PostUploadSummary? get postUploadSummary => _postUploadSummary;
  String? get errorMessage => _errorMessage;
  double? get currentLat => _currentLat;
  double? get currentLng => _currentLng;

  String get nroCliente => _selectedPdv?.idClienteErp ?? _manualNro ?? '';

  String get pdvDisplayName =>
      _selectedPdv?.nombreDisplay ??
      _detectedPdv?.nombreDisplay ??
      (_manualNro != null ? 'NRO: $_manualNro' : '');

  /// Actualiza GPS y busca PDV cercano en segundo plano (sin bloquear cámara).
  Future<void> refreshNearbyPdvs({required double lat, required double lng}) async {
    _currentLat = lat;
    _currentLng = lng;
    _nearbyLoading = true;
    notifyListeners();

    try {
      final list = await _api.getList(
        '/api/vendedor-app/pdv/cercanos?lat=$lat&lng=$lng&radio=150',
      );
      final candidates = list
          .cast<Map<String, dynamic>>()
          .map(PdvCandidate.fromJson)
          .toList();
      _detectedPdv = candidates.isNotEmpty ? candidates.first : null;
    } catch (_) {
      _detectedPdv = null;
    } finally {
      _nearbyLoading = false;
      notifyListeners();
    }
  }

  void onGpsUnavailable() {
    _detectedPdv = null;
    notifyListeners();
  }

  /// Primera foto tomada: inicia el flujo hacia confirmación de PDV.
  /// Las fotos adicionales se agregan con [addPhoto].
  void onPhotoTaken(File file) {
    _photos = [file];
    _selectedPdv = null;
    _manualNro = null;
    _selectedTipo = null;
    _errorMessage = null;

    if (_detectedPdv != null) {
      _currentStep = CaptureStep.pdvConfirm;
    } else {
      _currentStep = CaptureStep.manualInput;
    }
    notifyListeners();
  }

  /// Agrega una foto adicional a la exhibición actual (máx. [kMaxPhotosPerExhibicion]).
  /// Solo disponible en los pasos pdvConfirm, manualInput e ingresoChoice.
  void addPhoto(File file) {
    if (_photos.length >= kMaxPhotosPerExhibicion) return;
    _photos = [..._photos, file];
    notifyListeners();
  }

  /// Elimina la foto en la posición [index] de la lista.
  void removePhoto(int index) {
    if (index < 0 || index >= _photos.length) return;
    final updated = List<File>.from(_photos);
    updated.removeAt(index);
    _photos = updated;
    // Si se eliminaron todas las fotos, volver a cámara.
    if (_photos.isEmpty) {
      _currentStep = CaptureStep.camera;
    }
    notifyListeners();
  }

  void confirmDetectedPdv() {
    final pdv = _detectedPdv;
    if (pdv == null) {
      _currentStep = CaptureStep.manualInput;
    } else {
      _selectedPdv = pdv;
      _manualNro = null;
      _currentStep = CaptureStep.ingresoChoice;
    }
    notifyListeners();
  }

  void rejectDetectedPdv() {
    _selectedPdv = null;
    _manualNro = null;
    _currentStep = CaptureStep.manualInput;
    notifyListeners();
  }

  void confirmManualNro(String nro) {
    _manualNro = nro.trim();
    _selectedPdv = null;
    _currentStep = CaptureStep.ingresoChoice;
    notifyListeners();
  }

  void selectIngreso({required bool conIngreso}) {
    _selectedTipo =
        conIngreso ? 'Comercio con Ingreso' : 'Comercio sin Ingreso';
    submit();
  }

  void backToCamera() {
    _photos = [];
    _selectedPdv = null;
    _manualNro = null;
    _selectedTipo = null;
    _errorMessage = null;
    _currentStep = CaptureStep.camera;
    notifyListeners();
  }

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
        _postUploadSummary = null;
        _currentStep = CaptureStep.success;
      }
    } catch (e) {
      _errorMessage = e is ApiException ? e.message : e.toString();
      _currentStep = CaptureStep.ingresoChoice;
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
      if (_currentLat != null) 'capture_lat': _currentLat!.toString(),
      if (_currentLng != null) 'capture_lng': _currentLng!.toString(),
    };

    // Envía todas las fotos como multipart photos[] (backend ya lo soporta).
    final responseJson = await _api.postMultipart(
      '/api/vendedor-app/exhibiciones/batch-multipart',
      fields: fields,
      files: _photos,
    );

    _lastResult = BatchUploadResult.fromJson(responseJson);

    // Carga el resumen post-upload enriquecido en background (no bloquea).
    _fetchPostUploadSummary(nroCliente);

    _currentStep = CaptureStep.success;
  }

  /// Llama al endpoint de resumen post-upload y actualiza el estado.
  /// Se ejecuta en background tras el upload exitoso; silencia errores.
  Future<void> _fetchPostUploadSummary(String nroCliente) async {
    try {
      final json = await _api.get(
        '/api/vendedor-app/post-upload/$nroCliente',
      );
      _postUploadSummary = PostUploadSummary.fromJson(json);
      notifyListeners();
    } catch (_) {
      // Silenciar errores: la pantalla de éxito se muestra igualmente
      // con los datos básicos del BatchUploadResult.
      _postUploadSummary = null;
    }
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

  void reset() {
    _currentStep = CaptureStep.camera;
    _selectedPdv = null;
    _manualNro = null;
    _photos = [];
    _selectedTipo = null;
    _isUploading = false;
    _lastResult = null;
    _postUploadSummary = null;
    _errorMessage = null;
    notifyListeners();
  }
}
