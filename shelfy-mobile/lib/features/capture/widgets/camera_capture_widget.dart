import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../../theme/shelfy_tokens.dart';
import '../capture_provider.dart';
import '../models/capture_photo.dart';

/// Preview de cámara a pantalla completa — única fuente de fotos (sin galería).
/// Incluye toggle de flash (auto/on/off) y shutter con identidad Shelfy.
class CameraCaptureWidget extends StatefulWidget {
  final void Function(File photo, CapturePhotoMetadata metadata) onPhotoTaken;

  const CameraCaptureWidget({super.key, required this.onPhotoTaken});

  @override
  State<CameraCaptureWidget> createState() => _CameraCaptureWidgetState();
}

class _CameraCaptureWidgetState extends State<CameraCaptureWidget> {
  CameraController? _controller;
  bool _initializing = true;
  String? _error;
  bool _capturing = false;
  FlashMode _flashMode = FlashMode.auto;

  static const _flashModes = [FlashMode.auto, FlashMode.always, FlashMode.off];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _initCamera();
    });
  }

  Future<void> _initCamera() async {
    setState(() {
      _initializing = true;
      _error = null;
    });

    try {
      var status = await Permission.camera.status;
      if (status.isDenied) status = await Permission.camera.request();
      if (!status.isGranted) {
        setState(() {
          _error = 'Se necesita permiso de cámara.';
          _initializing = false;
        });
        return;
      }

      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() {
          _error = 'No hay cámara disponible en este dispositivo.';
          _initializing = false;
        });
        return;
      }

      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        back,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      await controller.setFlashMode(_flashMode);

      if (!mounted) {
        await controller.dispose();
        return;
      }

      setState(() {
        _controller = controller;
        _initializing = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudo abrir la cámara.';
        _initializing = false;
      });
    }
  }

  Future<void> _toggleFlash() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    final currentIdx = _flashModes.indexOf(_flashMode);
    final next = _flashModes[(currentIdx + 1) % _flashModes.length];
    try {
      await controller.setFlashMode(next);
      setState(() => _flashMode = next);
    } catch (_) {}
  }

  Future<void> _takePhoto() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized || _capturing) return;

    setState(() => _capturing = true);
    try {
      final metadata = await CaptureProvider.captureMetadataNow();
      final xfile = await controller.takePicture();
      widget.onPhotoTaken(File(xfile.path), metadata);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al tomar la foto')),
        );
      }
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  IconData get _flashIcon {
    switch (_flashMode) {
      case FlashMode.always:
        return Icons.flash_on_rounded;
      case FlashMode.off:
        return Icons.flash_off_rounded;
      default:
        return Icons.flash_auto_rounded;
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) {
      return const ColoredBox(
        color: Colors.black,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: Colors.white),
              SizedBox(height: 16),
              Text('Abriendo cámara...', style: TextStyle(color: Colors.white70)),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return ColoredBox(
        color: Colors.black,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.no_photography, size: 56, color: Colors.white54),
                const SizedBox(height: 16),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: _initCamera, child: const Text('Reintentar')),
              ],
            ),
          ),
        ),
      );
    }

    final controller = _controller!;
    return Stack(
      fit: StackFit.expand,
      children: [
        CameraPreview(controller),

        // Flash toggle — esquina superior derecha
        Positioned(
          top: 12,
          right: 16,
          child: SafeArea(
            child: GestureDetector(
              onTap: _toggleFlash,
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  shape: BoxShape.circle,
                ),
                child: Icon(_flashIcon, color: Colors.white, size: 20),
              ),
            ),
          ),
        ),

        // Shutter con halo violeta Shelfy
        Positioned(
          left: 0,
          right: 0,
          bottom: 40,
          child: Center(
            child: _ShelfyShutterButton(
              capturing: _capturing,
              onTap: _takePhoto,
            ),
          ),
        ),
      ],
    );
  }
}

class _ShelfyShutterButton extends StatefulWidget {
  final bool capturing;
  final VoidCallback onTap;

  const _ShelfyShutterButton({required this.capturing, required this.onTap});

  @override
  State<_ShelfyShutterButton> createState() => _ShelfyShutterButtonState();
}

class _ShelfyShutterButtonState extends State<_ShelfyShutterButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _pulse = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.capturing ? null : widget.onTap,
      child: AnimatedBuilder(
        animation: _pulse,
        builder: (_, _) => Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: ShelfyTokens.primary
                    .withValues(alpha: _pulse.value * 0.40),
                blurRadius: 22,
                spreadRadius: 4,
              ),
            ],
          ),
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 4),
              color: widget.capturing
                  ? Colors.white.withValues(alpha: 0.25)
                  : ShelfyTokens.primary.withValues(alpha: 0.82),
            ),
            child: widget.capturing
                ? const Padding(
                    padding: EdgeInsets.all(22),
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Icon(
                    Icons.camera_alt_rounded,
                    color: Colors.white,
                    size: 30,
                  ),
          ),
        ),
      ),
    );
  }
}
