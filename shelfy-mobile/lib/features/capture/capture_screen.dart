import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import 'capture_provider.dart';
import 'widgets/camera_capture_widget.dart';

/// Pantalla de captura: cámara abierta por defecto, PDV después de la foto.
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

  Widget _buildPdvConfirm(BuildContext context, CaptureProvider provider) {
    final pdv = provider.detectedPdv!;
    return _buildSheetScaffold(
      context,
      title: '¿Es este PDV?',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (provider.photos.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.file(
                provider.photos.first,
                height: 180,
                fit: BoxFit.cover,
              ),
            ),
          const SizedBox(height: 16),
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
          if (provider.photos.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.file(
                provider.photos.first,
                height: 140,
                fit: BoxFit.cover,
              ),
            ),
          const SizedBox(height: 16),
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
          FilledButton.icon(
            onPressed: provider.isUploading
                ? null
                : () => provider.selectIngreso(conIngreso: true),
            icon: const Icon(Icons.login),
            label: const Text('Comercio con ingreso'),
          ),
          const SizedBox(height: 10),
          FilledButton.tonalIcon(
            onPressed: provider.isUploading
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

  Widget _buildSuccess(BuildContext context, CaptureProvider provider) {
    final result = provider.lastResult;
    final isOffline = result == null;

    return Scaffold(
      body: Center(
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
}
