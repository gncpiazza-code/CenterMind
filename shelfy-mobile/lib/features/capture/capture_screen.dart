import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../../core/config/build_info.dart';
import '../../theme/shelfy_tokens.dart';
import '../home/home_tab_controller.dart';
import 'capture_provider.dart';
import 'models/pdv_candidate.dart';
import 'widgets/camera_capture_widget.dart';

/// Pantalla de captura — un solo Scaffold/Stack.
///
/// Estructura:
///   Z0  Cámara siempre en fondo
///   Z1  Barra superior: GPS chip + N/6 + Listo (solo burstLive)
///   Z2  Filmstrip sobre shutter (solo burstLive con fotos)
///   Z3  ShelfyGlassPanel sheet — sube solo después de "Listo"
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  final TextEditingController _searchController = TextEditingController();
  final GlobalKey<CameraCaptureWidgetState> _cameraKey =
      GlobalKey<CameraCaptureWidgetState>();
  CaptureProvider? _captureProvider;
  CaptureOverlayPhase? _lastPhase;

  /// NRO pendiente de Cartera CTA — se pre-llena al abrir la fase assignPdv.
  String? _pendingPdvNro;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _startBackgroundGps();
      _pendingPdvNro =
          context.read<HomeTabController>().takePendingCapturePdvNro();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final provider = context.read<CaptureProvider>();
    if (_captureProvider != provider) {
      _captureProvider?.removeListener(_onProviderPhaseChanged);
      _captureProvider = provider;
      provider.addListener(_onProviderPhaseChanged);
      _onProviderPhaseChanged();
    }
  }

  void _onProviderPhaseChanged() {
    if (!mounted) return;
    final phase = _captureProvider?.phase;
    if (phase == null || _lastPhase == phase) return;
    _lastPhase = phase;
    // Al entrar en assignPdv: pre-fill de Cartera CTA si hay pendiente
    if (phase == CaptureOverlayPhase.assignPdv && _pendingPdvNro != null) {
      final nro = _pendingPdvNro!;
      _pendingPdvNro = null;
      _searchController.text = nro;
      _captureProvider?.searchPdv(nro);
    }
    setState(() {});
  }

  @override
  void dispose() {
    _captureProvider?.removeListener(_onProviderPhaseChanged);
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _startBackgroundGps() async {
    if (!mounted) return;
    final provider = context.read<CaptureProvider>();
    try {
      var status = await Permission.locationWhenInUse.status;
      if (status.isDenied) status = await Permission.locationWhenInUse.request();
      if (!status.isGranted) {
        provider.onGpsUnavailable();
        return;
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        provider.onGpsUnavailable();
        return;
      }
      final last = await Geolocator.getLastKnownPosition();
      if (last != null && mounted) {
        await provider.refreshNearbyPdvs(
          lat: last.latitude,
          lng: last.longitude,
        );
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 6),
        ),
      );
      if (mounted) {
        await provider.refreshNearbyPdvs(
          lat: position.latitude,
          lng: position.longitude,
        );
      }
    } catch (_) {
      if (mounted) provider.onGpsUnavailable();
    }
  }

  void _resetAndRefresh() {
    _searchController.clear();
    context.read<CaptureProvider>().reset();
    _startBackgroundGps();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CaptureProvider>(
      builder: (context, provider, _) {
        final bottomPad = MediaQuery.paddingOf(context).bottom;
        final isBurst = provider.phase == CaptureOverlayPhase.burstLive;

        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              // Z0: Cámara a pantalla completa
              Positioned.fill(
                child: CameraCaptureWidget(
                  key: _cameraKey,
                  onPhotoTaken: provider.onPhotoTaken,
                  onCapturingChanged: (_) {},
                  photoCount: provider.photoCount,
                  lastKnownLat: provider.currentLat,
                  lastKnownLng: provider.currentLng,
                ),
              ),

              // Atenuar cámara cuando el sheet está activo
              if (!isBurst)
                Positioned.fill(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.40),
                  ),
                ),

              // Atenuar extra durante upload
              if (provider.phase == CaptureOverlayPhase.uploading)
                Positioned.fill(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.15),
                  ),
                ),

              // Z1: Barra superior GPS + N/6 + Listo (solo en burst)
              if (isBurst)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          // GPS status chip — nunca en Center, siempre top-left
                          _GpsStatusChip(provider: provider),
                          if (provider.photoCount == 0) ...[
                            const SizedBox(width: 8),
                            Text(
                              BuildInfo.tag,
                              style: TextStyle(
                                fontSize: 9,
                                color: Colors.white.withValues(alpha: 0.45),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                          const Spacer(),
                          // Contador N/6 — visible desde foto 1
                          if (provider.photoCount > 0) ...[
                            _PhotoCounterPill(
                              count: provider.photoCount,
                              atMax: !provider.canAddMorePhotos,
                            ),
                            const SizedBox(width: 10),
                          ],
                          // Botón Listo — habilitado desde foto 1
                          _ListoButton(
                            enabled: provider.hasPhotos,
                            onTap: provider.finishBurst,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // Z2: Filmstrip sobre el shutter (solo burst con fotos)
              if (isBurst && provider.hasPhotos)
                Positioned(
                  bottom: 120 + bottomPad + 8,
                  left: 16,
                  right: 16,
                  child: _BurstFilmstrip(provider: provider),
                ),

              // Z3: Sheet solo post-Listo (nunca durante burst — evita GPU + taps accidentales)
              if (!isBurst)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: _OverlaySheet(
                    provider: provider,
                    searchController: _searchController,
                    onReset: _resetAndRefresh,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

// ─── GPS status chip (top — nunca overlay central) ────────────────────────────

class _GpsStatusChip extends StatelessWidget {
  final CaptureProvider provider;
  const _GpsStatusChip({required this.provider});

  @override
  Widget build(BuildContext context) {
    String label;
    Color color;
    IconData icon;

    if (provider.nearbyLoading) {
      label = 'GPS...';
      color = Colors.white54;
      icon = Icons.gps_not_fixed;
    } else if (provider.gpsAvailable && provider.nearbyPdvs.isNotEmpty) {
      label = '${provider.nearbyPdvs.length} cercanos';
      color = Colors.white70;
      icon = Icons.location_on_rounded;
    } else if (provider.gpsAvailable) {
      label = 'Sin PDVs cerca';
      color = Colors.white38;
      icon = Icons.location_searching;
    } else {
      label = 'Sin GPS';
      color = Colors.white38;
      icon = Icons.location_off_outlined;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: color,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Photo counter pill (top-left) ────────────────────────────────────────────

class _PhotoCounterPill extends StatelessWidget {
  final int count;
  final bool atMax;
  const _PhotoCounterPill({required this.count, required this.atMax});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: atMax
            ? ShelfyTokens.warning.withValues(alpha: 0.8)
            : Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: atMax
              ? ShelfyTokens.warning.withValues(alpha: 0.6)
              : Colors.white.withValues(alpha: 0.18),
        ),
      ),
      child: Text(
        '$count/$kMaxPhotosPerExhibicion',
        style: TextStyle(
          color: atMax ? Colors.black : Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

// ─── Botón Listo ──────────────────────────────────────────────────────────────

class _ListoButton extends StatelessWidget {
  final bool enabled;
  final VoidCallback onTap;
  const _ListoButton({required this.enabled, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        decoration: BoxDecoration(
          color: enabled ? Colors.white : Colors.white.withValues(alpha: 0.20),
          borderRadius: BorderRadius.circular(20),
          boxShadow: enabled
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.25),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Text(
          'Listo',
          style: TextStyle(
            color: enabled ? Colors.black : Colors.white38,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

// ─── Filmstrip sobre shutter (burst) ─────────────────────────────────────────

class _BurstFilmstrip extends StatelessWidget {
  final CaptureProvider provider;
  const _BurstFilmstrip({required this.provider});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        reverse: true, // Última foto a la derecha (Apple-like)
        itemCount: provider.photos.length,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (context, index) {
          final photo = provider.photos[index];
          return Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.file(
                  photo.file,
                  width: 64,
                  height: 64,
                  cacheWidth: 128,
                  cacheHeight: 128,
                  fit: BoxFit.cover,
                ),
              ),
              Positioned(
                top: 2,
                right: 2,
                child: GestureDetector(
                  onTap: () => provider.removePhoto(index),
                  child: Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.black.withValues(alpha: 0.65),
                    ),
                    child: const Icon(Icons.close, size: 12, color: Colors.white),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ─── Sheet de overlay ─────────────────────────────────────────────────────────

class _OverlaySheet extends StatelessWidget {
  final CaptureProvider provider;
  final TextEditingController searchController;
  final VoidCallback onReset;

  const _OverlaySheet({
    required this.provider,
    required this.searchController,
    required this.onReset,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(ShelfyTokens.radiusXl),
      ),
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: ShelfyTokens.panelBlur,
          sigmaY: ShelfyTokens.panelBlur,
        ),
        child: Container(
          decoration: BoxDecoration(
            color: ShelfyTokens.panel.withValues(alpha: ShelfyTokens.panelOpacity),
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(ShelfyTokens.radiusXl),
            ),
            border: const Border(
              top: BorderSide(color: ShelfyTokens.border),
            ),
          ),
          child: SafeArea(
            top: false,
            child: AnimatedSize(
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOutCubic,
              child: _sheetContent(context),
            ),
          ),
        ),
      ),
    );
  }

  Widget _sheetContent(BuildContext context) {
    switch (provider.phase) {
      case CaptureOverlayPhase.assignPdv:
        return _AssignPdvContent(
          provider: provider,
          searchController: searchController,
        );
      case CaptureOverlayPhase.suggestIngreso:
        return _SuggestIngresoContent(provider: provider);
      case CaptureOverlayPhase.ingreso:
        return _IngresoContent(provider: provider);
      case CaptureOverlayPhase.uploading:
        return const _UploadingContent();
      case CaptureOverlayPhase.done:
        return _DoneContent(
          provider: provider,
          onReset: onReset,
        );
      case CaptureOverlayPhase.burstLive:
        return const SizedBox.shrink();
    }
  }
}

// ─── Handle visual ────────────────────────────────────────────────────────────

class _SheetHandle extends StatelessWidget {
  const _SheetHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 40,
        height: 4,
        margin: const EdgeInsets.only(top: 10, bottom: 8),
        decoration: BoxDecoration(
          color: ShelfyTokens.border,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

// ─── Photo strip para fases post-burst ────────────────────────────────────────

class _PhotoStripSheet extends StatelessWidget {
  final CaptureProvider provider;
  const _PhotoStripSheet({required this.provider});

  @override
  Widget build(BuildContext context) {
    if (provider.photos.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              '${provider.photoCount}/$kMaxPhotosPerExhibicion fotos',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: provider.photoCount >= kMaxPhotosPerExhibicion
                    ? ShelfyTokens.warning
                    : ShelfyTokens.textSoft,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 56,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: provider.photos.length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (context, index) {
              return ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: Image.file(
                  provider.photos[index].file,
                  width: 56,
                  height: 56,
                  fit: BoxFit.cover,
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
      ],
    );
  }
}

// ─── Fase assignPdv ───────────────────────────────────────────────────────────

class _AssignPdvContent extends StatelessWidget {
  final CaptureProvider provider;
  final TextEditingController searchController;

  const _AssignPdvContent({
    required this.provider,
    required this.searchController,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const _SheetHandle(),

          // Fotos ya tomadas — solo miniatura compacta en el sheet
          _PhotoStripSheet(provider: provider),

          // PDVs cercanos como chips (dentro del sheet, nunca sobre cámara)
          if (provider.nearbyPdvs.isNotEmpty && searchController.text.isEmpty) ...[
            const Text(
              'PDVs cercanos',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: ShelfyTokens.textSoft,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: provider.nearbyPdvs.take(5).map((pdv) {
                return _PdvNearbyChip(
                  pdv: pdv,
                  onTap: () => provider.selectPdv(pdv),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 12),
          ],

          // Campo de búsqueda
          _PdvSearchField(
            controller: searchController,
            provider: provider,
          ),

          const SizedBox(height: 8),
          TextButton(
            onPressed: provider.backToBurst,
            child: const Text('← Volver a fotos'),
          ),
        ],
      ),
    );
  }
}

class _PdvNearbyChip extends StatelessWidget {
  final PdvCandidate pdv;
  final VoidCallback onTap;

  const _PdvNearbyChip({required this.pdv, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: ShelfyTokens.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
          border: Border.all(
            color: ShelfyTokens.primary.withValues(alpha: 0.35),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              pdv.nombreDisplay.isNotEmpty ? pdv.nombreDisplay : 'NRO ${pdv.idClienteErp}',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: ShelfyTokens.text,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              '${pdv.distanciaM.toStringAsFixed(0)} m · NRO ${pdv.idClienteErp}',
              style: const TextStyle(fontSize: 10, color: ShelfyTokens.primary),
            ),
          ],
        ),
      ),
    );
  }
}

class _PdvSearchField extends StatelessWidget {
  final TextEditingController controller;
  final CaptureProvider provider;

  const _PdvSearchField({
    required this.controller,
    required this.provider,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          controller: controller,
          onChanged: provider.searchPdv,
          keyboardType: TextInputType.text,
          textInputAction: TextInputAction.search,
          style: const TextStyle(fontSize: 14, color: ShelfyTokens.text),
          decoration: InputDecoration(
            hintText: 'Buscar por NRO o nombre de PDV...',
            hintStyle: const TextStyle(color: ShelfyTokens.muted, fontSize: 13),
            prefixIcon: const Icon(Icons.search, color: ShelfyTokens.primary, size: 20),
            suffixIcon: provider.searchLoading
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: ShelfyTokens.primary,
                      ),
                    ),
                  )
                : controller.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18, color: ShelfyTokens.muted),
                        onPressed: () {
                          controller.clear();
                          provider.clearSearch();
                        },
                      )
                    : null,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
              borderSide: const BorderSide(color: ShelfyTokens.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
              borderSide: const BorderSide(
                color: ShelfyTokens.primary,
                width: 1.5,
              ),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 12,
            ),
          ),
        ),

        // Resultados de búsqueda
        if (provider.searchResults.isNotEmpty) ...[
          const SizedBox(height: 4),
          Container(
            decoration: BoxDecoration(
              color: ShelfyTokens.panel,
              borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
              border: Border.all(color: ShelfyTokens.border),
            ),
            constraints: const BoxConstraints(maxHeight: 240),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: provider.searchResults.length,
              separatorBuilder: (_, _) => const Divider(
                height: 1,
                indent: 16,
                endIndent: 16,
              ),
              itemBuilder: (context, i) {
                final pdv = provider.searchResults[i];
                return ListTile(
                  dense: true,
                  leading: const Icon(
                    Icons.store_outlined,
                    size: 18,
                    color: ShelfyTokens.primary,
                  ),
                  title: Text(
                    pdv.nombreDisplay.isNotEmpty
                        ? pdv.nombreDisplay
                        : 'NRO ${pdv.idClienteErp}',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: ShelfyTokens.text,
                    ),
                  ),
                  subtitle: Text(
                    'NRO ${pdv.idClienteErp}'
                    '${pdv.nombreRazonSocial.isNotEmpty ? ' · ${pdv.nombreRazonSocial}' : ''}',
                    style: const TextStyle(fontSize: 11, color: ShelfyTokens.muted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () {
                    controller.clear();
                    provider.selectPdv(pdv);
                  },
                );
              },
            ),
          ),
        ],

        // Sin resultados: ofrecer pendiente + entrada manual
        if (controller.text.isNotEmpty &&
            !provider.searchLoading &&
            provider.searchResults.isEmpty) ...[
          const SizedBox(height: 8),
          if (provider.pendienteRegistrado)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: ShelfyTokens.warning.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
                border: Border.all(color: ShelfyTokens.warning.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.schedule_send_outlined, size: 16, color: ShelfyTokens.warning),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'NRO ${controller.text.trim()} registrado — pendiente de alta en padrón.',
                      style: const TextStyle(fontSize: 12, color: ShelfyTokens.warning),
                    ),
                  ),
                ],
              ),
            )
          else ...[
            OutlinedButton.icon(
              onPressed: () {
                final nro = controller.text.trim();
                provider.registerPendientePdv(
                  nro,
                  lat: provider.currentLat,
                  lng: provider.currentLng,
                );
              },
              icon: const Icon(Icons.bookmark_add_outlined, size: 18),
              label: Text('Registrar "${controller.text.trim()}" como pendiente'),
              style: OutlinedButton.styleFrom(
                foregroundColor: ShelfyTokens.warning,
                side: const BorderSide(color: ShelfyTokens.warning),
              ),
            ),
            if (RegExp(r'^\d+$').hasMatch(controller.text.trim())) ...[
              const SizedBox(height: 6),
              TextButton.icon(
                onPressed: () {
                  final nro = controller.text.trim();
                  controller.clear();
                  provider.confirmManualNro(nro);
                },
                icon: const Icon(Icons.add_circle_outline, size: 16),
                label: Text('Usar NRO ${controller.text.trim()} sin verificar'),
                style: TextButton.styleFrom(foregroundColor: ShelfyTokens.muted),
              ),
            ],
          ],
        ],
      ],
    );
  }
}

// ─── Fase suggestIngreso (memoria + countdown 5s) ─────────────────────────────

class _SuggestIngresoContent extends StatefulWidget {
  final CaptureProvider provider;
  const _SuggestIngresoContent({required this.provider});

  @override
  State<_SuggestIngresoContent> createState() => _SuggestIngresoContentState();
}

class _SuggestIngresoContentState extends State<_SuggestIngresoContent> {
  int _countdown = 5;
  bool _autoConfirmCancelled = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted || _autoConfirmCancelled) {
        t.cancel();
        return;
      }
      setState(() {
        _countdown--;
        if (_countdown <= 0) {
          t.cancel();
          widget.provider.confirmSuggestion();
        }
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tipo = widget.provider.suggestedTipo ?? '';
    final conIngreso = tipo.toLowerCase().contains('con');

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const _SheetHandle(),

          // PDV elegido
          _PdvSummaryTile(provider: widget.provider),
          const SizedBox(height: 12),

          // Banner memoria
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: ShelfyTokens.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
              border: Border.all(
                color: ShelfyTokens.primary.withValues(alpha: 0.25),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: ShelfyTokens.primary.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    conIngreso ? Icons.login_rounded : Icons.storefront_outlined,
                    color: ShelfyTokens.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Última visita: ${conIngreso ? "CON INGRESO" : "SIN INGRESO"}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          color: ShelfyTokens.text,
                        ),
                      ),
                      if (!_autoConfirmCancelled)
                        Text(
                          'Confirmando en ${_countdown}s...',
                          style: const TextStyle(
                            fontSize: 12,
                            color: ShelfyTokens.muted,
                          ),
                        )
                      else
                        const Text(
                          'Auto-avance cancelado',
                          style: TextStyle(
                            fontSize: 12,
                            color: ShelfyTokens.muted,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Acciones
          if (!_autoConfirmCancelled) ...[
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: widget.provider.overrideIngreso,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: ShelfyTokens.textSoft,
                      side: const BorderSide(color: ShelfyTokens.border),
                    ),
                    child: const Text('Cambiar'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() {
                      _autoConfirmCancelled = true;
                      _timer?.cancel();
                    }),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: ShelfyTokens.textSoft,
                      side: const BorderSide(color: ShelfyTokens.border),
                    ),
                    child: const Text('Cancelar auto'),
                  ),
                ),
              ],
            ),
          ] else ...[
            _ShelfyFilledButton(
              onPressed: widget.provider.confirmSuggestion,
              label: conIngreso ? 'Confirmar con ingreso' : 'Confirmar sin ingreso',
              icon: Icons.check_rounded,
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: widget.provider.overrideIngreso,
              style: OutlinedButton.styleFrom(
                foregroundColor: ShelfyTokens.textSoft,
                side: const BorderSide(color: ShelfyTokens.border),
              ),
              child: const Text('Cambiar tipo de visita'),
            ),
          ],

          const SizedBox(height: 6),
          TextButton(
            onPressed: widget.provider.backToAssignPdv,
            child: const Text('← Elegir otro PDV'),
          ),
        ],
      ),
    );
  }
}

