import 'package:flutter/material.dart';

/// Logo de marca Shelfy (mismo asset que el portal).
class ShelfyLogo extends StatelessWidget {
  final double size;
  final bool showLabel;

  const ShelfyLogo({
    super.key,
    this.size = 88,
    this.showLabel = false,
  });

  static const _assetPath = 'assets/branding/shelfy_launcher.png';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(size * 0.22),
          child: Image.asset(
            _assetPath,
            width: size,
            height: size,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Icon(
              Icons.store_rounded,
              size: size,
              color: theme.colorScheme.primary,
            ),
          ),
        ),
        if (showLabel) ...[
          const SizedBox(height: 12),
          Text(
            'Shelfy',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ],
    );
  }
}
