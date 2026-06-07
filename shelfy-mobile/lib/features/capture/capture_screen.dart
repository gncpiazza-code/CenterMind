import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import 'capture_provider.dart';
import 'widgets/pdv_search_widget.dart';
import 'widgets/photo_capture_widget.dart';
import 'widgets/tipo_pdv_selector.dart';

/// Pantalla principal del flujo de captura de exhibiciones.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  final TextEditingController _manualNroController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initGps());
  }

  @override
  void dispose() {
    _manualNroController.dispose();
    super.dispose();
  }

  Future<void> _initGps() async {
    final provider = context.read<CaptureProvider>();

    try {
      // Verificar y solicitar permiso de ubicación
      var status = await Permission.location.status;
      if (status.isDenied) {
        status = await Permission.location.request();
      }

      if (!status.isGranted) {
        if (mounted) provider.onGpsFailed();
        return;
      }

      final locationEnabled = await Geolocator.isLocationServiceEnabled();
      if (!locationEnabled) {
        if (mounted) provider.onGpsFailed();
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );

      if (mounted) {
        provider.onGpsReady(position.latitude, position.longitude);
      }
    } catch (_) {
      if (mounted) provider.onGpsFailed();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CaptureProvider>(
      builder: (context, provider, _) {
        return Scaffold(
          body: _buildBody(context, provider),
        );
      },
    );
  }

  Widget _buildBody(BuildContext context, CaptureProvider provider) {
    switch (provider.currentStep) {
      case CaptureStep.gpsLoading:
        return _buildGpsLoading();
      case CaptureStep.pdvSelection:
        return _buildPdvSelection(context, provider);
      case CaptureStep.manualInput:
        return _buildManualInput(context, provider);
      case CaptureStep.pdvConfirmed:
        return _buildPdvConfirmed(context, provider);
      case CaptureStep.photoCapture:
        return _buildPhotoCapture(context, provider);
      case CaptureStep.typeSelection:
        return _buildTypeSelection(context, provider);
      case CaptureStep.reviewAndSubmit:
        return _buildReviewAndSubmit(context, provider);
      case CaptureStep.uploading:
        return _buildUploading();
      case CaptureStep.success:
        return _buildSuccess(context, provider);
    }
  }

  // ── Paso 1: Cargando GPS ──────────────────────────────────────────────────

  Widget _buildGpsLoading() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 20),
          Text(
            'Obteniendo ubicación...',
            style: TextStyle(fontSize: 16, color: Colors.grey),
          ),
        ],
      ),
    );
  }

  // ── Paso 2: Selección de PDV ──────────────────────────────────────────────

  Widget _buildPdvSelection(BuildContext context, CaptureProvider provider) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildStepHeader(context, 'Seleccionar PDV', step: 1, total: 4),
          const PdvSearchWidget(),
        ],
      ),
    );
  }

  // ── Paso 3: Ingreso manual ────────────────────────────────────────────────

  Widget _buildManualInput(BuildContext context, CaptureProvider provider) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildStepHeader(context, 'Ingresar NRO de cliente', step: 1, total: 4),
          const SizedBox(height: 24),
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
                  const SnackBar(
                    content: Text('Ingresá un número de cliente válido'),
                  ),
                );
                return;
              }
              provider.confirmManualNro(nro);
            },
            child: const Text('Confirmar'),
          ),
          const SizedBox(height: 12),
          if (provider.currentLat != null)
            TextButton(
              onPressed: () => setState(() {
                _manualNroController.clear();
                provider.onGpsReady(provider.currentLat!, provider.currentLng!);
              }),
              child: const Text('Volver a lista de PDVs cercanos'),
            ),
        ],
      ),
    );
  }

  // ── Paso 4: PDV confirmado ────────────────────────────────────────────────

  Widget _buildPdvConfirmed(BuildContext context, CaptureProvider provider) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildStepHeader(context, 'PDV seleccionado', step: 1, total: 4),
          const SizedBox(height: 24),
          Card(
            child: ListTile(
              leading: const Icon(Icons.store_rounded, size: 36),
              title: Text(
                provider.pdvDisplayName,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              subtitle: Text('NRO: ${provider.nroCliente}'),
              trailing: IconButton(
                icon: const Icon(Icons.edit_outlined),
                tooltip: 'Cambiar PDV',
                onPressed: () {
                  if (provider.currentLat != null) {
                    provider.onGpsReady(
                      provider.currentLat!,
                      provider.currentLng!,
                    );
                  } else {
                    provider.goToManualInput();
                  }
                },
              ),
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => provider.goToPhotoCapture(),
            icon: const Icon(Icons.camera_alt_outlined),
            label: const Text('Continuar a fotos'),
          ),
        ],
      ),
    );
  }

  // ── Paso 5: Captura de fotos ──────────────────────────────────────────────

  Widget _buildPhotoCapture(BuildContext context, CaptureProvider provider) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildStepHeader(context, 'Tomar fotos', step: 2, total: 4),
          const PhotoCaptureWidget(),
          if (provider.photos.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: FilledButton.icon(
                onPressed: () => provider.goToTypeSelection(),
                icon: const Icon(Icons.arrow_forward),
                label: const Text('Continuar'),
              ),
            ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  // ── Paso 6: Selección de tipo ─────────────────────────────────────────────

  Widget _buildTypeSelection(BuildContext context, CaptureProvider provider) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildStepHeader(context, 'Tipo de PDV', step: 3, total: 4),
          const SizedBox(height: 8),
          const TipoPdvSelector(),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextButton.icon(
              onPressed: () => provider.goBackToPhotoCapture(),
              icon: const Icon(Icons.arrow_back),
              label: const Text('Volver a fotos'),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  // ── Paso 7: Revisión y envío ──────────────────────────────────────────────

  Widget _buildReviewAndSubmit(BuildContext context, CaptureProvider provider) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildStepHeader(context, 'Confirmar y enviar', step: 4, total: 4),
          const SizedBox(height: 16),
          // PDV
          _buildReviewRow(
            icon: Icons.store_outlined,
            label: 'PDV',
            value: '${provider.pdvDisplayName} (NRO: ${provider.nroCliente})',
          ),
          const Divider(height: 24),
          // Tipo
          _buildReviewRow(
            icon: Icons.category_outlined,
            label: 'Tipo',
            value: provider.selectedTipo ?? '-',
          ),
          const Divider(height: 24),
          // Fotos
          _buildReviewRow(
            icon: Icons.photo_library_outlined,
            label: 'Fotos',
            value: '${provider.photos.length} foto${provider.photos.length == 1 ? '' : 's'}',
          ),
          if (provider.photos.isNotEmpty) ...[
            const SizedBox(height: 8),
            SizedBox(
              height: 80,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: provider.photos.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(
                      provider.photos[index],
                      width: 80,
                      height: 80,
                      fit: BoxFit.cover,
                    ),
                  );
                },
              ),
            ),
          ],
          if (provider.errorMessage != null) ...[
            const SizedBox(height: 16),
            Text(
              'Error: ${provider.errorMessage}',
              style: const TextStyle(color: Colors.red),
            ),
          ],
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => provider.submit(),
            icon: const Icon(Icons.upload),
            label: const Text('Enviar exhibición'),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => provider.goToTypeSelection(),
            child: const Text('Cambiar tipo de PDV'),
          ),
        ],
      ),
    );
  }

  // ── Paso 8: Subiendo ──────────────────────────────────────────────────────

  Widget _buildUploading() {
    return const Center(
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
    );
  }

  // ── Paso 9: Éxito ─────────────────────────────────────────────────────────

  Widget _buildSuccess(BuildContext context, CaptureProvider provider) {
    final result = provider.lastResult;
    final isOffline = result == null;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isOffline ? Icons.schedule_send_outlined : Icons.check_circle_outline,
              size: 80,
              color: isOffline ? Colors.orange : Colors.green,
            ),
            const SizedBox(height: 20),
            Text(
              isOffline
                  ? 'Guardado sin conexión'
                  : '¡Exhibición registrada!',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              isOffline
                  ? 'La exhibición se enviará automáticamente cuando recuperes conexión.'
                  : 'Total del mes: ${result.statsSummary.exhibicionesLogicas} exhibiciones lógicas.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.grey, fontSize: 15),
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: () => provider.reset(),
              icon: const Icon(Icons.add_a_photo_outlined),
              label: const Text('Nueva captura'),
            ),
          ],
        ),
      ),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  Widget _buildStepHeader(
    BuildContext context,
    String title, {
    required int step,
    required int total,
  }) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Paso $step de $total',
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: step / total),
        ],
      ),
    );
  }

  Widget _buildReviewRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: Colors.grey),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style:
                    const TextStyle(fontSize: 12, color: Colors.grey),
              ),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
