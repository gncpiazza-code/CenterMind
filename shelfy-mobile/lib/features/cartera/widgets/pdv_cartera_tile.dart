import 'package:flutter/material.dart';

import '../models/cartera_models.dart';

/// Tile que representa un PDV dentro de una ruta de cartera.
class PdvCarteraTile extends StatelessWidget {
  final PdvCartera pdv;

  const PdvCarteraTile({super.key, required this.pdv});

  Color _vitalidadColor() {
    switch (pdv.vitalidad) {
      case 'activo':
        return Colors.green;
      case 'por_caer':
        return Colors.orange;
      case 'inactivo':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _vitalidadLabel() {
    switch (pdv.vitalidad) {
      case 'activo':
        return 'Activo';
      case 'por_caer':
        return 'Por caer';
      case 'inactivo':
        return 'Inactivo';
      default:
        return pdv.vitalidad;
    }
  }

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if (pdv.domicilio != null) pdv.domicilio!,
      if (pdv.localidad != null) pdv.localidad!,
    ].join(', ');

    return ListTile(
      leading: Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(
          color: _vitalidadColor(),
          shape: BoxShape.circle,
        ),
      ),
      title: Text(
        '${pdv.nombreDisplay}  #${pdv.idClienteErp}',
        style: const TextStyle(fontWeight: FontWeight.w500),
      ),
      subtitle: subtitle.isNotEmpty ? Text(subtitle) : null,
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: _vitalidadColor().withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          _vitalidadLabel(),
          style: TextStyle(
            fontSize: 12,
            color: _vitalidadColor(),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
