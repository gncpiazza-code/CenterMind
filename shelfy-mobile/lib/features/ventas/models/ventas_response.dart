/// Modelos de datos para el módulo de ventas del vendedor.

class VentasResponse {
  final String periodo;
  final double totalImporte;
  final int totalFacturas;
  final List<PdvVentas> porPdv;

  VentasResponse({
    required this.periodo,
    required this.totalImporte,
    required this.totalFacturas,
    required this.porPdv,
  });

  factory VentasResponse.fromJson(Map<String, dynamic> json) {
    return VentasResponse(
      periodo: json['periodo'] as String? ?? '',
      totalImporte: (json['total_importe'] as num?)?.toDouble() ?? 0.0,
      totalFacturas: (json['total_facturas'] as num?)?.toInt() ?? 0,
      porPdv: (json['por_pdv'] as List<dynamic>? ?? [])
          .map((e) => PdvVentas.fromJson(e as Map<String, dynamic>))
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
    return PdvVentas(
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombreDisplay: json['nombre_display'] as String? ?? '',
      importe: (json['importe'] as num?)?.toDouble() ?? 0.0,
      facturas: (json['facturas'] as num?)?.toInt() ?? 0,
    );
  }
}
