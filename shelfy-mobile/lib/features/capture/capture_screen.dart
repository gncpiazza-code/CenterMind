import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../../shared/widgets/shelfy/shelfy_widgets.dart';
import '../../theme/shelfy_tokens.dart';
import 'capture_provider.dart';
import 'models/pdv_candidate.dart';
import 'widgets/camera_capture_widget.dart';

/// Pantalla de captura — un solo Scaffold/Stack.
///
/// Estructura:
///   Z0  Cámara siempre visible de fondo
///   Z1  Barra superior: GPS status + foto counter
///   Z2  (usado por CameraCaptureWidget para shutter)
///   Z3  ShelfyGlassPanel deslizable — todo el flujo PDV/ingreso/éxito
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen>
    with SingleTickerProviderStateMixin {
  final TextEditingController _searchController = TextEditingController();
  final GlobalKey<CameraCaptureWidgetState> _cameraKey =
      GlobalKey<CameraCaptureWidgetState>();
  late AnimationController _sheetAnim;
  late Animation<Offset> _sheetSlide;
  CaptureProvider? _captureProvider;
  CaptureOverlayPhase? _lastAnimatedPhase;
  bool _capturing = false;

  @override
  void initState() {
    super.initState();
    _sheetAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _sheetSlide = Tween<Offset>(
      begin: const Offset(0, 1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _sheetAnim, curve: Curves.easeOutCubic));

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _startBackgroundGps();
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
      _syncSheetToPhase(provider.phase);
    }
  }

  void _onProviderPhaseChanged() {
    if (!mounted) return;
    _syncSheetToPhase(_captureProvider?.phase);
  }

  void _syncSheetToPhase(CaptureOverlayPhase? phase) {
    if (phase == null || _lastAnimatedPhase == phase) return;
    _lastAnimatedPhase = phase;
    final showSheet = phase != CaptureOverlayPhase.live;
    if (showSheet) {
      _sheetAnim.forward();
    } else {
      _sheetAnim.reverse();
    }
  }

  @override
  void dispose() {
    _captureProvider?.removeListener(_onProviderPhaseChanged);
    _searchController.dispose();
    _sheetAnim.dispose();
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
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 12),
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
        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            fit: StackFit.expand,
            children: [
              // Z0: Cámara a pantalla completa (solo con tab activo)
              Positioned.fill(
                child: CameraCaptureWidget(
                  key: _cameraKey,
                  onPhotoTaken: provider.onPhotoTaken,
                  onCapturingChanged: (c) {
                    if (mounted) setState(() => _capturing = c);
                  },
                ),
              ),

              // Shutter sobre bottom nav (no tapado por el hub)
              Positioned(
                left: 0,
                right: 0,
                bottom: kBottomNavigationBarHeight +
                    MediaQuery.paddingOf(context).bottom +
                    12,
                child: Center(
                  child: ShelfyCaptureShutter(
                    loading: _capturing,
                    onTap: provider.phase == CaptureOverlayPhase.uploading
                        ? null
                        : () => _cameraKey.currentState?.takePhoto(),
                  ),
                ),
              ),

              // Atenuar cámara durante upload
              if (provider.phase == CaptureOverlayPhase.uploading)
                Positioned.fill(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.55),
                  ),
                ),

              // Z1: Barra superior — GPS status + contador fotos
              _TopBar(provider: provider),

              // Z3: Sheet de overlay con las fases
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: SlideTransition(
                  position: _sheetSlide,
                  child: _OverlaySheet(
                    provider: provider,
                    searchController: _searchController,
                    onReset: _resetAndRefresh,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  final CaptureProvider provider;

  const _TopBar({required this.provider});

  @override
  Widget build(BuildContext context) {
    final photos = provider.photoCount;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            // GPS hint
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.50),
                  borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (provider.nearbyLoading)
                      const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white70,
                        ),
                      )
                    else
                      Icon(
                        provider.nearbyPdvs.isNotEmpty
                            ? Icons.location_on_rounded
                            : Icons.location_off_rounded,
                        size: 14,
                        color: provider.nearbyPdvs.isNotEmpty
                            ? ShelfyTokens.primary
                            : Colors.white38,
                      ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        provider.nearbyLoading
                            ? 'Buscando PDVs cercanos...'
                            : provider.nearbyPdvs.isNotEmpty
                                ? '${provider.nearbyPdvs.length} PDV${provider.nearbyPdvs.length > 1 ? 's' : ''} cerca'
                                : 'Sin PDVs en 100 m',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Contador de fotos (solo si hay)
            if (photos > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: ShelfyTokens.primary.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
                ),
                child: Text(
                  '$photos/$kMaxPhotosPerExhibicion',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ],
        ),
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
      case CaptureOverlayPhase.postPhoto:
        return _PostPhotoContent(
          provider: provider,
          searchController: searchController,
          onBack: () => provider.backToCamera(),
        );
      case CaptureOverlayPhase.confirmPdv:
        return _ConfirmPdvContent(
          provider: provider,
          onBack: provider.backToPostPhoto,
        );
      case CaptureOverlayPhase.ingreso:
        return _IngresoContent(provider: provider);
      case CaptureOverlayPhase.uploading:
        return const _UploadingContent();
      case CaptureOverlayPhase.done:
        return _DoneContent(
          provider: provider,
          onReset: onReset,
        );
      case CaptureOverlayPhase.live:
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