// ─── Tile resumen PDV seleccionado ────────────────────────────────────────────

class _PdvSummaryTile extends StatelessWidget {
  final CaptureProvider provider;
  const _PdvSummaryTile({required this.provider});

  @override
  Widget build(BuildContext context) {
    final pdv = provider.selectedPdv;
    final nombre = pdv != null
        ? (pdv.nombreDisplay.isNotEmpty ? pdv.nombreDisplay : 'NRO ${pdv.idClienteErp}')
        : (provider.nroCliente.isNotEmpty ? 'NRO: ${provider.nroCliente}' : '');
    final sub = pdv != null ? 'NRO ${pdv.idClienteErp}' : '';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ShelfyTokens.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        border: Border.all(color: ShelfyTokens.primary.withValues(alpha: 0.20)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: ShelfyTokens.primary.withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.store_rounded, color: ShelfyTokens.primary, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  nombre,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: ShelfyTokens.text,
                  ),
                ),
                if (sub.isNotEmpty)
                  Text(
                    sub,
                    style: const TextStyle(fontSize: 12, color: ShelfyTokens.muted),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Fase ingreso ─────────────────────────────────────────────────────────────

class _IngresoContent extends StatelessWidget {
  final CaptureProvider provider;
  const _IngresoContent({required this.provider});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const _SheetHandle(),

          _PdvSummaryTile(provider: provider),
          const SizedBox(height: 12),

          _PhotoStripSheet(provider: provider),

          const Text(
            'Tipo de visita',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: ShelfyTokens.textSoft,
            ),
          ),
          const SizedBox(height: 10),

          _IngresoOptionButton(
            icon: Icons.login_rounded,
            label: 'Comercio con ingreso',
            subtitle: 'Entraste al local',
            onPressed: provider.isUploading || !provider.hasPhotos
                ? null
                : () => provider.selectIngreso(conIngreso: true),
            primary: true,
          ),
          const SizedBox(height: 8),
          _IngresoOptionButton(
            icon: Icons.storefront_outlined,
            label: 'Comercio sin ingreso',
            subtitle: 'Solo exterior / vitrina',
            onPressed: provider.isUploading || !provider.hasPhotos
                ? null
                : () => provider.selectIngreso(conIngreso: false),
            primary: false,
          ),

          if (provider.errorMessage != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: ShelfyTokens.error.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
                border: Border.all(
                  color: ShelfyTokens.error.withValues(alpha: 0.25),
                ),
              ),
              child: Text(
                provider.errorMessage!,
                style: const TextStyle(color: ShelfyTokens.error, fontSize: 13),
              ),
            ),
          ],

          const SizedBox(height: 6),
          TextButton(
            onPressed: provider.backToAssignPdv,
            child: const Text('← Elegir otro PDV'),
          ),
        ],
      ),
    );
  }
}

