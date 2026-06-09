import 'dart:io';

import 'package:camera/camera.dart';

/// Perfil de dispositivo para SHELFYAPP — vendedores en Android gama baja.
abstract final class DeviceProfile {
  /// Android gama baja: preview más liviano. iOS: más calidad (supervisores futuro).
  static ResolutionPreset get cameraPreset =>
      Platform.isAndroid ? ResolutionPreset.medium : ResolutionPreset.high;

  static bool get isAndroid => Platform.isAndroid;
  static bool get isIOS => Platform.isIOS;
}
