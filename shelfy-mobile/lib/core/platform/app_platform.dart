import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

/// Plataforma reportada al backend en /auth/activate.
String get appPlatform {
  if (kIsWeb) return 'android';
  if (Platform.isIOS) return 'ios';
  if (Platform.isAndroid) return 'android';
  return 'ios';
}