class _IngresoOptionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback? onPressed;
  final bool primary;

  const _IngresoOptionButton({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.onPressed,
    required this.primary,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return GestureDetector(
      onTap: onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: primary
              ? (enabled
                  ? ShelfyTokens.primary
                  : ShelfyTokens.primary.withValues(alpha: 0.4))
              : (enabled
                  ? ShelfyTokens.primary.withValues(alpha: 0.07)
                  : ShelfyTokens.primary.withValues(alpha: 0.03)),
          borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
          border: primary
              ? null
              : Border.all(
                  color: enabled
                      ? ShelfyTokens.primary.withValues(alpha: 0.4)
                      : ShelfyTokens.border,
                ),
          boxShadow: primary && enabled
              ? [
                  BoxShadow(
                    color: ShelfyTokens.primary.withValues(alpha: 0.30),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              color: primary
                  ? Colors.white
                  : (enabled ? ShelfyTokens.primary : ShelfyTokens.muted),
              size: 22,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: primary
                          ? Colors.white
                          : (enabled ? ShelfyTokens.text : ShelfyTokens.muted),
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 12,
                      color: primary
                          ? Colors.white.withValues(alpha: 0.8)
                          : (enabled
                              ? ShelfyTokens.textSoft
                              : ShelfyTokens.muted),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Fase uploading ───────────────────────────────────────────────────────────

class _UploadingContent extends StatelessWidget {
  const _UploadingContent();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SheetHandle(),
          SizedBox(height: 8),
          LinearProgressIndicator(
            color: ShelfyTokens.primary,
            backgroundColor: ShelfyTokens.border,
          ),
          SizedBox(height: 12),
          Text(
            'Enviando exhibición...',
            style: TextStyle(
              fontSize: 14,
              color: ShelfyTokens.textSoft,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Fase done ────────────────────────────────────────────────────────────────

class _DoneContent extends StatelessWidget {
  final CaptureProvider provider;
  final VoidCallback onReset;

  const _DoneContent({
    required this.provider,
    required this.onReset,
  });

  @override
  Widget build(BuildContext context) {
    final result = provider.lastResult;
    final isOffline = result == null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const _SheetHandle(),

          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: isOffline
                  ? ShelfyTokens.warning.withValues(alpha: 0.1)
                  : ShelfyTokens.success.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
              border: Border.all(
                color: isOffline
                    ? ShelfyTokens.warning.withValues(alpha: 0.3)
                    : ShelfyTokens.success.withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  isOffline
                      ? Icons.schedule_send_outlined
                      : Icons.check_circle_rounded,
                  color: isOffline ? ShelfyTokens.warning : ShelfyTokens.success,
                  size: 28,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isOffline
                            ? 'Guardado sin conexión'
                            : '¡Exhibición registrada!',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          color: isOffline
                              ? ShelfyTokens.warning
                              : ShelfyTokens.success,
                        ),
                      ),
                      Text(
                        isOffline
                            ? 'Se enviará al recuperar conexión.'
                            : 'Total mes: ${result.statsSummary.exhibicionesLogicas} exhibiciones lógicas.',
                        style: const TextStyle(
                          fontSize: 12,
                          color: ShelfyTokens.textSoft,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          if (!isOffline && provider.postUploadSummary != null) ...[
            const SizedBox(height: 12),
            _PostUploadRichSummary(summary: provider.postUploadSummary!),
          ],

          const SizedBox(height: 12),

          _ShelfyFilledButton(
            onPressed: onReset,
            label: 'Nueva visita',
            icon: Icons.add_a_photo_outlined,
          ),
        ],
      ),
    );
  }
}

// ─── Post-upload resumen rico ─────────────────────────────────────────────────

class _PostUploadRichSummary extends StatelessWidget {
  final dynamic summary;
  const _PostUploadRichSummary({required this.summary});

  @override
  Widget build(BuildContext context) {
    final historial = summary.historialPdv as List;
    final stats = summary.statsMes;
    final badge = summary.objetivoBadge;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ShelfyTokens.panel,
        borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        border: Border.all(color: ShelfyTokens.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.bar_chart, size: 14, color: ShelfyTokens.primary),
              const SizedBox(width: 6),
              Text(
                'Mes: ${stats.exhibicionesLogicas} exhibiciones · ${stats.puntos} pts',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: ShelfyTokens.text,
                ),
              ),
            ],
          ),
          if (badge != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(Icons.flag_outlined, size: 14, color: ShelfyTokens.primary),
                const SizedBox(width: 6),
                Text(
                  'Objetivo ${badge.tipo}: ${badge.progresoPct.toStringAsFixed(0)}%',
                  style: const TextStyle(fontSize: 12, color: ShelfyTokens.textSoft),
                ),
              ],
            ),
          ],
          if (historial.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Text(
              'Últimas visitas a este PDV',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: ShelfyTokens.muted,
              ),
            ),
            const SizedBox(height: 4),
            ...historial.take(3).map((h) => Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      color: ShelfyTokens.primary,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${h.fecha}  ·  ${h.estado}',
                    style: const TextStyle(fontSize: 11, color: ShelfyTokens.textSoft),
                  ),
                ],
              ),
            )),
          ],
        ],
      ),
    );
  }
}

// ─── Button helper ────────────────────────────────────────────────────────────

class _ShelfyFilledButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final String label;
  final IconData icon;

  const _ShelfyFilledButton({
    required this.onPressed,
    required this.label,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: ShelfyTokens.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 48),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        ),
      ),
    );
  }
}
