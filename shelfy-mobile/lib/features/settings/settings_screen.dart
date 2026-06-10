import 'package:flutter/material.dart';

import '../../core/utils/device_profile.dart';
import '../../theme/shelfy_tokens.dart';

/// Pantalla de Ajustes — toggle cámara nativa + configuración general.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool? _nativeCameraOverride;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final override = await DeviceProfile.getNativeCameraOverride();
    if (mounted) {
      setState(() {
        _nativeCameraOverride = override;
        _loading = false;
      });
    }
  }

  Future<void> _toggleNativeCamera(bool value) async {
    await DeviceProfile.setNativeCameraOverride(useNative: value);
    setState(() => _nativeCameraOverride = value);
  }

  Future<void> _clearOverride() async {
    await DeviceProfile.clearNativeCameraFlags();
    setState(() => _nativeCameraOverride = null);
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
                _SectionHeader(label: 'Cámara'),
                _SettingsTile(
                  title: 'Usar cámara del sistema',
                  subtitle: DeviceProfile.isIOS
                      ? 'No disponible en iOS — siempre se usa cámara Flutter'
                      : _nativeCameraOverride == null
                          ? 'Auto-detectado según rendimiento del dispositivo'
                          : _nativeCameraOverride!
                              ? 'Activado — se usa el intent de cámara del SO'
                              : 'Desactivado — se usa la cámara Flutter integrada',
                  trailing: DeviceProfile.isIOS
                      ? const SizedBox.shrink()
                      : Switch(
                          value: _nativeCameraOverride ?? false,
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
