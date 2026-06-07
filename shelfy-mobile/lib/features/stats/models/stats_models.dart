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

  MesStats({
    required this.exhibicionesLogicas,
    required this.periodo,
  });

  factory MesStats.fromJson(Map<String, dynamic> json) {
    return MesStats(
      exhibicionesLogicas:
          (json['exhibiciones_logicas'] as num?)?.toInt() ?? 0,
      periodo: json['periodo'] as String? ?? '',
    );
  }
}

class RankingStats {
  final int posicion;
  final int totalVendedores;
  final int puntos;

  RankingStats({
    required this.posicion,
    required this.totalVendedores,
    required this.puntos,
  });

  factory RankingStats.fromJson(Map<String, dynamic> json) {
    return RankingStats(
      posicion: (json['posicion'] as num?)?.toInt() ?? 0,
      totalVendedores: (json['total_vendedores'] as num?)?.toInt() ?? 0,
      puntos: (json['puntos'] as num?)?.toInt() ?? 0,
    );
  }
}
