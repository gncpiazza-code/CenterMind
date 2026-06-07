import 'package:flutter/material.dart';

/// Overlay de carga semitransparente que bloquea la interacción.
class LoadingOverlay extends StatelessWidget {
  final bool isLoading;
  final Widget child;
  final String? mensaje;

  const LoadingOverlay({
    super.key,
    required this.isLoading,
    required this.child,
    this.mensaje,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (isLoading)
          Container(
            color: Colors.black.withValues(alpha: 0.4),
            child: Center(
              child: Card(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 32,
                    vertical: 24,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      if (mensaje != null) ...[
                        const SizedBox(height: 16),
                        Text(
                          mensaje!,
                          style: Theme.of(context).textTheme.bodyMedium,
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
