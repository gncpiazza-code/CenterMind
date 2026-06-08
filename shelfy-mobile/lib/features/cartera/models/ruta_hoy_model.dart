/// Modelo para el resumen de ruta del día de hoy.
class RutaHoyResponse {
  final int total;
  final int activos;
  final int porCaer;
  final int inactivos;
  final String diaSemana;
  final String snapshotLabel;

  RutaHoyResponse({
    required this.total,
    required this.activos,
    required this.porCaer,
    required this.inactivos,
    required this.diaSemana,
    required this.snapshotLabel,
  });

  factory RutaHoyResponse.fromJson(Map<String, dynamic> json) {
    return RutaHoyResponse(
      total: (json['total'] as num?)?.toInt() ?? 0,
      activos: (json['activos'] as num?)?.toInt() ?? 0,
      porCaer: (json['por_caer'] as num?)?.toInt() ?? 0,
      inactivos: (json['inactivos'] as num?)?.toInt() ?? 0,
      diaSemana: json['dia_semana'] as String? ?? '',
      snapshotLabel: json['snapshot_label'] as String? ?? '',
    );
  }

  /// Porcentaje de PDVs activos sobre el total (0–100).
  double get porcentajeActividad {
    if (total == 0) return 0;
    return (activos / total) * 100;
  }
}
