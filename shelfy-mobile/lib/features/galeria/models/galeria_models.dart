// Modelos de datos para el módulo de galería de exhibiciones.

class GaleriaCliente {
  final String idClienteErp;
  final String nombreDisplay;
  final int totalExhibiciones;
  final String? ultimaExhibicion;
  final double? latitud;
  final double? longitud;

  GaleriaCliente({
    required this.idClienteErp,
    required this.nombreDisplay,
    required this.totalExhibiciones,
    this.ultimaExhibicion,
    this.latitud,
    this.longitud,
  });

  factory GaleriaCliente.fromJson(Map<String, dynamic> json) {
    return GaleriaCliente(
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombreDisplay: json['nombre_display'] as String? ?? '',
      totalExhibiciones: (json['total_exhibiciones'] as num?)?.toInt() ?? 0,
      ultimaExhibicion: json['ultima_exhibicion'] as String?,
      latitud: (json['latitud'] as num?)?.toDouble(),
      longitud: (json['longitud'] as num?)?.toDouble(),
    );
  }
}

class GaleriaFoto {
  final int idExhibicion;
  final String? urlFoto;
  final String estado;
  final String? timestampSubida;
  final String? comentario;
  final String? supervisor;

  GaleriaFoto({
    required this.idExhibicion,
    this.urlFoto,
    required this.estado,
    this.timestampSubida,
    this.comentario,
    this.supervisor,
  });

  factory GaleriaFoto.fromJson(Map<String, dynamic> json) {
    return GaleriaFoto(
      idExhibicion: (json['id_exhibicion'] as num?)?.toInt() ?? 0,
      urlFoto: json['url_foto'] as String?,
      estado: json['estado'] as String? ?? 'Pendiente',
      timestampSubida: json['timestamp_subida'] as String?,
      comentario: json['comentario'] as String?,
      supervisor: json['supervisor'] as String?,
    );
  }
}

class GaleriaPublicacion {
  final String diaAr;
  final String estadoDia;
  final int totalFotos;
  final List<GaleriaFoto> fotos;

  GaleriaPublicacion({
    required this.diaAr,
    required this.estadoDia,
    required this.totalFotos,
    required this.fotos,
  });

  factory GaleriaPublicacion.fromJson(Map<String, dynamic> json) {
    return GaleriaPublicacion(
      diaAr: json['dia_ar'] as String? ?? '',
      estadoDia: json['estado_dia'] as String? ?? 'Pendiente',
      totalFotos: (json['total_fotos'] as num?)?.toInt() ?? 0,
      fotos: (json['fotos'] as List<dynamic>? ?? [])
          .map((e) => GaleriaFoto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class GaleriaClienteTimeline {
  final String idClienteErp;
  final String nombreDisplay;
  final List<GaleriaPublicacion> publicaciones;

  GaleriaClienteTimeline({
    required this.idClienteErp,
    required this.nombreDisplay,
    required this.publicaciones,
  });

  factory GaleriaClienteTimeline.fromJson(Map<String, dynamic> json) {
    return GaleriaClienteTimeline(
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombreDisplay: json['nombre_display'] as String? ?? '',
      publicaciones: (json['publicaciones'] as List<dynamic>? ?? [])
          .map((e) => GaleriaPublicacion.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class GaleriaMapPin {
  final String idClienteErp;
  final String nombre;
  final double latitud;
  final double longitud;
  final int countExhibiciones;

  GaleriaMapPin({
    required this.idClienteErp,
    required this.nombre,
    required this.latitud,
    required this.longitud,
    required this.countExhibiciones,
  });

  factory GaleriaMapPin.fromJson(Map<String, dynamic> json) {
    return GaleriaMapPin(
      idClienteErp: json['id_cliente_erp'] as String? ?? '',
      nombre: json['nombre'] as String? ?? '',
      latitud: (json['latitud'] as num?)?.toDouble() ?? 0,
      longitud: (json['longitud'] as num?)?.toDouble() ?? 0,
      countExhibiciones: (json['count_exhibiciones'] as num?)?.toInt() ?? 0,
    );
  }
}
