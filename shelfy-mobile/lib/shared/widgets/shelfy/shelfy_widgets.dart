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

/// Botón shutter Apple-like: 72 px círculo blanco sin ripple Material.
/// Mantiene compatibilidad con código que aún lo invoca desde fuera del widget de cámara.
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
    if (!widget.loading && widget.onTap != null) _pressCtrl.forward();
  }

  void _onTapUp(TapUpDetails _) {
    _pressCtrl.reverse();
    if (!widget.loading) widget.onTap?.call();
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
            color: widget.loading ? Colors.white.withValues(alpha: 0.55) : Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: widget.loading
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
                    color: Colors.white,
                    border: Border.all(
                      color: Colors.black.withValues(alpha: 0.12),
                      width: 1,
                    ),
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

// ─── ShelfySectionHeader ─────────────────────────────────────────────────────

/// Encabezado de sección: icono + título + subtítulo opcional.
class ShelfySectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData? icon;

  const ShelfySectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (icon != null) ...[
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: ShelfyTokens.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(ShelfyTokens.radiusSm),
            ),
            child: Icon(icon, size: 16, color: ShelfyTokens.primary),
          ),
          const SizedBox(width: 10),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: ShelfyTokens.text,
                ),
              ),
              if (subtitle != null)
                Text(
                  subtitle!,
                  style: const TextStyle(
                    fontSize: 11,
                    color: ShelfyTokens.muted,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── ShelfyHeroMetric ─────────────────────────────────────────────────────────

/// Métrica hero: número grande + label + delta opcional.
class ShelfyHeroMetric extends StatelessWidget {
  final String value;
  final String label;
  final String? delta;
  final bool deltaPositive;

  const ShelfyHeroMetric({
    super.key,
    required this.value,
    required this.label,
    this.delta,
    this.deltaPositive = true,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              value,
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: ShelfyTokens.primary,
                    letterSpacing: -1,
                  ),
            ),
            if (delta != null) ...[
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      deltaPositive ? Icons.arrow_upward : Icons.arrow_downward,
                      size: 13,
                      color: deltaPositive ? ShelfyTokens.success : ShelfyTokens.error,
                    ),
                    Text(
                      delta!,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: deltaPositive ? ShelfyTokens.success : ShelfyTokens.error,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            color: ShelfyTokens.textSoft,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

// ─── ShelfyProgressRow ────────────────────────────────────────────────────────

/// Fila con label + barra proporcional + valor. Ideal para top SKUs.
class ShelfyProgressRow extends StatelessWidget {
  final String label;
  final double ratio; // 0.0–1.0
  final String valueLabel;
  final Color? barColor;

  const ShelfyProgressRow({
    super.key,
    required this.label,
    required this.ratio,
    required this.valueLabel,
    this.barColor,
  });

  @override
  Widget build(BuildContext context) {
    final color = barColor ?? ShelfyTokens.primary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12,
                    color: ShelfyTokens.textSoft,
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                valueLabel,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: ShelfyTokens.text,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: ratio.clamp(0.0, 1.0),
              minHeight: 5,
              backgroundColor: ShelfyTokens.border,
              valueColor: AlwaysStoppedAnimation<Color>(color.withValues(alpha: 0.85)),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── ShelfyKeyValueGrid ───────────────────────────────────────────────────────

/// Grid 2 columnas de pares clave-valor (máx 4 items).
class ShelfyKeyValueGrid extends StatelessWidget {
  final List<({String key, String value})> items;

  const ShelfyKeyValueGrid({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 2) {
      final left = items[i];
      final right = i + 1 < items.length ? items[i + 1] : null;
      rows.add(
        Row(
          children: [
            Expanded(child: _KVCell(label: left.key, value: left.value)),
            if (right != null)
              Expanded(child: _KVCell(label: right.key, value: right.value))
            else
              const Expanded(child: SizedBox.shrink()),
          ],
        ),
      );
      if (i + 2 < items.length) rows.add(const SizedBox(height: 10));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: rows);
  }
}

class _KVCell extends StatelessWidget {
  final String label;
  final String value;

  const _KVCell({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: ShelfyTokens.muted),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: ShelfyTokens.text,
          ),
        ),
      ],
    );
  }
}

// ─── ShelfyInsightList ────────────────────────────────────────────────────────

/// Lista de recomendaciones/insights con icono leading. No lista plana.
class ShelfyInsightList extends StatelessWidget {
  final List<String> items;
  final IconData leadingIcon;
  final Color? iconColor;

  const ShelfyInsightList({
    super.key,
    required this.items,
    this.leadingIcon = Icons.lightbulb_outline,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final color = iconColor ?? ShelfyTokens.warning;
    return Column(
      children: items.map((item) {
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(ShelfyTokens.radiusSm),
                ),
                child: Icon(leadingIcon, size: 14, color: color),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  item,
                  style: const TextStyle(
                    fontSize: 13,
                    color: ShelfyTokens.textSoft,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        );
      }).toList(),
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
