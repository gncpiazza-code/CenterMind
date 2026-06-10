import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../../core/utils/device_profile.dart';
import '../capture_provider.dart' show kMaxPhotosPerExhibicion;
import '../models/capture_photo.dart';
import '../native_capture_service.dart';

/// Preview de cámara pro — zoom pinch, tap-to-focus, flash, grilla de encuadre.
/// Soporta modo nativo (gama baja): muestra pantalla estática con botón tomar foto.
class CameraCaptureWidget extends StatefulWidget {
  final void Function(File photo, CapturePhotoMetadata metadata) onPhotoTaken;
  final void Function(bool capturing)? onCapturingChanged;
  final void Function(Future<void> Function() takePhoto)? onCameraReady;
  /// Número de fotos ya capturadas (para el contador top-left).
  final int photoCount;
  /// Posición GPS ya cacheada — se usa en metadata para evitar GPS por foto.
  final double? lastKnownLat;
  final double? lastKnownLng;

  const CameraCaptureWidget({
    super.key,
    required this.onPhotoTaken,
    this.onCapturingChanged,
    this.onCameraReady,
    this.photoCount = 0,
    this.lastKnownLat,
    this.lastKnownLng,
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
  double _prevZoom = 1.0;
  Offset? _focusPoint;
  bool _showGrid = false;
  bool _showZoomIndicator = false;
  Timer? _zoomIndicatorTimer;
  bool _useNative = false;
  File? _lastNativePreview;

  static const _flashModes = [FlashMode.auto, FlashMode.always, FlashMode.off];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrapCamera());
  }

  @override
  void dispose() {
    _zoomIndicatorTimer?.cancel();
    final controller = _controller;
    _controller = null;
    if (controller != null) {
      try {
        controller.dispose();
      } catch (_) {}
    }
    super.dispose();
  }

  Future<void> takePhoto() => _takePhoto();

  CapturePhotoMetadata _metadataFromCache() {
    return CapturePhotoMetadata(
      capturedAtUtc: DateTime.now().toUtc(),
      lat: widget.lastKnownLat,
      lng: widget.lastKnownLng,
    );
  }

