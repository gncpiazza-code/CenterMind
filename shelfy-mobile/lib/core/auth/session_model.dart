import 'patron_cuenta_model.dart';

/// Datos de sesión activa del vendedor.
class SessionData {
  final String jwt;
  final int idDistribuidor;
  final int idVendedor;
  final String deviceId;
  final Map<String, dynamic>? branding;
  final bool patronMode;
  final List<PatronCuenta> cuentas;
  final String? selectedCuentaId;

  const SessionData({
    required this.jwt,
    required this.idDistribuidor,
    required this.idVendedor,
    required this.deviceId,
    this.branding,
    this.patronMode = false,
    this.cuentas = const [],
    this.selectedCuentaId,
  });

  PatronCuenta? get selectedCuenta {
    if (selectedCuentaId == null) return null;
    for (final c in cuentas) {
      if (c.id == selectedCuentaId) return c;
    }
    return null;
  }

  factory SessionData.fromJson(Map<String, dynamic> json) {
    final rawCuentas = json['cuentas'];
    final cuentas = <PatronCuenta>[];
    if (rawCuentas is List) {
      for (final item in rawCuentas) {
        if (item is Map<String, dynamic>) {
          cuentas.add(PatronCuenta.fromJson(item));
        } else if (item is Map) {
          cuentas.add(PatronCuenta.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }
    return SessionData(
      jwt: json['jwt'] as String,
      idDistribuidor: json['id_distribuidor'] as int,
      idVendedor: json['id_vendedor'] as int,
      deviceId: json['device_id'] as String,
      branding: json['branding'] as Map<String, dynamic>?,
      patronMode: json['patron_mode'] as bool? ?? cuentas.isNotEmpty,
      cuentas: cuentas,
      selectedCuentaId: json['selected_cuenta_id'] as String? ??
          json['cuenta_default'] as String? ??
          (cuentas.isNotEmpty ? cuentas.first.id : null),
    );
  }

  Map<String, dynamic> toJson() => {
        'jwt': jwt,
        'id_distribuidor': idDistribuidor,
        'id_vendedor': idVendedor,
        'device_id': deviceId,
        'branding': branding,
        'patron_mode': patronMode,
        'cuentas': cuentas.map((c) => c.toJson()).toList(),
        'selected_cuenta_id': selectedCuentaId,
      };

  SessionData copyWith({
    String? jwt,
    int? idDistribuidor,
    int? idVendedor,
    String? deviceId,
    Map<String, dynamic>? branding,
    bool? patronMode,
    List<PatronCuenta>? cuentas,
    String? selectedCuentaId,
  }) {
    return SessionData(
      jwt: jwt ?? this.jwt,
      idDistribuidor: idDistribuidor ?? this.idDistribuidor,
      idVendedor: idVendedor ?? this.idVendedor,
      deviceId: deviceId ?? this.deviceId,
      branding: branding ?? this.branding,
      patronMode: patronMode ?? this.patronMode,
      cuentas: cuentas ?? this.cuentas,
      selectedCuentaId: selectedCuentaId ?? this.selectedCuentaId,
    );
  }
}
