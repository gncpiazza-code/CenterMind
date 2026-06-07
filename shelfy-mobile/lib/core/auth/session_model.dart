/// Datos de sesión activa del vendedor.
class SessionData {
  final String jwt;
  final int idDistribuidor;
  final int idVendedor;
  final String deviceId;
  final Map<String, dynamic>? branding;

  const SessionData({
    required this.jwt,
    required this.idDistribuidor,
    required this.idVendedor,
    required this.deviceId,
    this.branding,
  });

  factory SessionData.fromJson(Map<String, dynamic> json) {
    return SessionData(
      jwt: json['jwt'] as String,
      idDistribuidor: json['id_distribuidor'] as int,
      idVendedor: json['id_vendedor'] as int,
      deviceId: json['device_id'] as String,
      branding: json['branding'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() => {
        'jwt': jwt,
        'id_distribuidor': idDistribuidor,
        'id_vendedor': idVendedor,
        'device_id': deviceId,
        'branding': branding,
      };

  SessionData copyWith({
    String? jwt,
    int? idDistribuidor,
    int? idVendedor,
    String? deviceId,
    Map<String, dynamic>? branding,
  }) {
    return SessionData(
      jwt: jwt ?? this.jwt,
      idDistribuidor: idDistribuidor ?? this.idDistribuidor,
      idVendedor: idVendedor ?? this.idVendedor,
      deviceId: deviceId ?? this.deviceId,
      branding: branding ?? this.branding,
    );
  }
}
