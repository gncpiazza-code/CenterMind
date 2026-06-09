// GENERATED CODE - DO NOT MODIFY BY HAND
//
// Placeholder manual hasta ejecutar:
//   dart run build_runner build --delete-conflicting-outputs
//
// ignore_for_file: type=lint, unused_field
part of 'upload_queue.dart';

// ──────────────────────────────────────────────────────────────────────────────
// _$ShelfyDatabase mixin (stub)
// ──────────────────────────────────────────────────────────────────────────────

mixin _$ShelfyDatabase on GeneratedDatabase {
  $PendingUploadsTable get pendingUploads => _pendingUploads;
  late final $PendingUploadsTable _pendingUploads =
      $PendingUploadsTable(this);

  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();

  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [_pendingUploads];
}

// ──────────────────────────────────────────────────────────────────────────────
// ShelfyDatabase — BD principal con métodos de negocio
// ──────────────────────────────────────────────────────────────────────────────

@DriftDatabase(tables: [PendingUploads])
class ShelfyDatabase extends GeneratedDatabase with _$ShelfyDatabase {
  ShelfyDatabase() : super(_openConnection());

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) => m.createAll(),
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        await m.addColumn(pendingUploads, pendingUploads.distId);
        await m.addColumn(pendingUploads, pendingUploads.vendorId);
      }
    },
  );

  /// Agrega un nuevo upload a la cola.
  Future<int> enqueueUpload(PendingUploadsCompanion entry) =>
      into(pendingUploads).insert(entry);

  /// Obtiene todos los uploads en estado [enCola] o [fallido].
  Future<List<PendingUpload>> getPendingUploads() {
    return (select(pendingUploads)
          ..where(
            (t) => t.estado.isIn([
              UploadEstado.enCola.name,
              UploadEstado.fallido.name,
            ]),
          ))
        .get();
  }

  /// Actualiza el estado de un upload.
  Future<void> updateEstado(int uploadId, UploadEstado estado) async {
    await (update(pendingUploads)..where((t) => t.id.equals(uploadId))).write(
      PendingUploadsCompanion(estado: Value(estado.name)),
    );
  }

  /// Incrementa el contador de intentos.
  Future<void> incrementAttemptCount(int uploadId) async {
    final row = await (select(pendingUploads)
          ..where((t) => t.id.equals(uploadId)))
        .getSingleOrNull();
    if (row == null) return;
    await (update(pendingUploads)..where((t) => t.id.equals(uploadId))).write(
      PendingUploadsCompanion(
        attemptCount: Value(row.attemptCount + 1),
      ),
    );
  }

  /// Elimina todos los uploads de otros vendedores (purge al cambiar sesión).
  Future<void> purgeOtherVendors(int distId, int vendorId) async {
    await (delete(pendingUploads)
          ..where(
            (t) =>
                t.distId.isNotNull() &
                (t.distId.equals(distId).not() | t.vendorId.equals(vendorId).not()),
          ))
        .go();
  }

  /// Elimina un upload completado de la cola.
  Future<void> deleteUpload(int uploadId) async {
    await (delete(pendingUploads)..where((t) => t.id.equals(uploadId))).go();
  }

  /// Registra un error en un upload fallido.
  Future<void> updateErrorMessage(int uploadId, String? message) async {
    await (update(pendingUploads)..where((t) => t.id.equals(uploadId))).write(
      PendingUploadsCompanion(errorMessage: Value(message)),
    );
  }

  /// Retorna un Stream con el conteo de items pendientes (queued+uploading).
  Stream<int> watchPendingCount() {
    return (select(pendingUploads)
          ..where(
            (t) => t.estado.isIn([
              UploadEstado.enCola.name,
              UploadEstado.subiendo.name,
            ]),
          ))
        .watch()
        .map((rows) => rows.length);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// $PendingUploadsTable
// ──────────────────────────────────────────────────────────────────────────────

class $PendingUploadsTable extends PendingUploads
    with TableInfo<$PendingUploadsTable, PendingUpload> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;

  $PendingUploadsTable(this.attachedDatabase, [this._alias]);

  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id', aliasedName, false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints:
        GeneratedColumn.constraintIsAlways('PRIMARY KEY AUTOINCREMENT'),
  );

  @override
  late final GeneratedColumn<String> clientUploadId = GeneratedColumn<String>(
    'client_upload_id', aliasedName, false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );

  @override
  late final GeneratedColumn<String> nroCliente = GeneratedColumn<String>(
    'nro_cliente', aliasedName, false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );

  @override
  late final GeneratedColumn<String> tipoPdv = GeneratedColumn<String>(
    'tipo_pdv', aliasedName, true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );

  @override
  late final GeneratedColumn<String> photoLocalPaths = GeneratedColumn<String>(
    'photo_local_paths', aliasedName, false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );

  @override
  late final GeneratedColumn<String> captureLatLng = GeneratedColumn<String>(
    'capture_lat_lng', aliasedName, true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );

  @override
  late final GeneratedColumn<String> estado = GeneratedColumn<String>(
    'estado', aliasedName, false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('enCola'),
  );

  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at', aliasedName, false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
    defaultValue: currentDateAndTime,
  );

  @override
  late final GeneratedColumn<int> attemptCount = GeneratedColumn<int>(
    'attempt_count', aliasedName, false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );

  @override
  late final GeneratedColumn<String> errorMessage = GeneratedColumn<String>(
    'error_message', aliasedName, true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );

  @override
  late final GeneratedColumn<int> distId = GeneratedColumn<int>(
    'dist_id', aliasedName, true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );

  @override
  late final GeneratedColumn<int> vendorId = GeneratedColumn<int>(
    'vendor_id', aliasedName, true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );

  @override
  List<GeneratedColumn> get $columns => [
        id,
        clientUploadId,
        nroCliente,
        tipoPdv,
        photoLocalPaths,
        captureLatLng,
        estado,
        createdAt,
        attemptCount,
        errorMessage,
        distId,
        vendorId,
      ];

  @override
  String get aliasedName => _alias ?? actualTableName;

  @override
  String get actualTableName => $name;

  static const String $name = 'pending_uploads';

  @override
  VerificationContext validateIntegrity(
    Insertable<PendingUpload> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('client_upload_id')) {
      context.handle(
        const VerificationMeta('clientUploadId'),
        clientUploadId.isAcceptableOrUnknown(
          data['client_upload_id']!,
          const VerificationMeta('clientUploadId'),
        ),
      );
    } else if (isInserting) {
      context.missing(const VerificationMeta('clientUploadId'));
    }
    if (data.containsKey('nro_cliente')) {
      context.handle(
        const VerificationMeta('nroCliente'),
        nroCliente.isAcceptableOrUnknown(
          data['nro_cliente']!,
          const VerificationMeta('nroCliente'),
        ),
      );
    } else if (isInserting) {
      context.missing(const VerificationMeta('nroCliente'));
    }
    if (data.containsKey('photo_local_paths')) {
      context.handle(
        const VerificationMeta('photoLocalPaths'),
        photoLocalPaths.isAcceptableOrUnknown(
          data['photo_local_paths']!,
          const VerificationMeta('photoLocalPaths'),
        ),
      );
    } else if (isInserting) {
      context.missing(const VerificationMeta('photoLocalPaths'));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};

  @override
  PendingUpload map(Map<String, dynamic> data, {String? tablePrefix}) {
    final prefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PendingUpload(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${prefix}id'])!,
      clientUploadId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${prefix}client_upload_id'])!,
      nroCliente: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${prefix}nro_cliente'])!,
      tipoPdv: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${prefix}tipo_pdv']),
      photoLocalPaths: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${prefix}photo_local_paths'])!,
      captureLatLng: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${prefix}capture_lat_lng']),
      estado: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${prefix}estado'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${prefix}created_at'])!,
      attemptCount: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${prefix}attempt_count'])!,
      errorMessage: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${prefix}error_message']),
      distId: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${prefix}dist_id']),
      vendorId: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${prefix}vendor_id']),
    );
  }

  @override
  $PendingUploadsTable createAlias(String alias) =>
      $PendingUploadsTable(attachedDatabase, alias);
}

