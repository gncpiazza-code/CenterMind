// Modelos de datos para las estadísticas de rendimiento del vendedor.

/// 7 KPIs del vendedor desde /estadisticas/resumen → aggregate_kpis_vendedor.
class KpisResumen {
  final int pdvs;
  final int altas;
  final int exhibiciones;
  final int pdvsExhibidos;
  final int compradores;
  final double bultos;
  final double coberturaPct;
  final double objetivosPct;

  KpisResumen({
    required this.pdvs,
    required this.altas,
    required this.exhibiciones,
    required this.pdvsExhibidos,
    required this.compradores,
    required this.bultos,
    required this.coberturaPct,
    required this.objetivosPct,
  });

  factory KpisResumen.fromJson(Map<String, dynamic> json) {
    double parseDouble(dynamic v) {
      if (v == null) return 0.0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0.0;
    }

    return KpisResumen(
      pdvs: (json['pdvs'] as num?)?.toInt() ?? 0,
      altas: (json['altas'] as num?)?.toInt() ?? 0,
      exhibiciones: (json['exhibiciones'] as num?)?.toInt() ?? 0,
      pdvsExhibidos: (json['pdvs_exhibidos'] as num?)?.toInt() ?? 0,
      compradores: (json['compradores'] as num?)?.toInt() ?? 0,
      bultos: parseDouble(json['bultos']),
      coberturaPct: parseDouble(json['cobertura_pct']),
      objetivosPct: parseDouble(json['objetivos_pct']),
    );
  }
}

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
