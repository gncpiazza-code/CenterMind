/// Modelo de detalle completo de un objetivo, obtenido al hacer tap en la card.
class ItemPdv {
  final String idClienteErp;
  final String nombre;

  const ItemPdv({
    required this.idClienteErp,
    required this.nombre,
  });

  factory ItemPdv.fromJson(Map<String, dynamic> json) {
    return ItemPdv(
      idClienteErp: json['id_cliente_erp']?.toString() ?? '',
      nombre: json['nombre'] as String? ?? '',
    );
  }
}

/// Campos tipados del campo `resumen_mobile` devuelto por el backend.
class ResumenMobile {
  final String titulo;
  final String accion;
  final String? tip;
  final String? mes;
  final String? origen;

  const ResumenMobile({
    required this.titulo,
    required this.accion,
    this.tip,
    this.mes,
    this.origen,
  });

  factory ResumenMobile.fromJson(Map<String, dynamic> json) {
    return ResumenMobile(
      titulo: json['titulo'] as String? ?? '',
      accion: json['accion'] as String? ?? '',
      tip: json['tip'] as String?,
      mes: json['mes'] as String?,
      origen: json['origen'] as String?,
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
  final ResumenMobile? resumenMobile;

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
    this.resumenMobile,
  });

  factory ObjetivoDetalle.fromJson(Map<String, dynamic> json) {
    final pdvList = (json['items_pdv'] as List<dynamic>? ?? [])
        .map((e) => ItemPdv.fromJson(e as Map<String, dynamic>))
        .toList();

    final recList = (json['recomendaciones'] as List<dynamic>? ?? [])
        .map((e) => e as String? ?? '')
        .where((s) => s.isNotEmpty)
        .toList();

    final resumenRaw = json['resumen_mobile'];
    final resumen = resumenRaw is Map<String, dynamic>
        ? ResumenMobile.fromJson(resumenRaw)
        : null;

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
      resumenMobile: resumen,
    );
  }
}
