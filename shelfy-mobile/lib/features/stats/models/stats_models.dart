// Modelos de datos para las estadísticas de rendimiento del vendedor.

class StatsData {
  final MesStats mesActual;
  final MesStats mesAnterior;
  final RankingStats ranking;

  StatsData({
    required this.mesActual,
    required this.mesAnterior,
    required this.ranking,
  });

  factory StatsData.fromJson(Map<String, dynamic> json) {
    return StatsData(
      mesActual: MesStats.fromJson(
          json['mes_actual'] as Map<String, dynamic>? ?? {}),
      mesAnterior: MesStats.fromJson(
          json['mes_anterior'] as Map<String, dynamic>? ?? {}),
      ranking: RankingStats.fromJson(
          json['ranking'] as Map<String, dynamic>? ?? {}),
    );
  }
}

class MesStats {
  final int exhibicionesLogicas;
  final String periodo;
  // Desglose de estados — presentes en /stats/full
  final int aprobadas;
  final int destacadas;
  final int rechazadas;
  final int pendientes;
  final int puntos;

  MesStats({
    required this.exhibicionesLogicas,
    required this.periodo,
    this.aprobadas = 0,
    this.destacadas = 0,
    this.rechazadas = 0,
    this.pendientes = 0,
    this.puntos = 0,
  });

  factory MesStats.fromJson(Map<String, dynamic> json) {
    return MesStats(
      exhibicionesLogicas:
          (json['exhibiciones_logicas'] as num?)?.toInt() ?? 0,
      periodo: json['periodo'] as String? ?? '',
      aprobadas: (json['aprobadas'] as num?)?.toInt() ?? 0,
      destacadas: (json['destacadas'] as num?)?.toInt() ?? 0,
      rechazadas: (json['rechazadas'] as num?)?.toInt() ?? 0,
      pendientes: (json['pendientes'] as num?)?.toInt() ?? 0,
      puntos: (json['puntos'] as num?)?.toInt() ?? 0,
    );
  }
}

class RankingStats {
  final int posicion;
  final int totalVendedores;
  final int puntos;
  /// Positivo = subió N posiciones vs mes anterior. Negativo = bajó. Null = sin datos.
  final int? deltaPosicion;

  RankingStats({
    required this.posicion,
    required this.totalVendedores,
    required this.puntos,
    this.deltaPosicion,
  });

  factory RankingStats.fromJson(Map<String, dynamic> json) {
    return RankingStats(
      posicion: (json['posicion'] as num?)?.toInt() ?? 0,
      totalVendedores: (json['total_vendedores'] as num?)?.toInt() ?? 0,
      puntos: (json['puntos'] as num?)?.toInt() ?? 0,
      deltaPosicion: (json['delta_posicion'] as num?)?.toInt(),
    );
  }
}
