/// Cuenta operativa bajo un patrón (ej. Monchi / Jorge Coronel bajo Ivan Soto).
class PatronCuenta {
  final String id;
  final String label;

  const PatronCuenta({
    required this.id,
    required this.label,
  });

  factory PatronCuenta.fromJson(Map<String, dynamic> json) {
    return PatronCuenta(
      id: json['id'] as String,
      label: json['label'] as String? ?? json['id'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
      };
}
