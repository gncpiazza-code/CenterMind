import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../../core/utils/device_profile.dart';
import '../../../../theme/shelfy_tokens.dart';
import '../capture_provider.dart';
import '../models/capture_photo.dart';

/// Preview de cámara pro — zoom pinch, tap-to-focus, flash, grilla de encuadre.
/// Sin galería ni cámara frontal. El shutter vive en [CaptureScreen] sobre el nav.
class CameraCaptureWidget extends StatefulWidget {
  final void Function(File photo, CapturePhotoMetadata metadata) onPhotoTaken;
  final void Function(bool capturing)? onCapturingChanged;
  final void Function(Future<void> Function() takePhoto)? onCameraReady;

  const CameraCaptureWidget({
    super.key,
    required this.onPhotoTaken,
    this.onCapturingChanged,
    this.onCameraReady,
  });

  @override
  State<CameraCaptureWidget> createState() => CameraCaptureWidgetState();
}

class CameraCaptureWidgetState extends State<CameraCaptureWidget> {
  CameraController? _controller;
  bool _initializing = true;
  String? _error;
  bool _capturing = false;
  FlashMode _flashMode = FlashMode.auto;
  int _initGeneration = 0;
  Future<void>? _releaseFuture;

  double _minZoom = 1.0;
  double _maxZoom = 1.0;
  double _currentZoom = 1.0;
  double _scaleBaseZoom = 1.0;
  Offset? _focusPoint;
  bool _showGrid = true;

  static const _flashModes = [FlashMode.auto, FlashMode.always, FlashMode.off];

  @override
  void initState() {
    super.initState();
    // Retraso breve: evita competir con cold start / permisos en iOS.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      if (mounted) _initCamera();
    });
  }

  Future<void> takePhoto() => _takePhoto();

  Future<void> _releaseCamera() {
    _releaseFuture ??= _releaseCameraImpl();
    return _releaseFuture!;
  }

  Future<void> _releaseCameraImpl() async {
    final controller = _controller;
    _controller = null;
    if (controller != null) {
      try {
        await controller.dispose();
      } catch (_) {}
    }
    if (mounted) {
      setState(() {
        _initializing = false;
        _error = null;
      });
    }
    _releaseFuture = null;
  }

  Future<void> _initCamera() async {
    final gen = ++_initGeneration;
    await _releaseCamera();
    if (!mounted || gen != _initGeneration) return;

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
        DeviceProfile.cameraPreset,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted || gen != _initGeneration) {
        await controller.dispose();
        return;
      }

      await controller.setFlashMode(_flashMode);
      _minZoom = await controller.getMinZoomLevel();
      _maxZoom = await controller.getMaxZoomLevel();
      _currentZoom = _minZoom;

      setState(() {
        _controller = controller;
        _initializing = false;
      });
      widget.onCameraReady?.call(takePhoto);
    } catch (_) {
      if (!mounted || gen != _initGeneration) return;
      setState(() {
        _error = 'No se pudo abrir la cámara.';
        _initializing = false;
      });
    }
  }

  Future<void> _toggleFlash() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    final idx = _flashModes.indexOf(_flashMode);
    final next = _flashModes[(idx + 1) % _flashModes.length];
    try {
      await controller.setFlashMode(next);
      setState(() => _flashMode = next);
    } catch (_) {}
  }

  Future<void> _handleTapFocus(TapUpDetails details, BoxConstraints constraints) async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    final point = Offset(
      (details.localPosition.dx / constraints.maxWidth).clamp(0.0, 1.0),
      (details.localPosition.dy / constraints.maxHeight).clamp(0.0, 1.0),
    );
    try {
      await controller.setFocusMode(FocusMode.auto);
      await controller.setFocusPoint(point);
      await controller.setExposurePoint(point);
      setState(() => _focusPoint = point);
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) setState(() => _focusPoint = null);
      });
    } catch (_) {}
  }

  Future<void> _handleZoom(double scale) async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    final target = (_scaleBaseZoom * scale).clamp(_minZoom, _maxZoom);
    try {
      await controller.setZoomLevel(target);
      setState(() => _currentZoom = target);
    } catch (_) {}
  }

  void _setCapturing(bool value) {
    if (_capturing == value) return;
    _capturing = value;
    widget.onCapturingChanged?.call(value);
    if (mounted) setState(() {});
  }

  Future<void> _takePhoto() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized || _capturing) return;

    _setCapturing(true);
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
      _setCapturing(false);
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
    final controller = _controller;
    _controller = null;
    if (controller != null) {
      try {
        controller.dispose();
      } catch (_) {}
    }
    super.dispose();
  }

  Widget _buildCoverPreview(CameraController controller) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final previewSize = controller.value.previewSize;
        Widget preview;
        if (previewSize == null || previewSize.width == 0 || previewSize.height == 0) {
          preview = CameraPreview(controller);
        } else {
          preview = FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: previewSize.height,
              height: previewSize.width,
              child: CameraPreview(controller),
            ),
          );
        }

        // Tap (focus) y pinch (zoom) en capas separadas — un solo GestureDetector
        // con onTapUp + onScale provoca crashes nativos en iOS.
        return ClipRect(
          child: Stack(
            fit: StackFit.expand,
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onScaleStart: (_) => _scaleBaseZoom = _currentZoom,
                onScaleUpdate: (d) => _handleZoom(d.scale),
                child: preview,
              ),
              if (_showGrid) const _FramingGrid(),
              if (_focusPoint != null)
                _FocusRing(point: _focusPoint!, constraints: constraints),
              GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTapUp: (d) => _handleTapFocus(d, constraints),
                child: const SizedBox.expand(),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) {
      return const ColoredBox(
        color: Colors.black,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
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
                Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
                const SizedBox(height: 20),
                FilledButton(onPressed: _initCamera, child: const Text('Reintentar')),
              ],
            ),
          ),
        ),
      );
    }

    final controller = _controller!;
    final zoomLabel = _maxZoom > _minZoom
        ? '${_currentZoom.toStringAsFixed(1)}x'
        : null;

    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned.fill(child: _buildCoverPreview(controller)),
        Positioned(
          top: 56,
          right: 12,
          child: SafeArea(
            child: Column(
              children: [
                _ToolButton(icon: _flashIcon, onTap: _toggleFlash),
                const SizedBox(height: 8),
                _ToolButton(
                  icon: _showGrid ? Icons.grid_on_rounded : Icons.grid_off_rounded,
                  onTap: () => setState(() => _showGrid = !_showGrid),
                ),
                if (zoomLabel != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      zoomLabel,
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ToolButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _ToolButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.45),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }
}

class _FramingGrid extends StatelessWidget {
  const _FramingGrid();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _GridPainter());
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.28)
      ..strokeWidth = 0.8;
    for (var i = 1; i < 3; i++) {
      final dx = size.width * i / 3;
      final dy = size.height * i / 3;
      canvas.drawLine(Offset(dx, 0), Offset(dx, size.height), paint);
      canvas.drawLine(Offset(0, dy), Offset(size.width, dy), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _FocusRing extends StatelessWidget {
  final Offset point;
  final BoxConstraints constraints;

  const _FocusRing({required this.point, required this.constraints});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: point.dx * constraints.maxWidth - 28,
      top: point.dy * constraints.maxHeight - 28,
      child: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          border: Border.all(color: ShelfyTokens.primary, width: 2),
          borderRadius: BorderRadius.circular(6),
        ),
      ),
    );
  }
}
