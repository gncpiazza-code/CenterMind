import 'objetivo_app.dart';

/// Modelo de detalle completo de un objetivo, obtenido al hacer tap en la card.
class ItemPdv {
  final String idClienteErp;
  final String nombre;
  final String? rutaLabel;

  const ItemPdv({
    required this.idClienteErp,
    required this.nombre,
    this.rutaLabel,
  });

  factory ItemPdv.fromJson(Map<String, dynamic> json) {
    return ItemPdv(
      idClienteErp: json['id_cliente_erp']?.toString() ??
          json['id']?.toString() ??
          '',
      nombre: json['nombre'] as String? ?? '',
      rutaLabel: json['ruta_label'] as String?,
    );
  }
}

/// Prorrateo lun–sáb servido por BE (core/objetivos_prorrateo.py).
class ProrrateoGrid {
  final String label;
  final double restante;
  final double metaDiariaFutura;
  final double avanceVsMeta;
  final int metaAcumulada;
  final bool invarianteOk;
  final List<ProrrateoSemana> semanas;

  const ProrrateoGrid({
    required this.label,
    required this.restante,
    required this.metaDiariaFutura,
    required this.avanceVsMeta,
    required this.metaAcumulada,
    required this.invarianteOk,
    required this.semanas,
  });

  factory ProrrateoGrid.fromJson(Map<String, dynamic> json) {
    return ProrrateoGrid(
      label: json['label'] as String? ?? 'Prorrateo',
      restante: (json['restante'] as num?)?.toDouble() ?? 0,
      metaDiariaFutura: (json['meta_diaria_futura'] as num?)?.toDouble() ?? 0,
      avanceVsMeta: (json['avance_vs_meta'] as num?)?.toDouble() ?? 0,
      metaAcumulada: (json['meta_acumulada'] as num?)?.toInt() ?? 0,
      invarianteOk: json['invariante_ok'] as bool? ?? true,
      semanas: (json['semanas'] as List<dynamic>? ?? [])
          .map((e) => ProrrateoSemana.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ProrrateoSemana {
  final String label;
  final int weekPct;
  final double weekMeta;
  final double weekAvance;
  final List<dynamic> celdas;

  const ProrrateoSemana({
    required this.label,
    required this.weekPct,
    required this.weekMeta,
    required this.weekAvance,
    required this.celdas,
  });

  factory ProrrateoSemana.fromJson(Map<String, dynamic> json) {
    return ProrrateoSemana(
      label: json['label'] as String? ?? '',
      weekPct: (json['week_pct'] as num?)?.toInt() ?? 0,
      weekMeta: (json['week_meta'] as num?)?.toDouble() ?? 0,
      weekAvance: (json['week_avance'] as num?)?.toDouble() ?? 0,
      celdas: json['celdas'] as List<dynamic>? ?? [],
    );
  }
}

class ObjetivoDetalle {
  final String id;
  final String tipo;
  final String? descripcion;
  final int valorObjetivo;
  final int valorActual;
  final double progresoPct;
  final bool cumplido;
  final String fechaObjetivo;
  final Map<String, dynamic>? desglose;
  final List<ItemPdv> itemsPdv;
  final List<String> recomendaciones;
  final ProrrateoGrid? prorrateo;

  const ObjetivoDetalle({
    required this.id,
    required this.tipo,
    this.descripcion,
    required this.valorObjetivo,
    required this.valorActual,
    required this.progresoPct,
    required this.cumplido,
    required this.fechaObjetivo,
    this.desglose,
    this.itemsPdv = const [],
    this.recomendaciones = const [],
    this.prorrateo,
  });

  factory ObjetivoDetalle.fromJson(Map<String, dynamic> json) {
    final pdvList = (json['items_pdv'] as List<dynamic>? ?? [])
        .map((e) => ItemPdv.fromJson(e as Map<String, dynamic>))
        .toList();

    final recList = (json['recomendaciones'] as List<dynamic>? ?? [])
        .map((e) => e as String? ?? '')
        .where((s) => s.isNotEmpty)
        .toList();

    return ObjetivoDetalle(
      id: json['id']?.toString() ?? '',
      tipo: json['tipo'] as String? ?? '',
      descripcion: json['descripcion'] as String?,
      valorObjetivo: (json['valor_objetivo'] as num?)?.toInt() ?? 0,
      valorActual: (json['valor_actual'] as num?)?.toInt() ?? 0,
      progresoPct: (json['progreso_pct'] as num?)?.toDouble() ?? 0.0,
      cumplido: json['cumplido'] as bool? ?? false,
      fechaObjetivo: json['fecha_objetivo'] as String? ?? '',
      desglose: json['desglose'] as Map<String, dynamic>?,
      itemsPdv: pdvList,
      recomendaciones: recList,
      prorrateo: json['prorrateo'] != null
          ? ProrrateoGrid.fromJson(json['prorrateo'] as Map<String, dynamic>)
          : null,
    );
  }

  /// Resumen mínimo desde la lista (fallback si el detalle API falla).
  factory ObjetivoDetalle.fromListItem(ObjetivoApp app) {
    final pct = app.valorObjetivo > 0
        ? (app.valorActual / app.valorObjetivo) * 100
        : 0.0;
    return ObjetivoDetalle(
      id: app.id,
      tipo: app.tipo,
      descripcion: app.descripcion,
      valorObjetivo: app.valorObjetivo,
      valorActual: app.valorActual,
      progresoPct: pct,
      cumplido: app.valorActual >= app.valorObjetivo && app.valorObjetivo > 0,
      fechaObjetivo: app.fechaObjetivo,
      recomendaciones: const [
        'Detalle completo no disponible. Reintentá en unos minutos.',
      ],
    );
  }
}
