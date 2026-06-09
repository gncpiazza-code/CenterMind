// ignore_for_file: prefer_initializing_formals
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../api/api_client.dart';
import 'upload_queue.dart';

/// Worker que sincroniza la cola offline cuando hay conectividad.
class SyncWorker {
  final ShelfyDatabase _db;
  final ApiClient _api;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  bool _isSyncing = false;

  SyncWorker({required ShelfyDatabase db, required ApiClient api})
      : _db = db,
        _api = api;

  /// Stream con el conteo de items pendientes (enCola + subiendo).
  Stream<int> get pendingCount => _db.watchPendingCount();

  /// Inicia la escucha de cambios de conectividad.
  void start() {
    _connectivitySub = Connectivity()
        .onConnectivityChanged
        .listen((List<ConnectivityResult> results) {
      final hasNetwork = results.any((r) => r != ConnectivityResult.none);
      if (hasNetwork) {
        syncNow();
      }
    });
  }

  /// Detiene el worker y cancela suscripciones.
  void stop() {
    _connectivitySub?.cancel();
    _connectivitySub = null;
  }

  /// Ejecuta un ciclo de sincronización inmediato (FIFO).
  Future<void> syncNow() async {
    if (_isSyncing) return;
    _isSyncing = true;
    try {
      final pending = await _db.getPendingUploads();
      for (final upload in pending) {
        await _processUpload(upload);
      }
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> _processUpload(PendingUpload upload) async {
    // Máximo 5 intentos antes de marcar como fallido permanente.
    if (upload.attemptCount >= 5) {
      await _db.updateEstado(upload.id, UploadEstado.fallido);
      return;
    }

    await _db.updateEstado(upload.id, UploadEstado.subiendo);
    await _db.incrementAttemptCount(upload.id);

    try {
      final paths = (jsonDecode(upload.photoLocalPaths) as List)
          .cast<String>();

      // Subir fotos y metadatos al endpoint batch
      final fields = <String, String>{
        'nro_cliente': upload.nroCliente,
        'client_upload_id': upload.clientUploadId,
        if (upload.tipoPdv != null) 'tipo_pdv': upload.tipoPdv!,
      };

      if (upload.captureLatLng != null) {
        try {
          final meta = jsonDecode(upload.captureLatLng!) as Map<String, dynamic>;
          fields['capture_metadata'] = upload.captureLatLng!;
          final lat = meta['session_lat'] ?? meta['lat'];
          final lng = meta['session_lng'] ?? meta['lng'];
          if (lat != null) fields['capture_lat'] = lat.toString();
          if (lng != null) fields['capture_lng'] = lng.toString();
        } catch (_) {}
      }

      final files = paths.map((p) => File(p)).toList();

      await _api.postMultipart(
        '/api/vendedor-app/exhibiciones/batch-multipart',
        fields: fields,
        files: files,
      );

      // Éxito: limpiar de la cola
      await _db.updateEstado(upload.id, UploadEstado.completado);
      await _db.deleteUpload(upload.id);
    } on ApiException catch (e) {
      await _db.updateErrorMessage(upload.id, e.message);
      // Reintentar si no superó el máximo de intentos (ya incrementado)
      final updated = await _db.getPendingUploads();
      final row = updated.where((r) => r.id == upload.id).firstOrNull;
      if (row != null && row.attemptCount >= 5) {
        await _db.updateEstado(upload.id, UploadEstado.fallido);
      } else {
        await _db.updateEstado(upload.id, UploadEstado.enCola);
      }
    } catch (e) {
      await _db.updateErrorMessage(upload.id, e.toString());
      await _db.updateEstado(upload.id, UploadEstado.enCola);
    }
  }
}
