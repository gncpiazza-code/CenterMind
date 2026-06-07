import 'package:flutter/material.dart';

import '../models/objetivo_app.dart';

/// Tarjeta que muestra un objetivo activo del vendedor.
class ObjetivoCard extends StatelessWidget {
  final ObjetivoApp objetivo;

  const ObjetivoCard({super.key, required this.objetivo});

  Color _tipoColor() {
    switch (objetivo.tipo) {
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
    switch (objetivo.tipo) {
      case 'exhibicion':
        return 'Exhibición';
      case 'compradores':
        return 'Compradores';
      case 'ruteo_alteo':
        return 'Alteo';
      default:
        return objetivo.tipo;
    }
  }

  /// Parsea ISO date "YYYY-MM-DD" a "DD/MM/YYYY".
  String _formatFecha(String iso) {
    if (iso.length < 10) return iso;
    final parts = iso.substring(0, 10).split('-');
    if (parts.length != 3) return iso;
    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }

  /// Detecta payloads de Telegram crudos que no deben mostrarse.
  bool _esTelegramPayload(String desc) {
    return desc.startsWith('📊') ||
        desc.startsWith('🎯') ||
        desc.startsWith('📋') ||
        desc.startsWith('🔔') ||
        desc.contains('Objetivo de') && desc.contains('\n') && desc.length > 120;
  }

  @override
  Widget build(BuildContext context) {
    final progress = objetivo.valorObjetivo > 0
        ? (objetivo.valorAprobados / objetivo.valorObjetivo).clamp(0.0, 1.0)
        : 0.0;

    final superado = objetivo.valorAprobados > objetivo.valorObjetivo;
    final tipoColor = _tipoColor();

    final descRaw = objetivo.descripcion;
    final mostrarDesc = descRaw != null &&
        descRaw.isNotEmpty &&
        !_esTelegramPayload(descRaw);
    final desc = descRaw ?? '';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: badge tipo + vence
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: tipoColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _tipoLabel(),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: tipoColor,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  'Vence el ${_formatFecha(objetivo.fechaObjetivo)}',
                  style: Theme.of(context)
                      .textTheme
                      .labelSmall
                      ?.copyWith(color: Colors.grey[600]),
                ),
              ],
            ),

            if (mostrarDesc) ...[
              const SizedBox(height: 10),
              Text(
                desc,
                style: Theme.of(context).textTheme.bodyMedium,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],

            const SizedBox(height: 12),

            // Barra de progreso
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 8,
                      backgroundColor: Colors.grey[200],
                      valueColor: AlwaysStoppedAnimation<Color>(
                        superado ? Colors.green : tipoColor,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  superado
                      ? '${objetivo.valorAprobados}/${objetivo.valorObjetivo} ✓'
                      : '${objetivo.valorAprobados}/${objetivo.valorObjetivo}',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: superado ? Colors.green : null,
                      ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
