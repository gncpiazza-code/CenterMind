import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'models/ventas_response.dart';
import 'ventas_provider.dart';

/// Pantalla de ventas MTD del vendedor.
class VentasScreen extends StatefulWidget {
  const VentasScreen({super.key});

  @override
  State<VentasScreen> createState() => _VentasScreenState();
}

class _VentasScreenState extends State<VentasScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<VentasProvider>().fetch();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<VentasProvider>(
      builder: (context, provider, _) {
        if (provider.loading) {
          return const Center(child: CircularProgressIndicator());
        }

        if (provider.error != null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.grey),
                const SizedBox(height: 12),
                Text(
                  provider.error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.read<VentasProvider>().fetch(),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        final data = provider.ventasData;
        if (data == null) {
          return const SizedBox.shrink();
        }

        return RefreshIndicator(
          onRefresh: () => context.read<VentasProvider>().fetch(),
          child: _VentasList(data: data),
        );
      },
    );
  }
}

class _VentasList extends StatelessWidget {
  final VentasResponse data;

  const _VentasList({required this.data});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat.currency(locale: 'es_AR', symbol: '\$');

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 1. Selector de período (solo MTD por ahora)
        _PeriodPill(periodo: data.periodo),
        const SizedBox(height: 8),

        // 2. Snapshot label
        if (data.snapshotLabel.isNotEmpty) ...[
          _SnapshotLabel(label: data.snapshotLabel),
          const SizedBox(height: 12),
        ],

        // 3. Header: totales MTD
        _VentasHeader(data: data),
        const SizedBox(height: 16),

        // 4. Desglose bultos (expandible)
        if (data.bultosDesglose.isNotEmpty) ...[
          _BultosDesgloseSection(items: data.bultosDesglose),
          const SizedBox(height: 12),
        ],

        // 5. Top compradores (expandible)
        if (data.topCompradores.isNotEmpty) ...[
          _TopCompradoresSection(items: data.topCompradores),
          const SizedBox(height: 16),
        ],

        // 6. Lista de PDVs
        if (data.porPdv.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(
              child: Text(
                'Sin ventas registradas en este período',
                style: TextStyle(color: Colors.grey),
              ),
            ),
          )
        else ...[
          Text(
            'Detalle por PDV',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.primary,
                ),
          ),
          const SizedBox(height: 8),
          ...data.porPdv
              .map((pdv) => _PdvVentasTile(pdv: pdv, fmt: fmt))
              .toList(),
        ],
      ],
    );
  }
}

class _PeriodPill extends StatelessWidget {
  final String periodo;

  const _PeriodPill({required this.periodo});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            'MTD · $periodo',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Theme.of(context).colorScheme.onPrimaryContainer,
            ),
          ),
        ),
      ],
    );
  }
}

class _VentasHeader extends StatelessWidget {
  final VentasResponse data;

  const _VentasHeader({required this.data});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat.currency(locale: 'es_AR', symbol: '\$');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fmt.format(data.totalImporte),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Total vendido MTD',
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${data.totalFacturas}',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                Text(
                  'facturas',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Colors.grey[600]),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SnapshotLabel extends StatelessWidget {
  final String label;

  const _SnapshotLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(Icons.access_time_outlined, size: 13, color: Colors.grey[500]),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(fontSize: 12, color: Colors.grey[500]),
        ),
      ],
    );
  }
}

class _BultosDesgloseSection extends StatelessWidget {
  final List<BultosDesglose> items;

  const _BultosDesgloseSection({required this.items});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ExpansionTile(
        leading: const Icon(Icons.inventory_2_outlined),
        title: const Text(
          'Desglose bultos',
          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        children: items
            .map(
              (b) => ListTile(
                dense: true,
                title: Text(
                  b.articulo,
                  style: const TextStyle(fontSize: 13),
                ),
                trailing: Text(
                  '${b.bultos}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _TopCompradoresSection extends StatelessWidget {
  final List<TopComprador> items;

  const _TopCompradoresSection({required this.items});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ExpansionTile(
        leading: const Icon(Icons.leaderboard_outlined),
        title: const Text(
          'Top compradores',
          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        children: items
            .map(
              (c) => ListTile(
                dense: true,
                leading: CircleAvatar(
                  radius: 12,
                  backgroundColor:
                      Theme.of(context).colorScheme.primaryContainer,
                  child: Text(
                    '${c.rank}',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color:
                          Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
                title: Text(
                  c.nombreCliente,
                  style: const TextStyle(fontSize: 13),
                ),
                subtitle: Text(
                  '#${c.idClienteErp}',
                  style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                ),
                trailing: Text(
                  '${c.totalBultos} bts',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _PdvVentasTile extends StatelessWidget {
  final PdvVentas pdv;
  final NumberFormat fmt;

  const _PdvVentasTile({required this.pdv, required this.fmt});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(
          pdv.nombreDisplay,
          style: const TextStyle(fontWeight: FontWeight.w500),
        ),
        subtitle: Text(
          '#${pdv.idClienteErp} · ${pdv.facturas} factura${pdv.facturas != 1 ? "s" : ""}',
          style: TextStyle(color: Colors.grey[600], fontSize: 12),
        ),
        trailing: Text(
          fmt.format(pdv.importe),
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 15,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
      ),
    );
  }
}
