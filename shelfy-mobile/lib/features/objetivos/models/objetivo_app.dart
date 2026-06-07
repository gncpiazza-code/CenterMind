/// Modelo de objetivo activo para el vendedor de campo.
class ObjetivoApp {
  final int id;
  final String tipo;
  final int valorObjetivo;
  final int valorAprobados;
  final String fechaObjetivo;
  final String? nombreVendedor;
  final String? descripcion;

  ObjetivoApp({
    required this.id,
    required this.tipo,
    required this.valorObjetivo,
    required this.valorAprobados,
    required this.fechaObjetivo,
    this.nombreVendedor,
    this.descripcion,
  });

  factory ObjetivoApp.fromJson(Map<String, dynamic> json) {
    return ObjetivoApp(
      id: (json['id'] as num?)?.toInt() ?? 0,
      tipo: json['tipo'] as String? ?? '',
      valorObjetivo: (json['valor_objetivo'] as num?)?.toInt() ?? 0,
      valorAprobados: (json['valor_aprobados'] as num?)?.toInt() ?? 0,
      fechaObjetivo: json['fecha_objetivo'] as String? ?? '',
      nombreVendedor: json['nombre_vendedor'] as String?,
      descripcion: json['descripcion'] as String?,
    );
  }
}
