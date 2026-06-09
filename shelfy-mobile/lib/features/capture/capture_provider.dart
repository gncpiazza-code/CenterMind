import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:uuid/uuid.dart';

import '../../core/api/api_client.dart';
import '../../core/offline/upload_queue.dart';
import 'models/batch_upload_result.dart';
import 'models/capture_photo.dart';
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

  /// Fotos capturadas solo desde cámara in-app (con metadatos).
  List<CapturePhoto> _photos = [];

  /// Si true, al tomar foto se agrega a la sesión sin reiniciar flujo PDV.
  bool _appendingPhoto = false;

  String? _selectedTipo;
  bool _isUploading = false;
  bool _nearbyLoading = false;
  BatchUploadResult? _lastResult;
  PostUploadSummary? _postUploadSummary;
  String? _errorMessage;

  double? _currentLat;
  double? _currentLng;

  /// Notifica al shell (ej. refrescar galería) tras upload online exitoso.
  void Function(String nroCliente)? onUploadSuccess;

  CaptureProvider({required ApiClient apiClient, required ShelfyDatabase db})
      : _api = apiClient,
        _db = db;

  CaptureStep get currentStep => _currentStep;
  PdvCandidate? get selectedPdv => _selectedPdv;
  PdvCandidate? get detectedPdv => _detectedPdv;
  String? get manualNro => _manualNro;
  bool get appendingPhoto => _appendingPhoto;

  List<CapturePhoto> get photos => List.unmodifiable(_photos);

  List<File> get photoFiles => _photos.map((p) => p.file).toList();

  int get photoCount => _photos.length;

  bool get canAddMorePhotos =>
      _photos.length < kMaxPhotosPerExhibicion &&
      _currentStep != CaptureStep.camera &&
      _currentStep != CaptureStep.uploading &&
      _currentStep != CaptureStep.success;

  bool get hasPhotos => _photos.isNotEmpty;

  String? get selectedTipo => _selectedTipo;
  bool get isUploading => _isUploading;
  bool get nearbyLoading => _nearbyLoading;
  BatchUploadResult? get lastResult => _lastResult;
  PostUploadSummary? get postUploadSummary => _postUploadSummary;
  String? get errorMessage => _errorMessage;
  double? get currentLat => _currentLat;
  double? get currentLng => _currentLng;

  String get nroCliente {
    final raw = _selectedPdv?.idClienteErp ?? _manualNro ?? '';
    return raw.trim();
  }

  String get pdvDisplayName =>
      _selectedPdv?.nombreDisplay ??
      _detectedPdv?.nombreDisplay ??
      (_manualNro != null ? 'NRO: $_manualNro' : '');

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

  /// Registra foto tomada desde cámara in-app con metadatos de auditoría.
  void onPhotoTaken(File file, CapturePhotoMetadata metadata) {
    final photo = CapturePhoto(file: file, metadata: metadata);

    if (_appendingPhoto) {
      if (_photos.length >= kMaxPhotosPerExhibicion) return;
      _photos = [..._photos, photo];
      _appendingPhoto = false;
      _currentStep = CaptureStep.ingresoChoice;
      if (_selectedPdv != null || (_manualNro != null && _manualNro!.isNotEmpty)) {
        _currentStep = CaptureStep.ingresoChoice;
      } else if (_detectedPdv != null) {
        _currentStep = CaptureStep.pdvConfirm;
      } else {
        _currentStep = CaptureStep.manualInput;
      }
      notifyListeners();
      return;
    }

    _photos = [photo];
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

  /// Abre cámara para agregar otra foto (sin galería).
  void startAppendPhoto() {
    if (!canAddMorePhotos) return;
    _appendingPhoto = true;
    _currentStep = CaptureStep.camera;
    notifyListeners();
  }

  void removePhoto(int index) {
    if (index < 0 || index >= _photos.length) return;
    final updated = List<CapturePhoto>.from(_photos);
    updated.removeAt(index);
    _photos = updated;
    if (_photos.isEmpty) {
      _appendingPhoto = false;
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
    _appendingPhoto = false;
    _currentStep = CaptureStep.camera;
    notifyListeners();
  }

  CaptureSessionMetadata _buildSessionMetadata() {
    return CaptureSessionMetadata(
      sessionLat: _currentLat,
      sessionLng: _currentLng,
      photos: _photos.map((p) => p.metadata).toList(),
    );
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
    final metadata = _buildSessionMetadata();

    final fields = <String, String>{
      'nro_cliente': nroCliente,
      'tipo_pdv': _selectedTipo!,
      'client_upload_id': clientUploadId,
      'capture_metadata': metadata.toJsonString(),
      if (_currentLat != null) 'capture_lat': _currentLat!.toString(),
      if (_currentLng != null) 'capture_lng': _currentLng!.toString(),
    };

    final responseJson = await _api.postMultipart(
      '/api/vendedor-app/exhibiciones/batch-multipart',
      fields: fields,
      files: photoFiles,
    );

    _lastResult = BatchUploadResult.fromJson(responseJson);

    if (_lastResult!.exhibicionIds.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message:
            'El servidor no registró las fotos. Verificá la conexión e intentá de nuevo.',
      );
    }

    _fetchPostUploadSummary(nroCliente);
    _currentStep = CaptureStep.success;
    onUploadSuccess?.call(nroCliente);
  }

  Future<void> _fetchPostUploadSummary(String nroCliente) async {
    try {
      final json = await _api.get(
        '/api/vendedor-app/post-upload/$nroCliente',
      );
      _postUploadSummary = PostUploadSummary.fromJson(json);
      notifyListeners();
    } catch (_) {
      _postUploadSummary = null;
    }
  }

  Future<void> _enqueueOffline() async {
    final clientUploadId = const Uuid().v4();
    final pathsJson = jsonEncode(_photos.map((p) => p.file.path).toList());
    final metadataJson = _buildSessionMetadata().toJsonString();

    await _db.enqueueUpload(
      PendingUploadsCompanion.insert(
        clientUploadId: clientUploadId,
        nroCliente: nroCliente,
        tipoPdv: Value(_selectedTipo),
        photoLocalPaths: pathsJson,
        captureLatLng: Value(metadataJson),
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
    _appendingPhoto = false;
    notifyListeners();
  }

  /// Metadatos GPS al instante de disparar la cámara.
  static Future<CapturePhotoMetadata> captureMetadataNow() async {
    final capturedAt = DateTime.now().toUtc();
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
      return CapturePhotoMetadata(
        capturedAtUtc: capturedAt,
        lat: position.latitude,
        lng: position.longitude,
        accuracyM: position.accuracy,
        altitudeM: position.altitude,
        heading: position.heading,
        speedMps: position.speed,
      );
    } catch (_) {
      return CapturePhotoMetadata(capturedAtUtc: capturedAt);
    }
  }
}
