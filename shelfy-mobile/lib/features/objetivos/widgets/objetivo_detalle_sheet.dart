import 'package:flutter/material.dart';

import '../models/objetivo_detalle.dart';

/// BottomSheet con el detalle completo de un objetivo.
/// Se muestra al hacer tap en una card de objetivo.
class ObjetivoDetalleSheet extends StatelessWidget {
  final ObjetivoDetalle detalle;

  const ObjetivoDetalleSheet({super.key, required this.detalle});

  /// Muestra el sheet desde un contexto dado.
  static Future<void> show(BuildContext context, ObjetivoDetalle detalle) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ObjetivoDetalleSheet(detalle: detalle),
    );
  }

  Color _tipoColor() {
    switch (detalle.tipo) {
      case 'exhibicion':
        return Colors.blue;
      case 'compradores':
        return Colors.teal;
      case 'ruteo_alteo':
        return Colors.orange;
      default:
        return Colors.indigo;
    }
  }

  String _tipoLabel() {
    switch (detalle.tipo) {
      case 'exhibicion':
        return 'Exhibición';
      case 'compradores':
        return 'Compradores';
      case 'ruteo_alteo':
        return 'Alteo';
      default:
        return detalle.tipo;
    }
  }

  String _formatFecha(String iso) {
    if (iso.length < 10) return iso;
    final parts = iso.substring(0, 10).split('-');
    if (parts.length != 3) return iso;
    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }

  bool _esTelegramPayload(String desc) {
    return desc.startsWith('📊') ||
        desc.startsWith('🎯') ||
        desc.startsWith('📋') ||
        desc.startsWith('🔔') ||
        (desc.contains('Objetivo de') && desc.contains('\n') && desc.length > 120);
  }

  @override
  Widget build(BuildContext context) {
    final tipoColor = _tipoColor();
    final progress = detalle.valorObjetivo > 0
        ? (detalle.valorActual / detalle.valorObjetivo).clamp(0.0, 1.0)
        : 0.0;

    final descRaw = detalle.descripcion;

    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.90,
      expand: false,
      builder: (context, scrollController) {
        return ListView(
          controller: scrollController,
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            // Handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Header: badge tipo + cumplido
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: tipoColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _tipoLabel(),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: tipoColor,
                    ),
                  ),
                ),
                if (detalle.cumplido) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'Cumplido',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.green,
                      ),
                    ),
                  ),
                ],
                const Spacer(),
                Text(
                  'Vence ${_formatFecha(detalle.fechaObjetivo)}',
                  style: Theme.of(context)
                      .textTheme
                      .labelSmall
                      ?.copyWith(color: Colors.grey[600]),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Descripción
            if (descRaw != null &&
                descRaw.isNotEmpty &&
                !_esTelegramPayload(descRaw)) ...[
              Text(
                descRaw,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 14),
            ],

            // Barra de progreso
            _ProgresoSection(
              valorActual: detalle.valorActual,
              valorObjetivo: detalle.valorObjetivo,
              progresoPct: detalle.progresoPct,
              progress: progress.toDouble(),
              color: detalle.cumplido ? Colors.green : tipoColor,
            ),

            // Desglose (si existe)
            if (detalle.desglose != null && detalle.desglose!.isNotEmpty) ...[
              const SizedBox(height: 20),
              _DesgloseSection(desglose: detalle.desglose!),
            ],

            // PDVs target (si existen)
            if (detalle.itemsPdv.isNotEmpty) ...[
              const SizedBox(height: 20),
              _PdvsSection(items: detalle.itemsPdv),
            ],
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Sección de progreso
// ---------------------------------------------------------------------------

class _ProgresoSection extends StatelessWidget {
  final int valorActual;
  final int valorObjetivo;
  final double progresoPct;
  final double progress;
  final Color color;

  const _ProgresoSection({
    required this.valorActual,
    required this.valorObjetivo,
    required this.progresoPct,
    required this.progress,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Progreso',
              style: Theme.of(context)
                  .textTheme
                  .labelMedium
                  ?.copyWith(color: Colors.grey[600]),
            ),
            Text(
              '$valorActual / $valorObjetivo  (${progresoPct.toStringAsFixed(0)}%)',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 10,
            backgroundColor: Colors.grey[200],
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Sección de desglose
// ---------------------------------------------------------------------------

class _DesgloseSection extends StatelessWidget {
  final Map<String, dynamic> desglose;

  const _DesgloseSection({required this.desglose});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Detalle',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        ...desglose.entries.map((e) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _humanizeKey(e.key),
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Colors.grey[700]),
                ),
                Text(
                  '${e.value}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  String _humanizeKey(String key) {
    return key
        .replaceAll('_', ' ')
        .split(' ')
        .map((w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1)}' : w)
        .join(' ');
  }
}

// ---------------------------------------------------------------------------
// Sección de PDVs target
// ---------------------------------------------------------------------------

class _PdvsSection extends StatelessWidget {
  final List<ItemPdv> items;

  const _PdvsSection({required this.items});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'PDVs objetivo (${items.length})',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        ...items.map(
          (pdv) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                const Icon(Icons.store_outlined, size: 16, color: Colors.grey),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    pdv.nombre.isNotEmpty ? pdv.nombre : pdv.idClienteErp,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                if (pdv.idClienteErp.isNotEmpty)
                  Text(
                    '#${pdv.idClienteErp}',
                    style: Theme.of(context)
                        .textTheme
                        .labelSmall
                        ?.copyWith(color: Colors.grey[500]),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
