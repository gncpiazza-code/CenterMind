import 'dart:io';

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/config/build_info.dart';
import '../../core/update/app_update_info.dart';
import '../../core/update/app_update_service.dart';
import '../../core/utils/device_profile.dart';
import '../../theme/shelfy_tokens.dart';

/// Pantalla de Ajustes — toggle cámara nativa + actualización APK + versión.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool? _nativeCameraOverride;
  bool _useNativeCamera = true;
  bool _loading = true;

  AppUpdateInfo? _updateInfo;
  bool _checkingUpdate = false;
  bool _downloadingUpdate = false;
  String? _installedVersionLabel;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final override = await DeviceProfile.getNativeCameraOverride();
    final useNative = await DeviceProfile.shouldUseNativeCamera();
    final pkg = await PackageInfo.fromPlatform();
    if (!mounted) return;
    setState(() {
      _nativeCameraOverride = override;
      _useNativeCamera = useNative;
      _installedVersionLabel = '${pkg.version} (${pkg.buildNumber}) · ${BuildInfo.tag}';
      _loading = false;
    });
    if (Platform.isAndroid) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _checkForUpdate(silent: true);
      });
    }
  }

  Future<void> _checkForUpdate({bool silent = false}) async {
    if (!Platform.isAndroid) return;
    setState(() => _checkingUpdate = true);
    try {
      final api = context.read<ApiClient>();
      final info = await AppUpdateService(api).checkForUpdate();
      if (!mounted) return;
      setState(() {
        _updateInfo = info;
        _checkingUpdate = false;
      });
      if (!silent && !info.updateAvailable && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ya tenés la última versión instalada')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _checkingUpdate = false);
      if (!silent) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo verificar actualizaciones: $e')),
        );
      }
    }
  }

  Future<void> _installUpdate() async {
    final url = _updateInfo?.downloadUrl;
    if (url == null || url.isEmpty) return;
    setState(() => _downloadingUpdate = true);
    try {
      final api = context.read<ApiClient>();
      await AppUpdateService(api).downloadAndInstall(url);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al descargar/instalar: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _downloadingUpdate = false);
    }
  }

  Future<void> _toggleNativeCamera(bool value) async {
    await DeviceProfile.setNativeCameraOverride(useNative: value);
    setState(() {
      _nativeCameraOverride = value;
      _useNativeCamera = value;
    });
  }

  Future<void> _clearOverride() async {
    await DeviceProfile.clearNativeCameraFlags();
    final useNative = await DeviceProfile.shouldUseNativeCamera();
    if (!mounted) return;
    setState(() {
      _nativeCameraOverride = null;
      _useNativeCamera = useNative;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ShelfyTokens.bg,
      appBar: AppBar(
        backgroundColor: ShelfyTokens.bg,
        title: const Text(
          'Ajustes',
          style: TextStyle(
            color: ShelfyTokens.text,
            fontWeight: FontWeight.w700,
          ),
        ),
        iconTheme: const IconThemeData(color: ShelfyTokens.text),
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _SectionHeader(label: 'App'),
                _SettingsTile(
                  title: 'Versión instalada',
                  subtitle: _installedVersionLabel ??
                      '${BuildInfo.versionLabel} · ${BuildInfo.tag}',
                  trailing: const SizedBox.shrink(),
                ),
                if (Platform.isAndroid) ...[
                  const SizedBox(height: 8),
                  _SettingsTile(
                    title: 'Actualización SHELFYAPP',
                    subtitle: _updateSubtitle(),
                    trailing: _updateTrailing(),
                  ),
                  if (_updateInfo?.updateAvailable == true &&
                      (_updateInfo?.changelog.isNotEmpty ?? false)) ...[
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: ShelfyTokens.panel,
                        borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
                        border: Border.all(color: ShelfyTokens.border),
                      ),
                      child: Text(
                        _updateInfo!.changelog,
                        style: const TextStyle(
                          fontSize: 12,
                          color: ShelfyTokens.muted,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ],
                const SizedBox(height: 16),
                _SectionHeader(label: 'Cámara'),
                _SettingsTile(
                  title: 'Usar cámara del sistema',
                  subtitle: DeviceProfile.isIOS
                      ? 'No disponible en iOS — siempre se usa cámara Flutter'
                      : _useNativeCamera
                          ? (_nativeCameraOverride == null
                              ? 'Recomendado en Android gama baja (Xiaomi, etc.)'
                              : 'Activado — cámara del sistema')
                          : 'Desactivado — preview Flutter (más lento en gama baja)',
                  trailing: DeviceProfile.isIOS
                      ? const SizedBox.shrink()
                      : Switch(
                          value: _useNativeCamera,
                          onChanged: _toggleNativeCamera,
                          activeThumbColor: ShelfyTokens.primary,
                        ),
                ),
                if (!DeviceProfile.isIOS && _nativeCameraOverride != null) ...[
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: _clearOverride,
                    icon: const Icon(Icons.restart_alt, size: 16),
                    label: const Text('Restaurar auto-detección'),
                    style: TextButton.styleFrom(
                      foregroundColor: ShelfyTokens.muted,
                    ),
                  ),
                ],
              ],
            ),
    );
  }

  String _updateSubtitle() {
    if (_checkingUpdate) return 'Verificando…';
    final info = _updateInfo;
    if (info == null) return 'Tocá buscar para verificar en Shelfy';
    if (!info.updateAvailable) {
      return 'Estás al día · build ${info.currentBuild}';
    }
    final ver = info.versionName ?? info.latestVersionName ?? '?';
    final build = info.latestBuild ?? info.currentBuild;
    return 'Disponible $ver (build $build)${info.mandatory ? ' · obligatoria' : ''}';
  }

  Widget _updateTrailing() {
    if (_downloadingUpdate) {
      return const SizedBox(
        width: 24,
        height: 24,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }
    if (_updateInfo?.updateAvailable == true) {
      return FilledButton(
        onPressed: _installUpdate,
        style: FilledButton.styleFrom(
          backgroundColor: ShelfyTokens.primary,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
        child: const Text('Instalar', style: TextStyle(fontSize: 12)),
      );
    }
    return TextButton(
      onPressed: _checkingUpdate ? null : () => _checkForUpdate(),
      child: Text(_checkingUpdate ? '…' : 'Buscar'),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String label;
  const _SectionHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: ShelfyTokens.muted,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget trailing;

  const _SettingsTile({
    required this.title,
    required this.subtitle,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: ShelfyTokens.panel,
        borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        border: Border.all(color: ShelfyTokens.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: ShelfyTokens.text,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(fontSize: 12, color: ShelfyTokens.muted),
                ),
              ],
            ),
          ),
          trailing,
        ],
      ),
    );
  }
}