// ──────────────────────────────────────────────────────────────────────────────
// PendingUpload DataClass
// ──────────────────────────────────────────────────────────────────────────────

class PendingUpload extends DataClass implements Insertable<PendingUpload> {
  final int id;
  final String clientUploadId;
  final String nroCliente;
  final String? tipoPdv;
  final String photoLocalPaths;
  final String? captureLatLng;
  final String estado;
  final DateTime createdAt;
  final int attemptCount;
  final String? errorMessage;
  final int? distId;
  final int? vendorId;

  const PendingUpload({
    required this.id,
    required this.clientUploadId,
    required this.nroCliente,
    this.tipoPdv,
    required this.photoLocalPaths,
    this.captureLatLng,
    required this.estado,
    required this.createdAt,
    required this.attemptCount,
    this.errorMessage,
    this.distId,
    this.vendorId,
  });

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['client_upload_id'] = Variable<String>(clientUploadId);
    map['nro_cliente'] = Variable<String>(nroCliente);
    if (!nullToAbsent || tipoPdv != null) {
      map['tipo_pdv'] = Variable<String>(tipoPdv);
    }
    map['photo_local_paths'] = Variable<String>(photoLocalPaths);
    if (!nullToAbsent || captureLatLng != null) {
      map['capture_lat_lng'] = Variable<String>(captureLatLng);
    }
    map['estado'] = Variable<String>(estado);
    map['created_at'] = Variable<DateTime>(createdAt);
    map['attempt_count'] = Variable<int>(attemptCount);
    if (!nullToAbsent || errorMessage != null) {
      map['error_message'] = Variable<String>(errorMessage);
    }
    if (!nullToAbsent || distId != null) {
      map['dist_id'] = Variable<int>(distId);
    }
    if (!nullToAbsent || vendorId != null) {
      map['vendor_id'] = Variable<int>(vendorId);
    }
    return map;
  }

  PendingUploadsCompanion toCompanion(bool nullToAbsent) {
    return PendingUploadsCompanion(
      id: Value(id),
      clientUploadId: Value(clientUploadId),
      nroCliente: Value(nroCliente),
      tipoPdv: tipoPdv == null && nullToAbsent
          ? const Value.absent()
          : Value(tipoPdv),
      photoLocalPaths: Value(photoLocalPaths),
      captureLatLng: captureLatLng == null && nullToAbsent
          ? const Value.absent()
          : Value(captureLatLng),
      estado: Value(estado),
      createdAt: Value(createdAt),
      attemptCount: Value(attemptCount),
      errorMessage: errorMessage == null && nullToAbsent
          ? const Value.absent()
          : Value(errorMessage),
      distId: distId == null && nullToAbsent ? const Value.absent() : Value(distId),
      vendorId: vendorId == null && nullToAbsent ? const Value.absent() : Value(vendorId),
    );
  }

  factory PendingUpload.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PendingUpload(
      id: serializer.fromJson<int>(json['id']),
      clientUploadId: serializer.fromJson<String>(json['client_upload_id']),
      nroCliente: serializer.fromJson<String>(json['nro_cliente']),
      tipoPdv: serializer.fromJson<String?>(json['tipo_pdv']),
      photoLocalPaths: serializer.fromJson<String>(json['photo_local_paths']),
      captureLatLng: serializer.fromJson<String?>(json['capture_lat_lng']),
      estado: serializer.fromJson<String>(json['estado']),
      createdAt: serializer.fromJson<DateTime>(json['created_at']),
      attemptCount: serializer.fromJson<int>(json['attempt_count']),
      errorMessage: serializer.fromJson<String?>(json['error_message']),
      distId: serializer.fromJson<int?>(json['dist_id']),
      vendorId: serializer.fromJson<int?>(json['vendor_id']),
    );
  }

  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'client_upload_id': serializer.toJson<String>(clientUploadId),
      'nro_cliente': serializer.toJson<String>(nroCliente),
      'tipo_pdv': serializer.toJson<String?>(tipoPdv),
      'photo_local_paths': serializer.toJson<String>(photoLocalPaths),
      'capture_lat_lng': serializer.toJson<String?>(captureLatLng),
      'estado': serializer.toJson<String>(estado),
      'created_at': serializer.toJson<DateTime>(createdAt),
      'attempt_count': serializer.toJson<int>(attemptCount),
      'error_message': serializer.toJson<String?>(errorMessage),
      'dist_id': serializer.toJson<int?>(distId),
      'vendor_id': serializer.toJson<int?>(vendorId),
    };
  }

  PendingUpload copyWith({
    int? id,
    String? clientUploadId,
    String? nroCliente,
    Value<String?> tipoPdv = const Value.absent(),
    String? photoLocalPaths,
    Value<String?> captureLatLng = const Value.absent(),
    String? estado,
    DateTime? createdAt,
    int? attemptCount,
    Value<String?> errorMessage = const Value.absent(),
    Value<int?> distId = const Value.absent(),
    Value<int?> vendorId = const Value.absent(),
  }) =>
      PendingUpload(
        id: id ?? this.id,
        clientUploadId: clientUploadId ?? this.clientUploadId,
        nroCliente: nroCliente ?? this.nroCliente,
        tipoPdv: tipoPdv.present ? tipoPdv.value : this.tipoPdv,
        photoLocalPaths: photoLocalPaths ?? this.photoLocalPaths,
        captureLatLng:
            captureLatLng.present ? captureLatLng.value : this.captureLatLng,
        estado: estado ?? this.estado,
        createdAt: createdAt ?? this.createdAt,
        attemptCount: attemptCount ?? this.attemptCount,
        errorMessage: errorMessage.present ? errorMessage.value : this.errorMessage,
        distId: distId.present ? distId.value : this.distId,
        vendorId: vendorId.present ? vendorId.value : this.vendorId,
      );

  @override
  String toString() => (StringBuffer('PendingUpload(')
        ..write('id: $id, ')
        ..write('clientUploadId: $clientUploadId, ')
        ..write('nroCliente: $nroCliente, ')
        ..write('tipoPdv: $tipoPdv, ')
        ..write('photoLocalPaths: $photoLocalPaths, ')
        ..write('captureLatLng: $captureLatLng, ')
        ..write('estado: $estado, ')
        ..write('createdAt: $createdAt, ')
        ..write('attemptCount: $attemptCount, ')
        ..write('errorMessage: $errorMessage, ')
        ..write('distId: $distId, ')
        ..write('vendorId: $vendorId')
        ..write(')'))
      .toString();

  @override
  int get hashCode => Object.hash(
        id, clientUploadId, nroCliente, tipoPdv,
        photoLocalPaths, captureLatLng, estado, createdAt, attemptCount,
        errorMessage, distId, vendorId,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PendingUpload &&
          other.id == id &&
          other.clientUploadId == clientUploadId &&
          other.nroCliente == nroCliente &&
          other.tipoPdv == tipoPdv &&
          other.photoLocalPaths == photoLocalPaths &&
          other.captureLatLng == captureLatLng &&
          other.estado == estado &&
          other.createdAt == createdAt &&
          other.attemptCount == attemptCount &&
          other.errorMessage == errorMessage &&
          other.distId == distId &&
          other.vendorId == vendorId);
}

