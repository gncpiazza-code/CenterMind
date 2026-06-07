import 'package:flutter/material.dart';

/// Placeholder para la pantalla de captura de exhibiciones (pendiente MVP).
class CapturePlaceholder extends StatelessWidget {
  const CapturePlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.camera_alt, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text(
            'Captura de exhibiciones',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
          ),
          SizedBox(height: 8),
          Text(
            'Próximamente disponible',
            style: TextStyle(color: Colors.grey),
          ),
        ],
      ),
    );
  }
}