  Future<void> _bootstrapCamera() async {
    final useNative = await DeviceProfile.shouldUseNativeCamera();
    if (!mounted) return;
    if (useNative) {
      setState(() {
        _useNative = true;
        _initializing = false;
      });
      widget.onCameraReady?.call(takePhoto);
      return;
    }
    await _initCamera();
  }

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
      Future.delayed(const Duration(milliseconds: 600), () {
        if (mounted) setState(() => _focusPoint = null);
      });
    } catch (_) {}
  }

  Future<void> _handleZoom(double scale) async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    final target = (_scaleBaseZoom * scale).clamp(_minZoom, _maxZoom);
    await _setZoom(target);
    _showZoomBriefly();
  }

  void _showZoomBriefly() {
    _zoomIndicatorTimer?.cancel();
    if (!_showZoomIndicator) setState(() => _showZoomIndicator = true);
    _zoomIndicatorTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _showZoomIndicator = false);
    });
  }

  Future<void> _setZoom(double target) async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    try {
      await controller.setZoomLevel(target);
      if (mounted) setState(() => _currentZoom = target);
    } catch (_) {}
  }

  Future<void> _handleDoubleTap() async {
    HapticFeedback.lightImpact();
    if (_currentZoom > _minZoom + 0.05) {
      _prevZoom = _currentZoom;
      await _setZoom(_minZoom);
    } else {
      final target = _prevZoom > _minZoom + 0.05
          ? _prevZoom
          : (_maxZoom * 0.45).clamp(_minZoom + 1.0, _maxZoom);
      await _setZoom(target);
    }
    _showZoomBriefly();
  }

  void _setCapturing(bool value) {
    if (_capturing == value) return;
    _capturing = value;
    widget.onCapturingChanged?.call(value);
    if (mounted) setState(() {});
  }

  Future<void> _takePhotoNative() async {
    if (_capturing) return;
    _setCapturing(true);
    HapticFeedback.mediumImpact();
    try {
      final file = await NativeCaptureService.capturePhoto();
      if (file == null || !mounted) return;
      setState(() => _lastNativePreview = file);
      widget.onPhotoTaken(file, _metadataFromCache());
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

  Future<void> _takePhoto() async {
    if (_useNative) return _takePhotoNative();

    final controller = _controller;
    if (controller == null || !controller.value.isInitialized || _capturing) return;

    _setCapturing(true);
    HapticFeedback.mediumImpact();

    final sw = Stopwatch()..start();
    try {
      final xfile = await controller.takePicture();
      sw.stop();

      if (sw.elapsedMilliseconds > 800 && DeviceProfile.isAndroid) {
        await DeviceProfile.markSlowCameraDetected();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Cámara lenta detectada. Activá «Usar cámara del sistema» en Ajustes.',
              ),
              duration: Duration(seconds: 4),
            ),
          );
        }
      }

      widget.onPhotoTaken(File(xfile.path), _metadataFromCache());
    } catch (_) {
      sw.stop();
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
        return Icons.bolt;
      case FlashMode.off:
        return Icons.flash_off_rounded;
      default:
        return Icons.bolt;
    }
  }

  Color get _flashIconColor {
    if (_flashMode == FlashMode.always) return const Color(0xFFFFD60A);
    if (_flashMode == FlashMode.off) return Colors.white38;
    return Colors.white;
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
                _FocusSquare(point: _focusPoint!, constraints: constraints),
              GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTapUp: (d) => _handleTapFocus(d, constraints),
                onDoubleTap: _handleDoubleTap,
                child: const SizedBox.expand(),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildNativeCaptureUi(BuildContext context) {
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (_lastNativePreview != null)
          Positioned.fill(
            child: Image.file(_lastNativePreview!, fit: BoxFit.cover),
          )
        else
          const ColoredBox(color: Colors.black),
        Positioned.fill(
          child: ColoredBox(color: Colors.black.withValues(alpha: 0.22)),
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 132 + bottomPad,
          child: Text(
            widget.photoCount == 0
                ? 'Cámara del sistema — tocá el botón para cada foto'
                : '${widget.photoCount}/$kMaxPhotosPerExhibicion · seguí sacando o tocá Listo arriba',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: _BottomShutterArea(
            capturing: _capturing,
            onShutter: _takePhoto,
          ),
        ),
      ],
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

    if (_useNative) {
      return _buildNativeCaptureUi(context);
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
                FilledButton(onPressed: _bootstrapCamera, child: const Text('Reintentar')),
              ],
            ),
          ),
        ),
      );
    }

    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const ColoredBox(color: Colors.black);
    }
    final hasZoom = _maxZoom > _minZoom + 0.5;

    return Stack(
      fit: StackFit.expand,
      children: [
        // ── Camera preview (full bleed) ──────────────────────────────────────
        Positioned.fill(child: _buildCoverPreview(controller)),

        // ── Top controls: flash + grid (top-right) ─────────────────────────
        Positioned(
          top: 0,
          right: 0,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.only(right: 14, top: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Zoom badge — top-right junto flash (transitorio 2s)
                  if (hasZoom && _showZoomIndicator)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _ZoomBadge(zoom: _currentZoom),
                    ),
                  _CameraToolButton(
                    icon: _flashIcon,
                    iconColor: _flashIconColor,
                    onTap: _toggleFlash,
                  ),
                  const SizedBox(width: 10),
                  _CameraToolButton(
                    icon: _showGrid ? Icons.grid_on_rounded : Icons.grid_off_rounded,
                    onTap: () => setState(() => _showGrid = !_showGrid),
                  ),
                ],
              ),
            ),
          ),
        ),

        // ── Bottom gradient + shutter ─────────────────────────────────────────
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: _BottomShutterArea(
            capturing: _capturing,
            onShutter: _takePhoto,
          ),
        ),
      ],
    );
  }
}

