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
  final String _baseUrl;
  String? _jwt;
  String? _deviceId;

  ApiClient({String? baseUrl})
      : _baseUrl = baseUrl ?? AppConfig.baseUrl;

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

  Uri _uri(String path) => Uri.parse('$_baseUrl$path');

  Future<Map<String, dynamic>> _handleResponse(http.Response response) async {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return {};
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    Map<String, dynamic>? errorBody;
    try {
      errorBody = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {}
    final message = errorBody?['detail'] as String? ??
        errorBody?['message'] as String? ??
        'Error ${response.statusCode}';
    throw ApiException(
      statusCode: response.statusCode,
      message: message,
      body: errorBody,
    );
  }

  /// GET a un path relativo al baseUrl.
  Future<Map<String, dynamic>> get(String path) async {
    final response = await http.get(_uri(path), headers: _headers());
    return _handleResponse(response);
  }

  /// GET a un path que retorna una lista JSON.
  Future<List<dynamic>> getList(String path) async {
    final response = await http.get(_uri(path), headers: _headers());
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return [];
      final decoded = jsonDecode(response.body);
      if (decoded is List) return decoded;
      // Si el backend envuelve en { "items": [...] }
      if (decoded is Map<String, dynamic>) {
        return (decoded['items'] as List<dynamic>?) ?? [];
      }
      return [];
    }
    Map<String, dynamic>? errorBody;
    try {
      errorBody = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {}
    final message = errorBody?['detail'] as String? ??
        errorBody?['message'] as String? ??
        'Error ${response.statusCode}';
    throw ApiException(
      statusCode: response.statusCode,
      message: message,
      body: errorBody,
    );
  }

  /// POST JSON a un path relativo al baseUrl.
  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await http.post(
      _uri(path),
      headers: _headers(),
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }

  /// POST multipart (foto + campos).
  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required Map<String, String> fields,
    required List<MapEntry<String, File>> files,
  }) async {
    final request = http.MultipartRequest('POST', _uri(path));
    request.headers.addAll(_headers(multipart: true));
    request.fields.addAll(fields);
    for (final entry in files) {
      request.files
          .add(await http.MultipartFile.fromPath(entry.key, entry.value.path));
    }
    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    return _handleResponse(response);
  }
}