// ──────────────────────────────────────────────────────────────────────────────
// PendingUploadsCompanion
// ──────────────────────────────────────────────────────────────────────────────

class PendingUploadsCompanion extends UpdateCompanion<PendingUpload> {
  final Value<int> id;
  final Value<String> clientUploadId;
  final Value<String> nroCliente;
  final Value<String?> tipoPdv;
  final Value<String> photoLocalPaths;
  final Value<String?> captureLatLng;
  final Value<String> estado;
  final Value<DateTime> createdAt;
  final Value<int> attemptCount;
  final Value<String?> errorMessage;
  final Value<int?> distId;
  final Value<int?> vendorId;

  const PendingUploadsCompanion({
    this.id = const Value.absent(),
    this.clientUploadId = const Value.absent(),
    this.nroCliente = const Value.absent(),
    this.tipoPdv = const Value.absent(),
    this.photoLocalPaths = const Value.absent(),
    this.captureLatLng = const Value.absent(),
    this.estado = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.attemptCount = const Value.absent(),
    this.errorMessage = const Value.absent(),
    this.distId = const Value.absent(),
    this.vendorId = const Value.absent(),
  });

  PendingUploadsCompanion.insert({
    this.id = const Value.absent(),
    required String clientUploadId,
    required String nroCliente,
    this.tipoPdv = const Value.absent(),
    required String photoLocalPaths,
    this.captureLatLng = const Value.absent(),
    this.estado = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.attemptCount = const Value.absent(),
    this.errorMessage = const Value.absent(),
    this.distId = const Value.absent(),
    this.vendorId = const Value.absent(),
  })  : clientUploadId = Value(clientUploadId),
        nroCliente = Value(nroCliente),
        photoLocalPaths = Value(photoLocalPaths);

