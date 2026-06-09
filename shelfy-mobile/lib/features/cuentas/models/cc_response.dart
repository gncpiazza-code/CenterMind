/// Modelos de datos para el módulo de cuentas corrientes del vendedor.

class CcResponse {
  final String modo;
  final String snapshotLabel;
  final double totalSaldo;
  final int totalClientes;
  final List<ClienteCc> clientes;

  CcResponse({
    required this.modo,
    required this.snapshotLabel,
    required this.totalSaldo,
    required this.totalClientes,
    required this.clientes,
  });

  factory CcResponse.fromJson(Map<String, dynamic> json) {
    return CcResponse(
      modo: json['modo'] as String? ?? 'general',
      snapshotLabel: json['snapshot_label'] as String? ?? '',
      totalSaldo: (json['total_saldo'] as num?)?.toDouble() ?? 0.0,
      totalClientes: (json['total_clientes'] as num?)?.toInt() ?? 0,
      clientes: (json['clientes'] as List<dynamic>? ?? [])
          .map((e) => ClienteCc.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ClienteCc {
  final String idClienteErp;
  final String nombreDisplay;
  final double saldo;
  final int? diasVencido;
  final int cantidadComprobantes;
  final double deuda7Dias;
  final double deuda15Dias;
  final double deuda30Dias;
  final double deuda60Dias;
  final double deudaMas60Dias;
  // Geo + FUC (enriquecido por BE desde clientes_pdv_v2)
  final double? latitud;
  final double? longitud;
  final String? domicilio;
  final String? localidad;
  final String? fechaUltimaCompra;

  ClienteCc({
    required this.idClienteErp,
    required this.nombreDisplay,
    required this.saldo,
    this.diasVencido,
    this.cantidadComprobantes = 0,
    this.deuda7Dias = 0,
    this.deuda15Dias = 0,
    this.deuda30Dias = 0,
    this.deuda60Dias = 0,
    this.deudaMas60Dias = 0,
    this.latitud,
    this.longitud,
    this.domicilio,
    this.localidad,
    this.fechaUltimaCompra,
  });

  factory ClienteCc.fromJson(Map<String, dynamic> json) {
    final nombre = (json['nombre_display'] as String? ??
        json['nombre'] as String? ??
        '');
    return ClienteCc(
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombreDisplay: nombre,
      saldo: (json['saldo'] as num?)?.toDouble() ?? 0.0,
      diasVencido: (json['dias_vencido'] as num?)?.toInt(),
      cantidadComprobantes:
          (json['cantidad_comprobantes'] as num?)?.toInt() ?? 0,
      deuda7Dias: (json['deuda_7_dias'] as num?)?.toDouble() ?? 0,
      deuda15Dias: (json['deuda_15_dias'] as num?)?.toDouble() ?? 0,
      deuda30Dias: (json['deuda_30_dias'] as num?)?.toDouble() ?? 0,
      deuda60Dias: (json['deuda_60_dias'] as num?)?.toDouble() ?? 0,
      deudaMas60Dias: (json['deuda_mas_60_dias'] as num?)?.toDouble() ?? 0,
      latitud: (json['latitud'] as num?)?.toDouble(),
      longitud: (json['longitud'] as num?)?.toDouble(),
      domicilio: json['domicilio'] as String?,
      localidad: json['localidad'] as String?,
      fechaUltimaCompra: json['fecha_ultima_compra'] as String?,
    );
  }

  bool get esCritico => (diasVencido ?? 0) > 60;

  bool get tieneGeo => latitud != null && longitud != null;

  /// Construye URL Google Maps al PDV (coordenadas o búsqueda por dirección).
  String? mapsUrl() {
    if (tieneGeo) {
      return 'https://www.google.com/maps/search/?api=1&query=$latitud,$longitud';
    }
    final addr = [domicilio, localidad].whereType<String>().join(', ').trim();
    if (addr.isNotEmpty) {
      final encoded = Uri.encodeComponent(addr);
      return 'https://www.google.com/maps/search/?api=1&query=$encoded';
    }
    return null;
  }
}
