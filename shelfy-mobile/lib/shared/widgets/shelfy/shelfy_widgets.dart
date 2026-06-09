import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../theme/shelfy_tokens.dart';
import '../shelfy_logo.dart';

// ─── ShelfyGlassPanel ──────────────────────────────────────────────────────────

/// Panel con efecto glass (BackdropFilter blur + fondo blanco semi-transparente).
/// Úsalo como base para sheets, cards y overlays de captura.
class ShelfyGlassPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final BorderRadiusGeometry borderRadius;
  final double elevation;

  const ShelfyGlassPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = const BorderRadius.all(Radius.circular(ShelfyTokens.radiusLg)),
    this.elevation = 0,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: borderRadius as BorderRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: ShelfyTokens.panelBlur,
          sigmaY: ShelfyTokens.panelBlur,
        ),
        child: Container(
          decoration: BoxDecoration(
            color: ShelfyTokens.panel.withValues(alpha: ShelfyTokens.panelOpacity),
            borderRadius: borderRadius,
            border: Border.all(
              color: ShelfyTokens.border,
              width: 1,
            ),
            boxShadow: elevation > 0
                ? [
                    BoxShadow(
                      color: ShelfyTokens.primary.withValues(alpha: 0.08),
                      blurRadius: elevation * 4,
                      offset: Offset(0, elevation),
                    )
                  ]
                : null,
          ),
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}

// ─── ShelfyPrimaryButton ───────────────────────────────────────────────────────

/// Botón primario Shelfy con glow sutil al presionar.
class ShelfyPrimaryButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final Widget child;
  final bool fullWidth;
  final EdgeInsetsGeometry? padding;

  const ShelfyPrimaryButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.fullWidth = true,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final btn = FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: ShelfyTokens.primary,
        foregroundColor: Colors.white,
        minimumSize: fullWidth ? const Size(double.infinity, 48) : const Size(0, 48),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        ),
        padding: padding,
        elevation: 0,
      ).copyWith(
        overlayColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.pressed)
              ? Colors.white.withValues(alpha: 0.15)
              : null,
        ),
      ),
      child: child,
    );

    if (onPressed == null) return btn;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        boxShadow: [
          BoxShadow(
            color: ShelfyTokens.primary.withValues(alpha: 0.28),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: btn,
    );
  }
}

// ─── ShelfyChip ────────────────────────────────────────────────────────────────

/// Chip Shelfy con glow violeta al seleccionar.
class ShelfyChip extends StatelessWidget {
  final String label;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;

  const ShelfyChip({
    super.key,
    required this.label,
    this.subtitle,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected
              ? ShelfyTokens.primary.withValues(alpha: 0.1)
              : ShelfyTokens.panel.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
          border: Border.all(
            color: selected ? ShelfyTokens.primary : ShelfyTokens.border,
            width: selected ? 1.5 : 1,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: ShelfyTokens.primary.withValues(alpha: 0.18),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  )
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 16,
                color: selected ? ShelfyTokens.primary : ShelfyTokens.textSoft,
              ),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: selected ? ShelfyTokens.primary : ShelfyTokens.text,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: TextStyle(
                        fontSize: 11,
                        color: selected ? ShelfyTokens.primary2 : ShelfyTokens.muted,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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

// ─── ShelfyCaptureShutter ──────────────────────────────────────────────────────

/// Botón shutter de cámara con identidad Shelfy: anillo blanco + halo violeta.
class ShelfyCaptureShutter extends StatefulWidget {
  final VoidCallback? onTap;
  final bool loading;

  const ShelfyCaptureShutter({
    super.key,
    required this.onTap,
    this.loading = false,
  });

  @override
  State<ShelfyCaptureShutter> createState() => _ShelfyCaptureShutterState();
}

class _ShelfyCaptureShutterState extends State<ShelfyCaptureShutter>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseCtrl;
  late Animation<double> _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 0.6, end: 1.0).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.loading ? null : widget.onTap,
      child: AnimatedBuilder(
        animation: _pulseAnim,
        builder: (_, _) => Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: ShelfyTokens.primary.withValues(alpha: _pulseAnim.value * 0.45),
                blurRadius: 20,
                spreadRadius: 4,
              ),
            ],
          ),
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 4),
              color: widget.loading
                  ? Colors.white.withValues(alpha: 0.3)
                  : ShelfyTokens.primary.withValues(alpha: 0.85),
            ),
            child: widget.loading
                ? const Padding(
                    padding: EdgeInsets.all(22),
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 30),
          ),
        ),
      ),
    );
  }
}

// ─── ShelfyPdvSuggestionTile ───────────────────────────────────────────────────

/// Tile de sugerencia de PDV en el panel de autocompletado.
class ShelfyPdvSuggestionTile extends StatelessWidget {
  final String nro;
  final String nombreDisplay;
  final String? razonSocial;
  final double? distanciaM;
  final VoidCallback onTap;

  const ShelfyPdvSuggestionTile({
    super.key,
    required this.nro,
    required this.nombreDisplay,
    this.razonSocial,
    this.distanciaM,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: ShelfyTokens.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.store_outlined,
                size: 18,
                color: ShelfyTokens.primary,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    nombreDisplay.isNotEmpty ? nombreDisplay : 'NRO $nro',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: ShelfyTokens.text,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    [
                      'NRO $nro',
                      if (razonSocial != null && razonSocial!.isNotEmpty) razonSocial,
                    ].join(' · '),
                    style: const TextStyle(
                      fontSize: 11,
                      color: ShelfyTokens.muted,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            if (distanciaM != null)
              Text(
                '${distanciaM!.toStringAsFixed(0)} m',
                style: const TextStyle(
                  fontSize: 11,
                  color: ShelfyTokens.primary,
                  fontWeight: FontWeight.w500,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ─── ShelfySnapshotLabel ──────────────────────────────────────────────────────

/// Label compacto para indicar la fecha del snapshot (CC / ventas).
class ShelfySnapshotLabel extends StatelessWidget {
  final String label;

  const ShelfySnapshotLabel({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: ShelfyTokens.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(ShelfyTokens.radiusSm),
        border: Border.all(color: ShelfyTokens.primary.withValues(alpha: 0.2)),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 11,
          color: ShelfyTokens.primary,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

// ─── ShelfyAppBarTitle ────────────────────────────────────────────────────────

/// Título del AppBar con logo Shelfy compacto.
class ShelfyAppBarTitle extends StatelessWidget {
  const ShelfyAppBarTitle({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Image.asset(
            ShelfyLogo.assetPath,
            width: 26,
            height: 26,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const Icon(
              Icons.store_rounded,
              size: 22,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(width: 8),
        const Text(
          'Shelfy',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}
