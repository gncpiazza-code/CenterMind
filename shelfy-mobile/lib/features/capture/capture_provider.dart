import 'dart:async';
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

/// Fases del overlay de captura — controlan el sheet, NO la ruta de navegación.
/// La cámara siempre está activa en Z0; el sheet cambia de contenido.
enum CaptureOverlayPhase {
  live,       // Sin fotos aún — hint GPS · "Apuntá y capturá"
  postPhoto,  // Tras 1ª foto — chips PDV cercanos o campo búsqueda
  confirmPdv, // PDV elegido — resumen + "Otra foto"
  ingreso,    // PDV confirmado — con/sin ingreso
  uploading,  // Subiendo — barra progreso (cámara atenuada, no oculta)
  done,       // OK / cola — banner éxito · sheet colapsa → live
}

/// ChangeNotifier que gestiona el estado completo del flujo de captura.
class CaptureProvider extends ChangeNotifier {
  final ApiClient _api;
  final ShelfyDatabase _db;

  CaptureOverlayPhase _phase = CaptureOverlayPhase.live;
  PdvCandidate? _selectedPdv;
  bool _addingExtraPhoto = false;

  /// Lista de PDVs cercanos (radio 100 m).
  List<PdvCandidate> _nearbyPdvs = [];

  /// Resultados de búsqueda por texto.
  List<PdvCandidate> _searchResults = [];
  bool _searchLoading = false;
  Timer? _searchDebounce;

  String? _manualNro;
  List<CapturePhoto> _photos = [];

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

  // ── Getters ──────────────────────────────────────────────────────────────────
  CaptureOverlayPhase get phase => _phase;
  PdvCandidate? get selectedPdv => _selectedPdv;
  List<PdvCandidate> get nearbyPdvs => List.unmodifiable(_nearbyPdvs);
  List<PdvCandidate> get searchResults => List.unmodifiable(_searchResults);
  bool get searchLoading => _searchLoading;

  List<CapturePhoto> get photos => List.unmodifiable(_photos);
  List<File> get photoFiles => _photos.map((p) => p.file).toList();
  int get photoCount => _photos.length;
  bool get hasPhotos => _photos.isNotEmpty;
  bool get canAddMorePhotos => _photos.length < kMaxPhotosPerExhibicion;

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
      _selectedPdv?.nombreDisplay.isNotEmpty == true
          ? _selectedPdv!.nombreDisplay
          : (_manualNro != null ? 'NRO: $_manualNro' : '');

  // ── GPS / PDVs cercanos ────────────────────────────────────────────────────

  Future<void> refreshNearbyPdvs({required double lat, required double lng}) async {
    _currentLat = lat;
    _currentLng = lng;
    _nearbyLoading = true;
    notifyListeners();

    try {
      final list = await _api.getList(
        '/api/vendedor-app/pdv/cercanos?lat=$lat&lng=$lng&radio=100',
      );
      _nearbyPdvs = list
          .cast<Map<String, dynamic>>()
          .map(PdvCandidate.fromJson)
          .toList();
    } catch (_) {
      _nearbyPdvs = [];
    } finally {
      _nearbyLoading = false;
      notifyListeners();
    }
  }

  void onGpsUnavailable() {
    _nearbyPdvs = [];
    notifyListeners();
  }

  // ── Búsqueda por texto (debounce 300 ms) ──────────────────────────────────