  static Insertable<PendingUpload> custom({
    Expression<int>? id,
    Expression<String>? clientUploadId,
    Expression<String>? nroCliente,
    Expression<String>? tipoPdv,
    Expression<String>? photoLocalPaths,
    Expression<String>? captureLatLng,
    Expression<String>? estado,
    Expression<DateTime>? createdAt,
    Expression<int>? attemptCount,
    Expression<String>? errorMessage,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (clientUploadId != null) 'client_upload_id': clientUploadId,
      if (nroCliente != null) 'nro_cliente': nroCliente,
      if (tipoPdv != null) 'tipo_pdv': tipoPdv,
      if (photoLocalPaths != null) 'photo_local_paths': photoLocalPaths,
      if (captureLatLng != null) 'capture_lat_lng': captureLatLng,
      if (estado != null) 'estado': estado,
      if (createdAt != null) 'created_at': createdAt,
      if (attemptCount != null) 'attempt_count': attemptCount,
      if (errorMessage != null) 'error_message': errorMessage,
    });
  }

  PendingUploadsCompanion copyWith({
    Value<int>? id,
    Value<String>? clientUploadId,
    Value<String>? nroCliente,
    Value<String?>? tipoPdv,
    Value<String>? photoLocalPaths,
    Value<String?>? captureLatLng,
    Value<String>? estado,
    Value<DateTime>? createdAt,
    Value<int>? attemptCount,
    Value<String?>? errorMessage,
    Value<int?>? distId,
    Value<int?>? vendorId,
  }) {
    return PendingUploadsCompanion(
      id: id ?? this.id,
      clientUploadId: clientUploadId ?? this.clientUploadId,
      nroCliente: nroCliente ?? this.nroCliente,
      tipoPdv: tipoPdv ?? this.tipoPdv,
      photoLocalPaths: photoLocalPaths ?? this.photoLocalPaths,
      captureLatLng: captureLatLng ?? this.captureLatLng,
      estado: estado ?? this.estado,
      createdAt: createdAt ?? this.createdAt,
      attemptCount: attemptCount ?? this.attemptCount,
      errorMessage: errorMessage ?? this.errorMessage,
      distId: distId ?? this.distId,
      vendorId: vendorId ?? this.vendorId,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) map['id'] = Variable<int>(id.value);
    if (clientUploadId.present) {
      map['client_upload_id'] = Variable<String>(clientUploadId.value);
    }
    if (nroCliente.present) {
      map['nro_cliente'] = Variable<String>(nroCliente.value);
    }
    if (tipoPdv.present) map['tipo_pdv'] = Variable<String>(tipoPdv.value);
    if (photoLocalPaths.present) {
      map['photo_local_paths'] = Variable<String>(photoLocalPaths.value);
    }
    if (captureLatLng.present) {
      map['capture_lat_lng'] = Variable<String>(captureLatLng.value);
    }
    if (estado.present) map['estado'] = Variable<String>(estado.value);
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (attemptCount.present) {
      map['attempt_count'] = Variable<int>(attemptCount.value);
    }
    if (errorMessage.present) {
      map['error_message'] = Variable<String>(errorMessage.value);
    }
    if (distId.present) map['dist_id'] = Variable<int>(distId.value);
    if (vendorId.present) map['vendor_id'] = Variable<int>(vendorId.value);
    return map;
  }

  @override
  String toString() => (StringBuffer('PendingUploadsCompanion(')
        ..write('id: $id, ')
        ..write('clientUploadId: $clientUploadId, ')
        ..write('nroCliente: $nroCliente, ')
        ..write('tipoPdv: $tipoPdv, ')
        ..write('photoLocalPaths: $photoLocalPaths, ')
        ..write('captureLatLng: $captureLatLng, ')
        ..write('estado: $estado, ')
        ..write('createdAt: $createdAt, ')
        ..write('attemptCount: $attemptCount, ')
        ..write('errorMessage: $errorMessage, ')
        ..write('distId: $distId, ')
        ..write('vendorId: $vendorId')
        ..write(')'))
      .toString();
}
