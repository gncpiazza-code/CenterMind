/// Resultado de GET /api/vendedor-app/releases/latest
class AppUpdateInfo {
  final bool updateAvailable;
  final String flavor;
  final int currentBuild;
  final int? latestBuild;
  final String? versionName;
  final String? latestVersionName;
  final String? downloadUrl;
  final String changelog;
  final bool mandatory;
  final int? downloadExpiresInS;

  const AppUpdateInfo({
    required this.updateAvailable,
    required this.flavor,
    required this.currentBuild,
    this.latestBuild,
    this.versionName,
    this.latestVersionName,
    this.downloadUrl,
    this.changelog = '',
    this.mandatory = false,
    this.downloadExpiresInS,
  });

  factory AppUpdateInfo.none({String flavor = 'tabaco', int currentBuild = 0}) {
    return AppUpdateInfo(
      updateAvailable: false,
      flavor: flavor,
      currentBuild: currentBuild,
    );
  }

  factory AppUpdateInfo.fromJson(Map<String, dynamic> json) {
    return AppUpdateInfo(
      updateAvailable: json['update_available'] == true,
      flavor: (json['flavor'] as String?) ?? 'tabaco',
      currentBuild: (json['current_build'] as num?)?.toInt() ?? 0,
      latestBuild: (json['latest_build'] as num?)?.toInt(),
      versionName: json['version_name'] as String?,
      latestVersionName: json['latest_version_name'] as String?,
      downloadUrl: json['download_url'] as String?,
      changelog: (json['changelog'] as String?) ?? '',
      mandatory: json['mandatory'] == true,
      downloadExpiresInS: (json['download_expires_in_s'] as num?)?.toInt(),
    );
  }
}
