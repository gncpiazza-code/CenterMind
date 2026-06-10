import 'dart:io';

import 'package:camera/camera.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Perfil de dispositivo para SHELFYAPP — vendedores en Android gama baja.
abstract final class DeviceProfile {
  static const _kUseNativeCamera = 'use_native_camera_override';
  static const _kSlowCameraDetected = 'slow_camera_detected';

  /// Android gama baja: preview más liviano. iOS: más calidad.
  static ResolutionPreset get cameraPreset =>
      Platform.isAndroid ? ResolutionPreset.medium : ResolutionPreset.high;

  static bool get isAndroid => Platform.isAndroid;
  static bool get isIOS => Platform.isIOS;

  /// True si debe usarse cámara nativa (gama baja auto-detectada o toggle manual).
  /// iOS siempre retorna false — Flutter preview es mejor en Apple.
  static Future<bool> shouldUseNativeCamera() async {
    if (Platform.isIOS) return false;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.containsKey(_kUseNativeCamera)) {
      return prefs.getBool(_kUseNativeCamera) ?? false;
    }
    return prefs.getBool(_kSlowCameraDetected) ?? false;
  }

  /// Toggle manual desde Ajustes — sobrescribe la auto-detección.
  static Future<void> setNativeCameraOverride({required bool useNative}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kUseNativeCamera, useNative);
  }

  /// True si el usuario tiene override manual activo (para mostrar en Ajustes).
  static Future<bool?> getNativeCameraOverride() async {
    final prefs = await SharedPreferences.getInstance();
    if (!prefs.containsKey(_kUseNativeCamera)) return null;
    return prefs.getBool(_kUseNativeCamera);
  }

  /// Llamar cuando el primer disparo tardó > 800 ms — activa fallback automático.
  static Future<void> markSlowCameraDetected() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kSlowCameraDetected, true);
  }

  static Future<void> clearNativeCameraFlags() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kUseNativeCamera);
    await prefs.remove(_kSlowCameraDetected);
  }
}
