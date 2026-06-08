/// Candidato de Punto de Venta retornado por el endpoint de PDVs cercanos.
class PdvCandidate {
  final String idClienteErp;
  final String nombreDisplay;
  final double distanciaM;
  final double? latitud;
  final double? longitud;
  final int idRuta;

  const PdvCandidate({
    required this.idClienteErp,
    required this.nombreDisplay,
    required this.distanciaM,
    this.latitud,
    this.longitud,
    required this.idRuta,
  });

  factory PdvCandidate.fromJson(Map<String, dynamic> json) {
    return PdvCandidate(
      idClienteErp: json['id_cliente_erp']?.toString() ?? '',
      nombreDisplay: json['nombre_display'] as String? ?? '',
      distanciaM: (json['distancia_m'] as num).toDouble(),
      latitud: json['latitud'] != null
          ? (json['latitud'] as num).toDouble()
          : null,
      longitud: json['longitud'] != null
          ? (json['longitud'] as num).toDouble()
          : null,
      idRuta: json['id_ruta'] as int,
    );
  }

  Map<String, dynamic> toJson() => {
        'id_cliente_erp': idClienteErp,
        'nombre_display': nombreDisplay,
        'distancia_m': distanciaM,
        'latitud': latitud,
        'longitud': longitud,
        'id_ruta': idRuta,
      };
}
