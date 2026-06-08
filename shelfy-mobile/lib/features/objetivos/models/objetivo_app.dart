/// Modelo de objetivo activo para el vendedor de campo.
class ObjetivoApp {
  final String id;
  final String tipo;
  final int valorObjetivo;
  final int valorActual;
  final String fechaObjetivo;
  final String? nombreVendedor;
  final String? descripcion;

  ObjetivoApp({
    required this.id,
    required this.tipo,
    required this.valorObjetivo,
    required this.valorActual,
    required this.fechaObjetivo,
    this.nombreVendedor,
    this.descripcion,
  });

  /// Progreso actual (alias legado para UI).
  int get valorAprobados => valorActual;

  factory ObjetivoApp.fromJson(Map<String, dynamic> json) {
    final valorActualRaw = json['valor_actual'] ?? json['valor_aprobados'];
    return ObjetivoApp(
      id: json['id']?.toString() ?? '',
      tipo: json['tipo'] as String? ?? '',
      valorObjetivo: (json['valor_objetivo'] as num?)?.toInt() ?? 0,
      valorActual: (valorActualRaw as num?)?.toInt() ?? 0,
      fechaObjetivo: json['fecha_objetivo'] as String? ?? '',
      nombreVendedor: json['nombre_vendedor'] as String?,
      descripcion: json['descripcion'] as String?,
    );
  }
}
