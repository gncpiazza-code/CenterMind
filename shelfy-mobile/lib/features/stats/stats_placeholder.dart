import 'package:flutter/material.dart';

/// Placeholder para la pantalla de estadísticas (pendiente MVP).
class StatsPlaceholder extends StatelessWidget {
  const StatsPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.bar_chart, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text(
            'Mis estadísticas',
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
