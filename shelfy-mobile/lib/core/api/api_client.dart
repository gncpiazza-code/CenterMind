import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

/// Excepción lanzada cuando el backend responde con código HTTP no-2xx.
class ApiException implements Exception {
  final int statusCode;
  final String message;
  final Map<String, dynamic>? body;

  const ApiException({
    required this.statusCode,
    required this.message,
    this.body,
  });

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Cliente HTTP centralizado para Shelfy.
/// Agrega automáticamente los headers de autenticación y gestión de errores.
class ApiClient {
  static const Duration _timeout = Duration(seconds: 20);

  final String? _baseUrlOverride;
  String? _jwt;
  String? _deviceId;
  void Function()? _onUnauthorized;

  String? _cuentaId;

  ApiClient({String? baseUrl}) : _baseUrlOverride = baseUrl;

  /// Cuenta activa del patrón (query param `cuenta` en endpoints móviles).
  void setCuentaId(String? cuentaId) {
    if (cuentaId == null ||
        cuentaId.isEmpty ||
        cuentaId == 'equipo') {
      _cuentaId = null;
      return;
    }
    _cuentaId = cuentaId;
  }

  String scopedPath(String path) {
    if (_cuentaId == null) return path;
    final sep = path.contains('?') ? '&' : '?';
    return '$path${sep}cuenta=${Uri.encodeQueryComponent(_cuentaId!)}';
  }

  /// Registra callback que se invoca cuando el servidor responde 401.
  void setUnauthorizedCallback(void Function() callback) {
    _onUnauthorized = callback;
  }

  String get baseUrl => _baseUrl;

  String get _baseUrl => _baseUrlOverride ?? AppConfig.baseUrl;

  void setAuth({required String jwt, required String deviceId}) {
    _jwt = jwt;
    _deviceId = deviceId;
  }

  void clearAuth() {
    _jwt = null;
    _deviceId = null;
  }

  Map<String, String> _headers({bool multipart = false}) {
    final headers = <String, String>{
      if (!multipart) 'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_jwt != null) headers['Authorization'] = 'Bearer $_jwt';
    if (_deviceId != null) headers['X-Device-Id'] = _deviceId!;
    return headers;
  }

  Uri _uri(String path) {
    final base = _baseUrl.endsWith('/') ? _baseUrl.substring(0, _baseUrl.length - 1) : _baseUrl;
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$normalizedPath');
  }

  String _errorMessage(Map<String, dynamic>? errorBody, int statusCode) {
    final detail = errorBody?['detail'];
    if (detail is String && detail.isNotEmpty) return detail;
    if (detail is List) {
      final parts = detail
          .map((item) {
            if (item is Map && item['msg'] != null) return item['msg'].toString();
            return item.toString();
          })
          .where((s) => s.isNotEmpty)
          .toList();
      if (parts.isNotEmpty) return parts.join('. ');
    }
    final message = errorBody?['message'];
    if (message is String && message.isNotEmpty) return message;
    return 'Error $statusCode';
  }

  Future<http.Response> _send(Future<http.Response> Function() request) async {
    try {
      return await request().timeout(_timeout);
    } on TimeoutException {
      throw ApiException(
        statusCode: 0,
        message: 'Timeout conectando a $_baseUrl',
      );
    } on SocketException catch (e) {
      throw ApiException(
        statusCode: 0,
        message: 'Sin conexión a $_baseUrl (${e.message})',
      );
    } on http.ClientException catch (e) {
      throw ApiException(
        statusCode: 0,
        message: 'Error de red: ${e.message}',
      );
    }
  }

  Future<Map<String, dynamic>> _handleResponse(http.Response response) async {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return {};
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) return decoded;
      throw ApiException(
        statusCode: 500,
        message: 'Respuesta JSON inválida del servidor',
      );
    }
    if (response.statusCode == 401) {
      _onUnauthorized?.call();
      throw const ApiException(
        statusCode: 401,
        message: 'Sesión expirada. Reactivá tu cuenta con la clave sapp_...',
      );
    }
    Map<String, dynamic>? errorBody;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) errorBody = decoded;
    } catch (_) {}
    throw ApiException(
      statusCode: response.statusCode,
      message: _errorMessage(errorBody, response.statusCode),
      body: errorBody,
    );
  }

  Future<void> pingHealth() async {
    final response = await _send(
      () => http.get(_uri('/health'), headers: _headers()),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        statusCode: response.statusCode,
        message: 'Backend no disponible (${response.statusCode})',
      );
    }
  }

  /// GET a un path relativo al baseUrl.
  Future<Map<String, dynamic>> get(String path) async {
    final response = await _send(
      () => http.get(_uri(scopedPath(path)), headers: _headers()),
    );
    return _handleResponse(response);
  }

  /// GET a un path que retorna una lista JSON.
  Future<List<dynamic>> getList(String path) async {
    final response = await _send(
      () => http.get(_uri(scopedPath(path)), headers: _headers()),
    );
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return [];
      final decoded = jsonDecode(response.body);
      if (decoded is List) return decoded;
      if (decoded is Map<String, dynamic>) {
        return (decoded['items'] as List<dynamic>?) ??
            (decoded['objetivos'] as List<dynamic>?) ??
            (decoded['pdvs'] as List<dynamic>?) ??
            [];
      }
      return [];
    }
    Map<String, dynamic>? errorBody;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) errorBody = decoded;
    } catch (_) {}
    throw ApiException(
      statusCode: response.statusCode,
      message: _errorMessage(errorBody, response.statusCode),
      body: errorBody,
    );
  }

  /// POST JSON a un path relativo al baseUrl.
  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _send(
      () => http.post(
        _uri(scopedPath(path)),
        headers: _headers(),
        body: jsonEncode(body),
      ),
    );
    return _handleResponse(response);
  }

  /// GET a un path que retorna bytes crudos (ej. PDF).
  Future<List<int>> getBytes(String path) async {
    final response = await _send(
      () => http.get(_uri(scopedPath(path)), headers: _headers()),
    );
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.bodyBytes;
    }
    Map<String, dynamic>? errorBody;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) errorBody = decoded;
    } catch (_) {}
    throw ApiException(
      statusCode: response.statusCode,
      message: _errorMessage(errorBody, response.statusCode),
      body: errorBody,
    );
  }

  /// POST multipart (foto + campos). Todas las fotos usan el field `photos`.
  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required Map<String, String> fields,
    required List<File> files,
    String fileField = 'photos',
  }) async {
    final request = http.MultipartRequest('POST', _uri(scopedPath(path)));
    request.headers.addAll(_headers(multipart: true));
    request.fields.addAll(fields);
    for (final file in files) {
      request.files.add(
        await http.MultipartFile.fromPath(fileField, file.path),
      );
    }
    try {
      final streamed = await request.send().timeout(_timeout);
      final response = await http.Response.fromStream(streamed);
      return _handleResponse(response);
    } on TimeoutException {
      throw ApiException(
        statusCode: 0,
        message: 'Timeout conectando a $_baseUrl',
      );
    } on SocketException catch (e) {
      throw ApiException(
        statusCode: 0,
        message: 'Sin conexión a $_baseUrl (${e.message})',
      );
    } on http.ClientException catch (e) {
      throw ApiException(
        statusCode: 0,
        message: 'Error de red: ${e.message}',
      );
    }
  }
}
