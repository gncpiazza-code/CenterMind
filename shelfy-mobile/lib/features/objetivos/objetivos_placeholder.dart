import 'package:flutter/material.dart';

/// Placeholder para la pantalla de objetivos del vendedor (pendiente MVP).
class ObjetivosPlaceholder extends StatelessWidget {
  const ObjetivosPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.flag, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text(
            'Mis objetivos',
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
