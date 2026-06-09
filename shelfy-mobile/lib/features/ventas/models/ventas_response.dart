/// Modelos de datos para el módulo de ventas del vendedor.

class VentasResponse {
  final String periodo;
  final String snapshotLabel;
  final double totalImporte;
  final int totalFacturas;
  final List<PdvVentas> porPdv;
  final List<BultosDesglose> bultosDesglose;
  final List<TopComprador> topCompradores;

  VentasResponse({
    required this.periodo,
    required this.snapshotLabel,
    required this.totalImporte,
    required this.totalFacturas,
    required this.porPdv,
    required this.bultosDesglose,
    required this.topCompradores,
  });

  factory VentasResponse.fromJson(Map<String, dynamic> json) {
    return VentasResponse(
      periodo: json['periodo'] as String? ?? '',
      snapshotLabel: json['snapshot_label'] as String? ?? '',
      totalImporte: (json['total_importe'] as num?)?.toDouble() ?? 0.0,
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
  final double importe;
  final int facturas;

  PdvVentas({
    required this.idClienteErp,
    required this.nombreDisplay,
    required this.importe,
    required this.facturas,
  });

  factory PdvVentas.fromJson(Map<String, dynamic> json) {
    // Defensive: BE may send nombre_display or nombre (legacy)
    final nombre = (json['nombre_display'] as String? ??
        json['nombre'] as String? ??
        '');
    return PdvVentas(
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombreDisplay: nombre,
      importe: (json['importe'] as num?)?.toDouble() ?? 0.0,
      facturas: (json['facturas'] as num?)?.toInt() ?? 0,
    );
  }
}

class BultosDesglose {
  final String articulo;
  final String? codArticulo;
  final num bultos;

  BultosDesglose({
    required this.articulo,
    this.codArticulo,
    required this.bultos,
  });

  factory BultosDesglose.fromJson(Map<String, dynamic> json) {
    return BultosDesglose(
      articulo: json['articulo'] as String? ?? '',
      codArticulo: json['cod_articulo'] as String?,
      bultos: (json['bultos'] as num?) ?? 0,
    );
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
