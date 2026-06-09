import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../theme/shelfy_tokens.dart';
import '../models/cc_response.dart';

/// Detalle de un cliente CC — aging buckets servidos por BE (solo render).
class CcDetalleSheet extends StatelessWidget {
  final ClienteCc cliente;

  const CcDetalleSheet({super.key, required this.cliente});

  static Future<void> show(BuildContext context, ClienteCc cliente) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CcDetalleSheet(cliente: cliente),
    );
  }

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat.currency(locale: 'es_AR', symbol: '\$');
    final buckets = <({String label, double monto})>[
      (label: '0–7 días', monto: cliente.deuda7Dias),
      (label: '8–15 días', monto: cliente.deuda15Dias),
      (label: '16–30 días', monto: cliente.deuda30Dias),
      (label: '31–60 días', monto: cliente.deuda60Dias),
      (label: '+60 días', monto: cliente.deudaMas60Dias),
    ].where((b) => b.monto > 0).toList();

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.9,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
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
              Text(
                cliente.nombreDisplay,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                'Cliente #${cliente.idClienteErp}',
                style: const TextStyle(color: ShelfyTokens.muted),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: _KpiBox(
                      label: 'Saldo total',
                      value: fmt.format(cliente.saldo),
                      color: ShelfyTokens.error,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _KpiBox(
                      label: 'Antigüedad',
                      value: cliente.diasVencido != null
                          ? '${cliente.diasVencido} días'
                          : '—',
                      color: cliente.esCritico
                          ? ShelfyTokens.error
                          : ShelfyTokens.warning,
                    ),
                  ),
                ],
              ),
              if (cliente.cantidadComprobantes > 0) ...[
                const SizedBox(height: 12),
                Text(
                  '${cliente.cantidadComprobantes} comprobante'
                  '${cliente.cantidadComprobantes == 1 ? '' : 's'} pendiente'
                  '${cliente.cantidadComprobantes == 1 ? '' : 's'}',
                  style: const TextStyle(
                    fontSize: 13,
                    color: ShelfyTokens.textSoft,
                  ),
                ),
              ],
              if (buckets.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(
                  'Desglose por antigüedad',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: ShelfyTokens.primary,
                      ),
                ),
                const SizedBox(height: 10),
                ...buckets.map(
                  (b) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            b.label,
                            style: const TextStyle(fontSize: 14),
                          ),
                        ),
                        Text(
                          fmt.format(b.monto),
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _KpiBox extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _KpiBox({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: ShelfyTokens.muted),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
