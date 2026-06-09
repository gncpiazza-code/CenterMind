import 'dart:convert';
import 'dart:io';

/// Metadatos de captura in-app (auditoría / verificación futura).
class CapturePhotoMetadata {
  final DateTime capturedAtUtc;
  final double? lat;
  final double? lng;
  final double? accuracyM;
  final double? altitudeM;
  final double? heading;
  final double? speedMps;
  final String source;

  const CapturePhotoMetadata({
    required this.capturedAtUtc,
    this.lat,
    this.lng,
    this.accuracyM,
    this.altitudeM,
    this.heading,
    this.speedMps,
    this.source = 'in_app_camera',
  });

  Map<String, dynamic> toJson() => {
        'captured_at': capturedAtUtc.toUtc().toIso8601String(),
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (accuracyM != null) 'accuracy_m': accuracyM,
        if (altitudeM != null) 'altitude_m': altitudeM,
        if (heading != null) 'heading': heading,
        if (speedMps != null) 'speed_mps': speedMps,
        'source': source,
      };

  factory CapturePhotoMetadata.fromJson(Map<String, dynamic> json) {
    return CapturePhotoMetadata(
      capturedAtUtc: DateTime.parse(json['captured_at'] as String).toUtc(),
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      accuracyM: (json['accuracy_m'] as num?)?.toDouble(),
      altitudeM: (json['altitude_m'] as num?)?.toDouble(),
      heading: (json['heading'] as num?)?.toDouble(),
      speedMps: (json['speed_mps'] as num?)?.toDouble(),
      source: json['source'] as String? ?? 'in_app_camera',
    );
  }
}

/// Foto capturada exclusivamente desde la cámara in-app.
class CapturePhoto {
  final File file;
  final CapturePhotoMetadata metadata;

  const CapturePhoto({required this.file, required this.metadata});
}

/// Payload de metadatos enviado al backend (sesión + fotos).
class CaptureSessionMetadata {
  final List<CapturePhotoMetadata> photos;
  final double? sessionLat;
  final double? sessionLng;

  const CaptureSessionMetadata({
    required this.photos,
    this.sessionLat,
    this.sessionLng,
  });

  Map<String, dynamic> toJson() => {
        if (sessionLat != null) 'session_lat': sessionLat,
        if (sessionLng != null) 'session_lng': sessionLng,
        'photos': photos.map((p) => p.toJson()).toList(),
      };

  String toJsonString() => jsonEncode(toJson());

  factory CaptureSessionMetadata.fromJson(Map<String, dynamic> json) {
    return CaptureSessionMetadata(
      sessionLat: (json['session_lat'] as num?)?.toDouble(),
      sessionLng: (json['session_lng'] as num?)?.toDouble(),
      photos: (json['photos'] as List<dynamic>? ?? [])
          .map((e) => CapturePhotoMetadata.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
