import 'package:flutter/material.dart';

import '../../../theme/shelfy_tokens.dart';
import '../models/cartera_models.dart';

/// Tile que representa un PDV dentro de una ruta de cartera.
/// Al hacer tap muestra un bottom sheet con la ficha completa del PDV.
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
      onTap: () => _showFicha(context),
    );
  }

  void _showFicha(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: ShelfyTokens.panel,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _PdvFichaSheet(pdv: pdv),
    );
  }
}

// ---------------------------------------------------------------------------

class _PdvFichaSheet extends StatelessWidget {
  final PdvCartera pdv;

  const _PdvFichaSheet({required this.pdv});

  @override
  Widget build(BuildContext context) {
    final vitalidadColor = _vitalidadColor();
    return DraggableScrollableSheet(
      initialChildSize: 0.5,
      minChildSize: 0.35,
      maxChildSize: 0.85,
      expand: false,
      builder: (context, scroll) {
        return ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: ShelfyTokens.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Encabezado
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: ShelfyTokens.primary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.store_rounded,
                    color: ShelfyTokens.primary,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        pdv.nombreDisplay,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: ShelfyTokens.text,
                        ),
                      ),
                      Text(
                        'NRO ${pdv.idClienteErp}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: ShelfyTokens.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: vitalidadColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _vitalidadLabel(),
                    style: TextStyle(
                      fontSize: 12,
                      color: vitalidadColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),
            const Divider(height: 1),
            const SizedBox(height: 16),

            // Campos de la ficha
            if (pdv.nombreFantasia != null && pdv.nombreFantasia!.isNotEmpty)
              _FichaRow(label: 'Fantasía', value: pdv.nombreFantasia!),
            if (pdv.nombreRazonSocial != null && pdv.nombreRazonSocial!.isNotEmpty)
              _FichaRow(label: 'Razón social', value: pdv.nombreRazonSocial!),
            if (pdv.domicilio != null && pdv.domicilio!.isNotEmpty)
              _FichaRow(label: 'Domicilio', value: pdv.domicilio!),
            if (pdv.localidad != null && pdv.localidad!.isNotEmpty)
              _FichaRow(label: 'Localidad', value: pdv.localidad!),
            if (pdv.telefono != null && pdv.telefono!.isNotEmpty)
              _FichaRow(label: 'Teléfono', value: pdv.telefono!),
            if (pdv.canal != null && pdv.canal!.isNotEmpty)
              _FichaRow(label: 'Canal', value: pdv.canal!),
            if (pdv.fechaAlta != null && pdv.fechaAlta!.isNotEmpty)
              _FichaRow(label: 'Alta', value: _formatFecha(pdv.fechaAlta!)),
            if (pdv.fechaUltimaCompra != null && pdv.fechaUltimaCompra!.isNotEmpty)
              _FichaRow(label: 'Última compra', value: _formatFecha(pdv.fechaUltimaCompra!)),
          ],
        );
      },
    );
  }

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

  String _formatFecha(String iso) {
    if (iso.length < 10) return iso;
    final parts = iso.substring(0, 10).split('-');
    if (parts.length != 3) return iso;
    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }
}

class _FichaRow extends StatelessWidget {
  final String label;
  final String value;

  const _FichaRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: ShelfyTokens.textSoft,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13,
                color: ShelfyTokens.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
