/// Modelos de datos para el módulo de cuentas corrientes del vendedor.

class CcResponse {
  final String modo;
  final double totalSaldo;
  final int totalClientes;
  final List<ClienteCc> clientes;

  CcResponse({
    required this.modo,
    required this.totalSaldo,
    required this.totalClientes,
    required this.clientes,
  });

  factory CcResponse.fromJson(Map<String, dynamic> json) {
    return CcResponse(
      modo: json['modo'] as String? ?? 'general',
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

  ClienteCc({
    required this.idClienteErp,
    required this.nombreDisplay,
    required this.saldo,
    this.diasVencido,
  });

  factory ClienteCc.fromJson(Map<String, dynamic> json) {
    return ClienteCc(
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombreDisplay: json['nombre_display'] as String? ?? '',
      saldo: (json['saldo'] as num?)?.toDouble() ?? 0.0,
      diasVencido: (json['dias_vencido'] as num?)?.toInt(),
    );
  }

  bool get esCritico => (diasVencido ?? 0) > 60;
}
