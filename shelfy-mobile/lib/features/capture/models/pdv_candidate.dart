/// Candidato de Punto de Venta retornado por los endpoints de PDVs cercanos y búsqueda.
class PdvCandidate {
  final String idClienteErp;
  final String nombreFantasia;
  final String nombreRazonSocial;
  final String nombreDisplay;
  final double distanciaM;
  final double? latitud;
  final double? longitud;
  final int idRuta;
  final bool enCartera;

  const PdvCandidate({
    required this.idClienteErp,
    this.nombreFantasia = '',
    this.nombreRazonSocial = '',
    required this.nombreDisplay,
    this.distanciaM = 0,
    this.latitud,
    this.longitud,
    this.idRuta = 0,
    this.enCartera = true,
  });

  factory PdvCandidate.fromJson(Map<String, dynamic> json) {
    return PdvCandidate(
      idClienteErp: json['id_cliente_erp']?.toString() ?? '',
      nombreFantasia: json['nombre_fantasia'] as String? ?? '',
      nombreRazonSocial: json['nombre_razon_social'] as String? ?? '',
      nombreDisplay: json['nombre_display'] as String? ?? '',
      distanciaM: json['distancia_m'] != null
          ? (json['distancia_m'] as num).toDouble()
          : 0,
      latitud: json['latitud'] != null ? (json['latitud'] as num).toDouble() : null,
      longitud: json['longitud'] != null ? (json['longitud'] as num).toDouble() : null,
      idRuta: json['id_ruta'] as int? ?? 0,
      enCartera: json['en_cartera'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id_cliente_erp': idClienteErp,
        'nombre_fantasia': nombreFantasia,
        'nombre_razon_social': nombreRazonSocial,
        'nombre_display': nombreDisplay,
        'distancia_m': distanciaM,
        'latitud': latitud,
        'longitud': longitud,
        'id_ruta': idRuta,
        'en_cartera': enCartera,
      };
}
