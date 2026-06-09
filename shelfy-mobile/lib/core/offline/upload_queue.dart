import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

// NOTE: El archivo .g.dart se genera con:
//   dart run build_runner build --delete-conflicting-outputs
// Este archivo contiene un stub manual hasta que build_runner se ejecute.
part 'upload_queue.g.dart';

/// Estado de una subida pendiente.
enum UploadEstado {
  enCola,
  subiendo,
  completado,
  fallido,
}

/// Tabla de uploads pendientes (cola offline de exhibiciones).
@DataClassName('PendingUpload')
class PendingUploads extends Table {
  /// ID interno auto-incremental.
  IntColumn get id => integer().autoIncrement()();

  /// UUID generado en el cliente para deduplicar en backend.
  TextColumn get clientUploadId => text().named('client_upload_id')();

  /// Código de cliente PDV.
  TextColumn get nroCliente => text().named('nro_cliente')();

  /// Tipo de PDV (ej: "kiosco", "supermercado").
  TextColumn get tipoPdv => text().named('tipo_pdv').nullable()();

  /// Paths locales de fotos (lista JSON).
  TextColumn get photoLocalPaths => text().named('photo_local_paths')();

  /// Coordenadas de captura como JSON "{lat, lng}" (nullable).
  TextColumn get captureLatLng => text().named('capture_lat_lng').nullable()();

  /// Estado de la subida.
  TextColumn get estado =>
      text().named('estado').withDefault(const Constant('enCola'))();

  /// Timestamp de creación local.
  DateTimeColumn get createdAt =>
      dateTime().named('created_at').withDefault(currentDateAndTime)();

  /// Cantidad de intentos de subida realizados.
  IntColumn get attemptCount =>
      integer().named('attempt_count').withDefault(const Constant(0))();

  /// Mensaje de error del último intento fallido (nullable).
  TextColumn get errorMessage => text().named('error_message').nullable()();

  /// ID del distribuidor que generó esta subida (scope de sesión).
  IntColumn get distId => integer().named('dist_id').nullable()();

  /// ID del vendedor que generó esta subida (scope de sesión).
  IntColumn get vendorId => integer().named('vendor_id').nullable()();
}

/// Abre la conexión SQLite en el directorio de documentos de la app.
LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'shelfy_queue.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}
