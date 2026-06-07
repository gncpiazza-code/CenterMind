import 'package:flutter/material.dart';

/// Placeholder para la pantalla de cartera de clientes (pendiente MVP).
class CarteraPlaceholder extends StatelessWidget {
  const CarteraPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.list_alt, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text(
            'Mi cartera de clientes',
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
