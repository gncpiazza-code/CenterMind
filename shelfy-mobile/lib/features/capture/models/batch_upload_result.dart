/// Resultado de la subida batch al backend.
class BatchUploadResult {
  final List<String> exhibicionIds;
  final StatsSummary statsSummary;

  const BatchUploadResult({
    required this.exhibicionIds,
    required this.statsSummary,
  });

  factory BatchUploadResult.fromJson(Map<String, dynamic> json) {
    return BatchUploadResult(
      exhibicionIds: (json['exhibicion_ids'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      statsSummary: StatsSummary.fromJson(
        json['stats_summary'] as Map<String, dynamic>,
      ),
    );
  }
}

/// Resumen de estadísticas devuelto tras una subida.
class StatsSummary {
  final int exhibicionesLogicas;

  const StatsSummary({required this.exhibicionesLogicas});

  factory StatsSummary.fromJson(Map<String, dynamic> json) {
    return StatsSummary(
      exhibicionesLogicas: (json['exhibiciones_logicas'] as num).toInt(),
    );
  }
}
