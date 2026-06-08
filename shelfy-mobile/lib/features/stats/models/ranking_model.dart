/// Modelos de datos para el ranking completo de vendedores.

class RankingEntry {
  final int posicion;
  final String nombre;
  final int puntos;
  final bool esYo;

  const RankingEntry({
    required this.posicion,
    required this.nombre,
    required this.puntos,
    required this.esYo,
  });

  factory RankingEntry.fromJson(Map<String, dynamic> json) {
    return RankingEntry(
      posicion: (json['posicion'] as num?)?.toInt() ?? 0,
      nombre: json['nombre'] as String? ?? '',
      puntos: (json['puntos'] as num?)?.toInt() ?? 0,
      esYo: json['es_yo'] as bool? ?? false,
    );
  }
}

class RankingResponse {
  final String periodo;
  final List<RankingEntry> ranking;
  final int miPosicion;
  final int totalVendedores;

  const RankingResponse({
    required this.periodo,
    required this.ranking,
    required this.miPosicion,
    required this.totalVendedores,
  });

  factory RankingResponse.fromJson(Map<String, dynamic> json) {
    final list = (json['ranking'] as List<dynamic>? ?? [])
        .map((e) => RankingEntry.fromJson(e as Map<String, dynamic>))
        .toList();
    return RankingResponse(
      periodo: json['periodo'] as String? ?? '',
      ranking: list,
      miPosicion: (json['mi_posicion'] as num?)?.toInt() ?? 0,
      totalVendedores: (json['total_vendedores'] as num?)?.toInt() ?? 0,
    );
  }
}