// ─── Camera tool button (42 px, semi-transparent) ─────────────────────────────

class _CameraToolButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final Color? iconColor;

  const _CameraToolButton({
    required this.icon,
    required this.onTap,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.40),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Icon(icon, color: iconColor ?? Colors.white, size: 20),
      ),
    );
  }
}

// ─── Transient zoom badge (top-right, no center) ──────────────────────────────

class _ZoomBadge extends StatelessWidget {
  final double zoom;
  const _ZoomBadge({required this.zoom});

  String get _label {
    if (zoom == zoom.truncateToDouble()) return '${zoom.toInt()}x';
    return '${zoom.toStringAsFixed(1)}x';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Text(
        _label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

// ─── Bottom gradient + native shutter ─────────────────────────────────────────

class _BottomShutterArea extends StatelessWidget {
  final bool capturing;
  final VoidCallback onShutter;

  const _BottomShutterArea({required this.capturing, required this.onShutter});

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    return Container(
      height: 120 + bottomPad,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0x00000000),
            Color(0xCC000000),
          ],
        ),
      ),
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomPad + 16),
        child: Center(
          child: _NativeShutterButton(
            capturing: capturing,
            onTap: onShutter,
          ),
        ),
      ),
    );
  }
}

/// Apple-style shutter: 72px white filled circle, no Material ripple.
class _NativeShutterButton extends StatefulWidget {
  final bool capturing;
  final VoidCallback onTap;

  const _NativeShutterButton({required this.capturing, required this.onTap});

  @override
  State<_NativeShutterButton> createState() => _NativeShutterButtonState();
}

class _NativeShutterButtonState extends State<_NativeShutterButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _pressCtrl;
  late Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();
    _pressCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 80),
      reverseDuration: const Duration(milliseconds: 160),
    );
    _scaleAnim = Tween<double>(begin: 1.0, end: 0.88).animate(
      CurvedAnimation(parent: _pressCtrl, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _pressCtrl.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails _) {
    if (!widget.capturing) _pressCtrl.forward();
  }

  void _onTapUp(TapUpDetails _) {
    _pressCtrl.reverse();
    if (!widget.capturing) widget.onTap();
  }

  void _onTapCancel() => _pressCtrl.reverse();

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: AnimatedBuilder(
        animation: _scaleAnim,
        builder: (_, child) => Transform.scale(scale: _scaleAnim.value, child: child),
        child: Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: widget.capturing ? Colors.white.withValues(alpha: 0.55) : Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: widget.capturing
              ? const Padding(
                  padding: EdgeInsets.all(20),
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : Container(
                  margin: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.black.withValues(alpha: 0.12),
                      width: 1,
                    ),
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 4,
                        spreadRadius: -1,
                        offset: Offset.zero,
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}

// ─── Framing grid ──────────────────────────────────────────────────────────────

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

// ─── Focus square (Apple-style, fades in 600 ms) ──────────────────────────────

class _FocusSquare extends StatefulWidget {
  final Offset point;
  final BoxConstraints constraints;

  const _FocusSquare({required this.point, required this.constraints});

  @override
  State<_FocusSquare> createState() => _FocusSquareState();
}

class _FocusSquareState extends State<_FocusSquare>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _opacity = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0), weight: 10),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.0), weight: 60),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0), weight: 30),
    ]).animate(_ctrl);
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const size = 50.0;
    return Positioned(
      left: widget.point.dx * widget.constraints.maxWidth - size / 2,
      top: widget.point.dy * widget.constraints.maxHeight - size / 2,
      child: IgnorePointer(
        child: FadeTransition(
          opacity: _opacity,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white, width: 1.5),
              borderRadius: BorderRadius.circular(6),
            ),
          ),
        ),
      ),
    );
  }
}
