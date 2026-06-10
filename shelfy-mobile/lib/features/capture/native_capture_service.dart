import 'dart:io';

import 'package:image_picker/image_picker.dart';

/// Cámara nativa vía intent del SO — fallback para Android gama baja.
/// Cada llamada abre el intent nativo y retorna el archivo resultante.
abstract final class NativeCaptureService {
  static final _picker = ImagePicker();

  static Future<File?> capturePhoto() async {
    final xfile = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 1920,
      maxHeight: 1920,
    );
    if (xfile == null) return null;
    return File(xfile.path);
  }
}