// ─── Miniatura de fotos capturadas ────────────────────────────────────────────

class _PhotoStrip extends StatelessWidget {
  final CaptureProvider provider;

  const _PhotoStrip({required this.provider});

  @override
  Widget build(BuildContext context) {
    final photos = provider.photoFiles;
    if (photos.isEmpty) return const SizedBox.shrink();

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
          height: 72,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: photos.length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (context, index) {
              return Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(
                      photos[index],
                      width: 72,
                      height: 72,
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
                          color: Colors.black.withValues(alpha: 0.55),
                        ),
                        child: const Icon(Icons.close, size: 12, color: Colors.white),
                      ),
                    ),
                  ),
                  if (index == 0)
                    Positioned(
                      bottom: 2,
                      left: 2,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 4, vertical: 1),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'Principal',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 8,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 10),
      ],
    );
  }
}

// ─── Fase postPhoto ───────────────────────────────────────────────────────────

class _PostPhotoContent extends StatelessWidget {
  final CaptureProvider provider;
  final TextEditingController searchController;
  final VoidCallback onBack;

  const _PostPhotoContent({
    required this.provider,
    required this.searchController,
    required this.onBack,
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
          _PhotoStrip(provider: provider),

          // PDVs cercanos como chips
          if (provider.nearbyPdvs.isNotEmpty) ...[
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

          // Botón volver
          const SizedBox(height: 8),
          TextButton(
            onPressed: onBack,
            child: const Text('Volver a tomar foto'),
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

        // Entrada manual de NRO (solo si no hay resultados y hay texto numérico)
        if (controller.text.isNotEmpty &&
            !provider.searchLoading &&
            provider.searchResults.isEmpty &&
            RegExp(r'^\d+$').hasMatch(controller.text.trim())) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              final nro = controller.text.trim();
              controller.clear();
              provider.confirmManualNro(nro);
            },
            icon: const Icon(Icons.add_circle_outline, size: 18),
            label: Text('Usar NRO ${controller.text.trim()} (no en padrón)'),
            style: OutlinedButton.styleFrom(
              foregroundColor: ShelfyTokens.primary,
              side: const BorderSide(color: ShelfyTokens.primary),
            ),
          ),
        ],
      ],
    );
  }
}

// ─── Fase confirmPdv ──────────────────────────────────────────────────────────

class _ConfirmPdvContent extends StatelessWidget {
  final CaptureProvider provider;
  final VoidCallback onBack;

  const _ConfirmPdvContent({required this.provider, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final pdv = provider.selectedPdv!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const _SheetHandle(),
          _PhotoStrip(provider: provider),

          // Resumen PDV seleccionado
          Container(
            padding: const EdgeInsets.all(12),
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
                  child: const Icon(
                    Icons.store_rounded,
                    color: ShelfyTokens.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        pdv.nombreDisplay.isNotEmpty
                            ? pdv.nombreDisplay
                            : 'NRO ${pdv.idClienteErp}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          color: ShelfyTokens.text,
                        ),
                      ),
                      Text(
                        'NRO ${pdv.idClienteErp}'
                        '${pdv.distanciaM > 0 ? ' · ${pdv.distanciaM.toStringAsFixed(0)} m' : ''}',
                        style: const TextStyle(
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

          // Otra foto (si hay cupo) — colapsa el sheet y vuelve a la cámara sin resetear PDV
          if (provider.canAddMorePhotos)
            OutlinedButton.icon(
              onPressed: provider.addExtraPhoto,
              icon: const Icon(Icons.add_a_photo_outlined, size: 18),
              label: const Text('Agregar otra foto'),
              style: OutlinedButton.styleFrom(
                foregroundColor: ShelfyTokens.primary,
                side: const BorderSide(color: ShelfyTokens.primary),
              ),
            ),
          if (provider.canAddMorePhotos) const SizedBox(height: 8),

          _ShelfyFilledButton(
            onPressed: provider.confirmPdv,
            label: 'Confirmar PDV',
            icon: Icons.check_rounded,
          ),

          const SizedBox(height: 6),
          TextButton(
            onPressed: onBack,
            child: const Text('Elegir otro PDV'),
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

          // Nombre del PDV
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(
              Icons.store_outlined,
              color: ShelfyTokens.primary,
            ),
            title: Text(
              provider.pdvDisplayName.isNotEmpty
                  ? provider.pdvDisplayName
                  : 'NRO: ${provider.nroCliente}',
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: ShelfyTokens.text,
              ),
            ),
            subtitle: Text(
              'NRO ${provider.nroCliente}',
              style: const TextStyle(fontSize: 12, color: ShelfyTokens.muted),
            ),
          ),

          _PhotoStrip(provider: provider),

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
            onPressed: provider.backToCamera,
            child: const Text('Cancelar y retomar foto'),
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
                  )
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

          // Banner éxito
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

          const SizedBox(height: 12),

          _ShelfyFilledButton(
            onPressed: onReset,
            label: 'Nueva captura',
            icon: Icons.add_a_photo_outlined,
          ),
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
