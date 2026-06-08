import 'dart:io';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import 'capture_provider.dart';
import 'models/post_upload_summary.dart';
import 'widgets/camera_capture_widget.dart';

/// Pantalla de captura: cámara abierta por defecto, PDV después de la foto.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  final TextEditingController _manualNroController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _startBackgroundGps());
  }

  @override
  void dispose() {
    _manualNroController.dispose();
    super.dispose();
  }

  Future<void> _startBackgroundGps() async {
    final provider = context.read<CaptureProvider>();
    try {
      var status = await Permission.locationWhenInUse.status;
      if (status.isDenied) {
        status = await Permission.locationWhenInUse.request();
      }
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

  /// Abre image_picker para agregar una foto adicional desde galería.
  Future<void> _pickAdditionalPhoto(CaptureProvider provider) async {
    try {
      final xfile = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
      );
      if (xfile != null) {
        provider.addPhoto(File(xfile.path));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo abrir la galería')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CaptureProvider>(
      builder: (context, provider, _) {
        switch (provider.currentStep) {
          case CaptureStep.camera:
            return _buildCameraStep(context, provider);
          case CaptureStep.pdvConfirm:
            return _buildPdvConfirm(context, provider);
          case CaptureStep.manualInput:
            return _buildManualInput(context, provider);
          case CaptureStep.ingresoChoice:
            return _buildIngresoChoice(context, provider);
          case CaptureStep.uploading:
            return _buildUploading();
          case CaptureStep.success:
            return _buildSuccess(context, provider);
        }
      },
    );
  }

  Widget _buildCameraStep(BuildContext context, CaptureProvider provider) {
    return ColoredBox(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          CameraCaptureWidget(
            onPhotoTaken: provider.onPhotoTaken,
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  if (provider.nearbyLoading)
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white70,
                      ),
                    )
                  else if (provider.detectedPdv != null)
                    Expanded(
                      child: Text(
                        'PDV cercano: ${provider.detectedPdv!.nombreDisplay}',
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    )
                  else
                    const Expanded(
                      child: Text(
                        'Sin PDV detectado — ingresarás el NRO al capturar',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ────────────────────────────────────────────────────────────────
  // Galería de miniaturas de fotos capturadas con botón "×" y contador
  // ────────────────────────────────────────────────────────────────

  Widget _buildPhotoStrip(CaptureProvider provider) {
    final photos = provider.photos;
    if (photos.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              '${provider.photoCount}/$kMaxPhotosPerExhibicion fotos',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: provider.photoCount >= kMaxPhotosPerExhibicion
                        ? Colors.orange
                        : null,
                  ),
            ),
            const Spacer(),
            if (provider.canAddMorePhotos)
              TextButton.icon(
                onPressed: () => _pickAdditionalPhoto(provider),
                icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                label: const Text('Agregar foto'),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 80,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: photos.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              return Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(
                      photos[index],
                      width: 80,
                      height: 80,
                      fit: BoxFit.cover,
                    ),
                  ),
                  // Botón "×" para eliminar la foto
                  Positioned(
                    top: 2,
                    right: 2,
                    child: GestureDetector(
                      onTap: () => provider.removePhoto(index),
                      child: Container(
                        width: 22,
                        height: 22,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.black54,
                        ),
                        child: const Icon(
                          Icons.close,
                          size: 14,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                  // Indicador de foto principal (primera)
                  if (index == 0)
                    Positioned(
                      bottom: 2,
                      left: 2,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 4, vertical: 1),
                        decoration: BoxDecoration(
                          color: Colors.black45,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'Principal',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _buildPdvConfirm(BuildContext context, CaptureProvider provider) {
    final pdv = provider.detectedPdv!;
    return _buildSheetScaffold(
      context,
      title: '¿Es este PDV?',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildPhotoStrip(provider),
          Card(
            child: ListTile(
              leading: const Icon(Icons.store_rounded),
              title: Text(
                pdv.nombreDisplay,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              subtitle: Text(
                'NRO: ${pdv.idClienteErp} · ${pdv.distanciaM.toStringAsFixed(0)} m',
              ),
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: provider.confirmDetectedPdv,
            child: const Text('Sí, es correcto'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: provider.rejectDetectedPdv,
            child: const Text('No, ingresar otro NRO'),
          ),
          TextButton(
            onPressed: provider.backToCamera,
            child: const Text('Volver a tomar foto'),
          ),
        ],
      ),
    );
  }

  Widget _buildManualInput(BuildContext context, CaptureProvider provider) {
    return _buildSheetScaffold(
      context,
      title: 'Ingresá el NRO de cliente',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildPhotoStrip(provider),
          TextField(
            controller: _manualNroController,
            keyboardType: TextInputType.number,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Número de cliente ERP',
              hintText: 'Ej: 1234',
              prefixIcon: Icon(Icons.numbers),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              final nro = _manualNroController.text.trim();
              if (nro.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Ingresá un número válido')),
                );
                return;
              }
              provider.confirmManualNro(nro);
            },
            child: const Text('Continuar'),
          ),
          TextButton(
            onPressed: provider.backToCamera,
            child: const Text('Volver a tomar foto'),
          ),
        ],
      ),
    );
  }

  Widget _buildIngresoChoice(BuildContext context, CaptureProvider provider) {
    return _buildSheetScaffold(
      context,
      title: 'Tipo de visita',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.store_outlined),
            title: Text(provider.pdvDisplayName),
            subtitle: Text('NRO: ${provider.nroCliente}'),
          ),
          const SizedBox(height: 8),
          _buildPhotoStrip(provider),
          FilledButton.icon(
            // Botón deshabilitado si no hay fotos (mínimo 1 requerido)
            onPressed: (provider.isUploading || !provider.hasPhotos)
                ? null
                : () => provider.selectIngreso(conIngreso: true),
            icon: const Icon(Icons.login),
            label: const Text('Comercio con ingreso'),
          ),
          const SizedBox(height: 10),
          FilledButton.tonalIcon(
            onPressed: (provider.isUploading || !provider.hasPhotos)
                ? null
                : () => provider.selectIngreso(conIngreso: false),
            icon: const Icon(Icons.storefront_outlined),
            label: const Text('Comercio sin ingreso'),
          ),
          if (provider.errorMessage != null) ...[
            const SizedBox(height: 16),
            Text(
              provider.errorMessage!,
              style: const TextStyle(color: Colors.red),
            ),
          ],
          TextButton(
            onPressed: provider.backToCamera,
            child: const Text('Cancelar y retomar foto'),
          ),
        ],
      ),
    );
  }

  Widget _buildSheetScaffold(
    BuildContext context, {
    required String title,
    required Widget child,
  }) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: child,
      ),
    );
  }

  Widget _buildUploading() {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 20),
            Text(
              'Enviando exhibición...',
              style: TextStyle(fontSize: 16, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }

  // ────────────────────────────────────────────────────────────────
  // Pantalla de éxito con BottomSheet de confirmación rica
  // ────────────────────────────────────────────────────────────────

  Widget _buildSuccess(BuildContext context, CaptureProvider provider) {
    final result = provider.lastResult;
    final isOffline = result == null;

    // Mostrar el bottom sheet rico cuando los datos están disponibles.
    // Se hace con addPostFrameCallback para evitar setState durante build.
    if (!isOffline && provider.postUploadSummary != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _showRichConfirmationSheet(context, provider);
        }
      });
    }

    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isOffline
                    ? Icons.schedule_send_outlined
                    : Icons.check_circle_outline,
                size: 80,
                color: isOffline ? Colors.orange : Colors.green,
              ),
              const SizedBox(height: 20),
              Text(
                isOffline ? 'Guardado sin conexión' : '¡Exhibición registrada!',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                isOffline
                    ? 'Se enviará automáticamente al recuperar conexión.'
                    : 'Total del mes: ${result.statsSummary.exhibicionesLogicas} exhibiciones lógicas.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.grey, fontSize: 15),
              ),
              // Loading indicator mientras se cargan los datos del post-upload
              if (!isOffline && provider.postUploadSummary == null) ...[
                const SizedBox(height: 24),
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Cargando resumen...',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: () {
                  _manualNroController.clear();
                  provider.reset();
                  _startBackgroundGps();
                },
                icon: const Icon(Icons.add_a_photo_outlined),
                label: const Text('Nueva captura'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Muestra el BottomSheet de confirmación rica con historial PDV,
  /// stats del mes y badge de objetivo (si existe).
  void _showRichConfirmationSheet(
      BuildContext context, CaptureProvider provider) {
    final summary = provider.postUploadSummary;
    if (summary == null) return;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RichConfirmationSheet(
        summary: summary,
        pdvName: provider.pdvDisplayName,
        nroCliente: provider.nroCliente,
        onCapturarOtro: () {
          Navigator.of(context).pop();
          _manualNroController.clear();
          provider.reset();
          _startBackgroundGps();
        },
        onVerStats: () {
          Navigator.of(context).pop();
          // Navegar a la pestaña de estadísticas (index 2 en el BottomNav)
          // Se usa un simple pop ya que el scaffold de la app maneja el router.
          _manualNroController.clear();
          provider.reset();
          // La navegación a /stats la gestiona el BottomNavigationBar del home.
          // Aquí se emite el reset para que el home vuelva al estado limpio y
          // el usuario pueda tocar el tab de stats manualmente.
        },
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────
// Widget del BottomSheet de confirmación rica post-upload
// ────────────────────────────────────────────────────────────────

class _RichConfirmationSheet extends StatelessWidget {
  final PostUploadSummary summary;
  final String pdvName;
  final String nroCliente;
  final VoidCallback onCapturarOtro;
  final VoidCallback onVerStats;

  const _RichConfirmationSheet({
    required this.summary,
    required this.pdvName,
    required this.nroCliente,
    required this.onCapturarOtro,
    required this.onVerStats,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Handle
              Padding(
                padding: const EdgeInsets.only(top: 12, bottom: 4),
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.onSurfaceVariant.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  children: [
                    // Header con check verde
                    Row(
                      children: [
                        const Icon(Icons.check_circle,
                            color: Colors.green, size: 32),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '¡Exhibición registrada!',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                pdvName.isNotEmpty
                                    ? pdvName
                                    : 'NRO: $nroCliente',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Badge estadísticas del mes
                    _StatsBadge(
                      exhibicionesLogicas: summary.statsMes.exhibicionesLogicas,
                      puntos: summary.statsMes.puntos,
                    ),

                    // Badge objetivo (si existe)
                    if (summary.objetivoBadge != null) ...[
                      const SizedBox(height: 12),
                      _ObjetivoBadgeWidget(badge: summary.objetivoBadge!),
                    ],

                    const SizedBox(height: 20),

                    // Historial del PDV
                    if (summary.historialPdv.isNotEmpty) ...[
                      Text(
                        'Historial de este PDV',
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ...summary.historialPdv
                          .take(5)
                          .map((item) => _HistorialRow(item: item)),
                    ],

                    const SizedBox(height: 28),

                    // Botones de acción
                    FilledButton.icon(
                      onPressed: onCapturarOtro,
                      icon: const Icon(Icons.add_a_photo_outlined),
                      label: const Text('Capturar otro PDV'),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: onVerStats,
                      icon: const Icon(Icons.bar_chart_outlined),
                      label: const Text('Ver mis stats'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Badge con exhibiciones lógicas y puntos del mes.
class _StatsBadge extends StatelessWidget {
  final int exhibicionesLogicas;
  final int puntos;

  const _StatsBadge(
      {required this.exhibicionesLogicas, required this.puntos});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _StatItem(
            label: 'Exhibiciones',
            value: '$exhibicionesLogicas',
            icon: Icons.storefront_outlined,
          ),
          Container(
            width: 1,
            height: 36,
            color: theme.colorScheme.onPrimaryContainer.withOpacity(0.2),
          ),
          _StatItem(
            label: 'Puntos',
            value: '$puntos',
            icon: Icons.star_outline_rounded,
          ),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _StatItem(
      {required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.onPrimaryContainer;
    return Column(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.titleLarge
              ?.copyWith(fontWeight: FontWeight.bold, color: color),
        ),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(color: color),
        ),
      ],
    );
  }
}

/// Badge de progreso de objetivo activo.
class _ObjetivoBadgeWidget extends StatelessWidget {
  final ObjetivoBadge badge;

  const _ObjetivoBadgeWidget({required this.badge});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pct = (badge.progresoPct / 100).clamp(0.0, 1.0);
    final color = pct >= 1.0
        ? Colors.green
        : pct >= 0.7
            ? Colors.orange
            : theme.colorScheme.primary;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        border: Border.all(
            color: theme.colorScheme.outlineVariant, width: 1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.flag_outlined, size: 16),
              const SizedBox(width: 6),
              Text(
                'Objetivo ${badge.tipo}',
                style: theme.textTheme.labelMedium
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              const Spacer(),
              Text(
                '${badge.progresoPct.toStringAsFixed(1)}%',
                style: theme.textTheme.labelMedium?.copyWith(
                    color: color, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor:
                  theme.colorScheme.surfaceContainerHighest,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Fila del historial de visitas al PDV.
class _HistorialRow extends StatelessWidget {
  final HistorialPdvItem item;

  const _HistorialRow({required this.item});

  static Color _colorForEstado(String estado) {
    switch (estado.toLowerCase()) {
      case 'destacado':
        return Colors.purple;
      case 'aprobado':
        return Colors.green;
      case 'rechazado':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _colorForEstado(item.estado);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              item.fecha,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              item.estado,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
