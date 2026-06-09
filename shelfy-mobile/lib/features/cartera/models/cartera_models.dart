import '../../../core/utils/json_helpers.dart';

// Modelos de datos para la cartera de clientes del vendedor.

class CarteraResponse {
  final String mode;
  final String snapshotLabel;
  final List<RutaCartera> rutas;

  CarteraResponse({
    required this.mode,
    required this.snapshotLabel,
    required this.rutas,
  });

  factory CarteraResponse.fromJson(Map<String, dynamic> json) {
    return CarteraResponse(
      mode: json['mode'] as String? ?? '',
      snapshotLabel: json['snapshot_label'] as String? ?? '',
      rutas: (json['rutas'] as List<dynamic>? ?? [])
          .map((e) => RutaCartera.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class RutaCartera {
  final int idRuta;
  final String diaSemana;
  final List<PdvCartera> pdvs;

  RutaCartera({
    required this.idRuta,
    required this.diaSemana,
    required this.pdvs,
  });

  factory RutaCartera.fromJson(Map<String, dynamic> json) {
    return RutaCartera(
      idRuta: (json['id_ruta'] as num?)?.toInt() ?? 0,
      diaSemana: json['dia_semana'] as String? ?? '',
      pdvs: (json['pdvs'] as List<dynamic>? ?? [])
          .map((e) => PdvCartera.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class PdvCartera {
  final String idClienteErp;
  final String nombreDisplay;
  final String? nombreFantasia;
  final String? nombreRazonSocial;
  final String? domicilio;
  final String? localidad;
  final String? telefono;
  final String? canal;
  final double? latitud;
  final double? longitud;
  final String vitalidad;
  final String? fechaUltimaCompra;
  final String? fechaAlta;

  PdvCartera({
    required this.idClienteErp,
    required this.nombreDisplay,
    this.nombreFantasia,
    this.nombreRazonSocial,
    this.domicilio,
    this.localidad,
    this.telefono,
    this.canal,
    this.latitud,
    this.longitud,
    required this.vitalidad,
    this.fechaUltimaCompra,
    this.fechaAlta,
  });

  factory PdvCartera.fromJson(Map<String, dynamic> json) {
    return PdvCartera(
      idClienteErp: jsonAsString(json['id_cliente_erp']),
      nombreDisplay: json['nombre_display'] as String? ?? '',
      nombreFantasia: json['nombre_fantasia'] as String?,
      nombreRazonSocial: json['nombre_razon_social'] as String?,
      domicilio: json['domicilio'] as String?,
      localidad: json['localidad'] as String?,
      telefono: json['telefono'] as String?,
      canal: json['canal'] as String?,
      latitud: (json['latitud'] as num?)?.toDouble(),
      longitud: (json['longitud'] as num?)?.toDouble(),
      vitalidad: json['vitalidad'] as String? ?? 'activo',
      fechaUltimaCompra: json['fecha_ultima_compra'] as String?,
      fechaAlta: json['fecha_alta'] as String?,
    );
  }
}
