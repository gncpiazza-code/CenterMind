/// Modelo para la respuesta de GET /api/vendedor-app/post-upload/{nro_cliente}
/// Utilizado en la pantalla de confirmación rica post-upload.

class PostUploadSummary {
  final List<HistorialPdvItem> historialPdv;
  final StatsMes statsMes;
  final ObjetivoBadge? objetivoBadge;

  const PostUploadSummary({
    required this.historialPdv,
    required this.statsMes,
    this.objetivoBadge,
  });

  factory PostUploadSummary.fromJson(Map<String, dynamic> json) {
    final histRaw = json['historial_pdv'] as List<dynamic>? ?? [];
    final statsRaw = json['stats_mes'] as Map<String, dynamic>? ?? {};
    final badgeRaw = json['objetivo_badge'] as Map<String, dynamic>?;

    return PostUploadSummary(
      historialPdv: histRaw
          .map((e) => HistorialPdvItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      statsMes: StatsMes.fromJson(statsRaw),
      objetivoBadge:
          badgeRaw != null ? ObjetivoBadge.fromJson(badgeRaw) : null,
    );
  }
}

/// Una entrada del historial de visitas al PDV.
class HistorialPdvItem {
  final String fecha;
  final String estado;

  const HistorialPdvItem({required this.fecha, required this.estado});

  factory HistorialPdvItem.fromJson(Map<String, dynamic> json) {
    return HistorialPdvItem(
      fecha: json['fecha'] as String? ?? '',
      estado: json['estado'] as String? ?? 'Pendiente',
    );
  }
}

/// Estadísticas del mes del vendedor.
class StatsMes {
  final int exhibicionesLogicas;
  final int puntos;

  const StatsMes({required this.exhibicionesLogicas, required this.puntos});

  factory StatsMes.fromJson(Map<String, dynamic> json) {
    return StatsMes(
      exhibicionesLogicas:
          (json['exhibiciones_logicas'] as num?)?.toInt() ?? 0,
      puntos: (json['puntos'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Badge de objetivo activo (si existe).
class ObjetivoBadge {
  final String tipo;
  final double progresoPct;

  const ObjetivoBadge({required this.tipo, required this.progresoPct});

  factory ObjetivoBadge.fromJson(Map<String, dynamic> json) {
    return ObjetivoBadge(
      tipo: json['tipo'] as String? ?? 'exhibicion',
      progresoPct: (json['progreso_pct'] as num?)?.toDouble() ?? 0.0,
    );
  }
}
