import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import '../api/api_client.dart';
import '../config/app_config.dart';
import 'app_update_info.dart';

/// Chequeo y descarga de APK interno vía API Shelfy.
class AppUpdateService {
  AppUpdateService(this._api);

  final ApiClient _api;

  static const Duration _downloadTimeout = Duration(minutes: 10);

  Future<AppUpdateInfo> checkForUpdate() async {
    if (!Platform.isAndroid) {
      final info = await PackageInfo.fromPlatform();
      return AppUpdateInfo.none(
        flavor: AppConfig.flavor,
        currentBuild: int.tryParse(info.buildNumber) ?? 0,
      );
    }

    final info = await PackageInfo.fromPlatform();
    final build = int.tryParse(info.buildNumber) ?? 0;
    final flavor = Uri.encodeQueryComponent(AppConfig.flavor);
    final json = await _api.get(
      '/api/vendedor-app/releases/latest?flavor=$flavor&build_number=$build',
    );
    return AppUpdateInfo.fromJson(json);
  }

  Future<void> downloadAndInstall(String downloadUrl) async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('La instalación in-app solo está disponible en Android');
    }

    final uri = Uri.parse(downloadUrl);
    final response = await http.get(uri).timeout(_downloadTimeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Error descargando APK (${response.statusCode})');
    }

    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/shelfy-update-${DateTime.now().millisecondsSinceEpoch}.apk');
    await file.writeAsBytes(response.bodyBytes, flush: true);

    final result = await OpenFilex.open(
      file.path,
      type: 'application/vnd.android.package-archive',
    );
    if (result.type != ResultType.done) {
      throw Exception(result.message.isNotEmpty ? result.message : 'No se pudo abrir el instalador');
    }
  }
}
