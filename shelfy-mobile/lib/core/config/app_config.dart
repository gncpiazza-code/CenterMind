import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Configuración global de la app.
class AppConfig {
  static const String _schemeDefine = String.fromEnvironment(
    'API_SCHEME',
    defaultValue: '',
  );
  static const String _hostDefine = String.fromEnvironment(
    'API_HOST',
    defaultValue: '',
  );
  static const String _portDefine = String.fromEnvironment(
    'API_PORT',
    defaultValue: '',
  );
  static const String _legacyBaseUrlDefine = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );
  static const String flavor = String.fromEnvironment(
    'FLAVOR',
    defaultValue: 'tabaco',
  );

  static const String prodBaseUrl = 'https://api.shelfycenter.com';

  static String _baseUrl = _resolveInitialBaseUrl();
  static bool _loaded = false;

  static String get baseUrl => _baseUrl;

  static const int sessionCacheTtlMs = 3600000;

  /// Simulador iOS expone SIMULATOR_RUNTIME_VERSION; el iPhone físico no.
  static bool get isIosSimulator {
    if (kIsWeb || !Platform.isIOS) return false;
    return Platform.environment.containsKey('SIMULATOR_RUNTIME_VERSION');
  }

  static bool get isPhysicalIosDevice =>
      !kIsWeb && Platform.isIOS && !isIosSimulator;

  static Future<void> ensureLoaded() async {
    if (_loaded) return;
    _loaded = true;

    if (!Platform.isIOS) return;

    // iPhone físico: localhost siempre es el teléfono, nunca el Mac.
    if (isPhysicalIosDevice) {
      if (_hostDefine.isNotEmpty) {
        final compiled = _composeUrl(
          scheme: _schemeDefine.isEmpty ? 'https' : _schemeDefine,
          host: _hostDefine,
          port: _portDefine,
        );
        if (_isValidHttpUrl(compiled) && !_isLocalHostUrl(compiled)) {
          _baseUrl = compiled;
          return;
        }
      }

      // iPhone físico: Railway/prod por defecto (no depender del Mac en LAN).
      final fromAsset = await _loadAssetBaseUrl(
        const ['assets/config/prod-device.json'],
        fallback: prodBaseUrl,
      );
      _baseUrl = fromAsset;
      return;
    }

    // Simulador: localhost → Mac.
    if (isIosSimulator && _baseUrl == prodBaseUrl) {
      _baseUrl = await _loadAssetBaseUrl(
        const ['assets/config/dev-simulator.json'],
        fallback: 'http://127.0.0.1:8000',
      );
    }
  }

  static Future<String> _loadAssetBaseUrl(
    List<String> assetPaths, {
    required String fallback,
  }) async {
    for (final assetPath in assetPaths) {
      try {
        final raw = await rootBundle.loadString(assetPath);
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final candidate = _fromConfigMap(json);
        if (_isValidHttpUrl(candidate) && !_isBlockedOnDevice(candidate)) {
          return candidate;
        }
      } catch (_) {}
    }
    return fallback;
  }

  static bool _isBlockedOnDevice(String url) =>
      isPhysicalIosDevice && _isLocalHostUrl(url);

  static bool _isLocalHostUrl(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null) return false;
    return uri.host == '127.0.0.1' || uri.host == 'localhost';
  }

  static String _resolveInitialBaseUrl() {
    if (_legacyBaseUrlDefine.isNotEmpty) {
      final fixed = _repairMalformedUrl(_legacyBaseUrlDefine);
      if (_isValidHttpUrl(fixed)) return fixed;
    }

    if (_hostDefine.isNotEmpty) {
      return _composeUrl(
        scheme: _schemeDefine.isEmpty ? 'https' : _schemeDefine,
        host: _hostDefine,
        port: _portDefine,
      );
    }

    return prodBaseUrl;
  }

  static String _fromConfigMap(Map<String, dynamic> json) {
    final legacy = json['API_BASE_URL'] as String?;
    if (legacy != null && legacy.isNotEmpty) {
      final fixed = _repairMalformedUrl(legacy);
      if (_isValidHttpUrl(fixed)) return fixed;
    }

    final scheme = (json['API_SCHEME'] as String?)?.trim();
    final host = (json['API_HOST'] as String?)?.trim();
    final port = json['API_PORT']?.toString().trim() ?? '';

    if (host != null && host.isNotEmpty) {
      return _composeUrl(
        scheme: (scheme == null || scheme.isEmpty) ? 'https' : scheme,
        host: host,
        port: port,
      );
    }

    return _baseUrl;
  }

  static String _composeUrl({
    required String scheme,
    required String host,
    required String port,
  }) {
    final normalizedScheme = scheme.replaceAll(':', '');
    final normalizedHost = host.trim();
    if (port.isEmpty) {
      return '$normalizedScheme://$normalizedHost';
    }
    return '$normalizedScheme://$normalizedHost:$port';
  }

  static String _repairMalformedUrl(String raw) {
    final trimmed = raw.trim();
    if (trimmed.contains('://')) return trimmed.replaceAll(RegExp(r'/+$'), '');

    final match = RegExp(
      r'^(https?)(?:://)?(\d{1,3}(?:\.\d{1,3}){3}|[a-zA-Z0-9.-]+)(?::(\d+))?$',
    ).firstMatch(trimmed.replaceFirst('://', ''));
    if (match == null) return trimmed;

    final scheme = match.group(1)!;
    final host = match.group(2)!;
    final port = match.group(3) ?? '';
    return _composeUrl(scheme: scheme, host: host, port: port);
  }

  static bool _isValidHttpUrl(String value) {
    if (value.isEmpty) return false;
    final uri = Uri.tryParse(value);
    if (uri == null) return false;
    if (uri.scheme != 'http' && uri.scheme != 'https') return false;
    if (uri.host.isEmpty) return false;
    return true;
  }
}
