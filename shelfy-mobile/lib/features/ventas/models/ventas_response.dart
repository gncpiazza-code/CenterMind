/// Modelos de datos para el módulo de ventas del vendedor (volumen, sin importes).

class VentasResponse {
  final String periodo;
  final String snapshotLabel;
  final double totalBultos;
  final double totalUnidades;
  final int totalFacturas;
  final List<PdvVentas> porPdv;
  final List<BultosDesglose> bultosDesglose;
  final List<TopComprador> topCompradores;

  VentasResponse({
    required this.periodo,
    required this.snapshotLabel,
    required this.totalBultos,
    required this.totalUnidades,
    required this.totalFacturas,
    required this.porPdv,
    required this.bultosDesglose,
    required this.topCompradores,
  });

  factory VentasResponse.fromJson(Map<String, dynamic> json) {
    return VentasResponse(
      periodo: json['periodo'] as String? ?? '',
      snapshotLabel: json['snapshot_label'] as String? ?? '',
      totalBultos: (json['total_bultos'] as num?)?.toDouble() ?? 0.0,
      totalUnidades: (json['total_unidades'] as num?)?.toDouble() ?? 0.0,
      totalFacturas: (json['total_facturas'] as num?)?.toInt() ?? 0,
      porPdv: (json['por_pdv'] as List<dynamic>? ?? [])
          .map((e) => PdvVentas.fromJson(e as Map<String, dynamic>))
          .toList(),
      bultosDesglose: (json['bultos_desglose'] as List<dynamic>? ?? [])
          .map((e) => BultosDesglose.fromJson(e as Map<String, dynamic>))
          .toList(),
      topCompradores: (json['top_compradores'] as List<dynamic>? ?? [])
          .map((e) => TopComprador.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class PdvVentas {
  final String idClienteErp;
  final String nombreDisplay;
  final double bultos;
  final double unidades;
  final int facturas;

  PdvVentas({
    required this.idClienteErp,
    required this.nombreDisplay,
    required this.bultos,
    required this.unidades,
    required this.facturas,
  });

  factory PdvVentas.fromJson(Map<String, dynamic> json) {
    final nombre = (json['nombre_display'] as String? ??
        json['nombre'] as String? ??
        '');
    return PdvVentas(
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombreDisplay: nombre,
      bultos: (json['bultos'] as num?)?.toDouble() ?? 0.0,
      unidades: (json['unidades'] as num?)?.toDouble() ?? 0.0,
      facturas: (json['facturas'] as num?)?.toInt() ?? 0,
    );
  }
}

class BultosDesglose {
  final String articulo;
  final String? codArticulo;
  final num bultos;
  final int? bultosEnteros;
  final num? unidadesResto;

  BultosDesglose({
    required this.articulo,
    this.codArticulo,
    required this.bultos,
    this.bultosEnteros,
    this.unidadesResto,
  });

  factory BultosDesglose.fromJson(Map<String, dynamic> json) {
    return BultosDesglose(
      articulo: json['articulo'] as String? ?? '',
      codArticulo: json['cod_articulo'] as String?,
      bultos: (json['bultos'] as num?) ?? 0,
      bultosEnteros: (json['bultos_enteros'] as num?)?.toInt(),
      unidadesResto: json['unidades_resto'] as num?,
    );
  }

  String get volumenLabel {
    if (bultosEnteros != null && unidadesResto != null && unidadesResto! > 0) {
      return '$bultosEnteros bts + ${unidadesResto!.toStringAsFixed(0)} u';
    }
    return '${bultos.toStringAsFixed(bultos is double && bultos % 1 != 0 ? 2 : 0)} bts';
  }
}

class TopComprador {
  final int rank;
  final String idClienteErp;
  final String nombreCliente;
  final num totalBultos;

  TopComprador({
    required this.rank,
    required this.idClienteErp,
    required this.nombreCliente,
    required this.totalBultos,
  });

  factory TopComprador.fromJson(Map<String, dynamic> json) {
    return TopComprador(
      rank: (json['rank'] as num?)?.toInt() ?? 0,
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombreCliente: json['nombre_cliente'] as String? ?? '',
      totalBultos: (json['total_bultos'] as num?) ?? 0,
    );
  }
}