  void searchPdv(String query) {
    _searchDebounce?.cancel();
    final q = query.trim();
    if (q.isEmpty) {
      _searchResults = [];
      _searchLoading = false;
      notifyListeners();
      return;
    }
    _searchLoading = true;
    notifyListeners();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final list = await _api.getList(
          '/api/vendedor-app/pdv/buscar?q=${Uri.encodeQueryComponent(q)}&limit=8',
        );
        _searchResults = list
            .cast<Map<String, dynamic>>()
            .map(PdvCandidate.fromJson)
            .toList();
      } catch (_) {
        _searchResults = [];
      } finally {
        _searchLoading = false;
        notifyListeners();
      }
    });
  }

  void clearSearch() {
    _searchDebounce?.cancel();
    _searchResults = [];
    _searchLoading = false;
    notifyListeners();
  }

  // ── Eventos de foto ────────────────────────────────────────────────────────

  /// Colapsa el sheet para que el vendedor pueda tomar otra foto manteniendo el PDV.
  void addExtraPhoto() {
    _addingExtraPhoto = true;
    _phase = CaptureOverlayPhase.live;
    notifyListeners();
  }

  void onPhotoTaken(File file, CapturePhotoMetadata metadata) {
    final photo = CapturePhoto(file: file, metadata: metadata);

    if (_addingExtraPhoto && hasPhotos) {
      _addingExtraPhoto = false;
      if (_photos.length >= kMaxPhotosPerExhibicion) return;
      _photos = [..._photos, photo];
      _phase = CaptureOverlayPhase.confirmPdv;
      notifyListeners();
      return;
    }

    // Primera foto de la sesión
    _addingExtraPhoto = false;
    _photos = [photo];
    _selectedPdv = null;
    _manualNro = null;
    _selectedTipo = null;
    _errorMessage = null;
    _phase = CaptureOverlayPhase.postPhoto;
    notifyListeners();
  }

  void removePhoto(int index) {
    if (index < 0 || index >= _photos.length) return;
    final updated = List<CapturePhoto>.from(_photos);
    updated.removeAt(index);
    _photos = updated;
    if (_photos.isEmpty) {
      _phase = CaptureOverlayPhase.live;
    }
    notifyListeners();
  }

  // ── Selección de PDV ──────────────────────────────────────────────────────

  void selectPdv(PdvCandidate pdv) {
    _selectedPdv = pdv;
    _manualNro = null;
    _phase = CaptureOverlayPhase.confirmPdv;
    clearSearch();
    notifyListeners();
  }

  void confirmManualNro(String nro) {
    _manualNro = nro.trim();
    _selectedPdv = null;
    _phase = CaptureOverlayPhase.ingreso;
    clearSearch();
    notifyListeners();
  }

  void confirmPdv() {
    _phase = CaptureOverlayPhase.ingreso;
    notifyListeners();
  }

  void backToPostPhoto() {
    _selectedPdv = null;
    _manualNro = null;
    _phase = CaptureOverlayPhase.postPhoto;
    clearSearch();
    notifyListeners();
  }

  void selectIngreso({required bool conIngreso}) {
    _selectedTipo = conIngreso ? 'Comercio con Ingreso' : 'Comercio sin Ingreso';
    submit();
  }

  void backToCamera() {
    _photos = [];
    _selectedPdv = null;
    _manualNro = null;
    _selectedTipo = null;
    _errorMessage = null;
    _addingExtraPhoto = false;
    _phase = CaptureOverlayPhase.live;
    clearSearch();
    notifyListeners();
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

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
    _phase = CaptureOverlayPhase.uploading;
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
        _phase = CaptureOverlayPhase.done;
      }
    } catch (e) {
      _errorMessage = e is ApiException ? e.message : e.toString();
      _phase = CaptureOverlayPhase.ingreso;
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
        statusCode: 422,
        message:
            'El servidor no registró las fotos. Verificá la conexión e intentá de nuevo.',
      );
    }

    _fetchPostUploadSummary(nroCliente);
    _phase = CaptureOverlayPhase.done;
    onUploadSuccess?.call(nroCliente);
  }

  Future<void> _fetchPostUploadSummary(String nroCliente) async {
    try {
      final json = await _api.get('/api/vendedor-app/post-upload/$nroCliente');
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
    _phase = CaptureOverlayPhase.live;
    _selectedPdv = null;
    _manualNro = null;
    _photos = [];
    _selectedTipo = null;
    _isUploading = false;
    _addingExtraPhoto = false;
    _lastResult = null;
    _postUploadSummary = null;
    _errorMessage = null;
    _searchResults = [];
    _searchLoading = false;
    _searchDebounce?.cancel();
    notifyListeners();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }

  // ── Metadatos GPS al disparar ──────────────────────────────────────────────

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
