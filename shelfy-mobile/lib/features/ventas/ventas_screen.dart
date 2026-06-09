import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/shelfy_tokens.dart';
import 'models/ventas_response.dart';
import 'ventas_provider.dart';

/// Ventas MTD — solo volumen (bultos + unidades). Sin importes en app móvil.
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
        if (!provider.hasLoaded || provider.loading) {
          return const Center(
            child: CircularProgressIndicator(color: ShelfyTokens.primary),
          );
        }

        if (provider.error != null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: ShelfyTokens.muted),
                const SizedBox(height: 12),
                Text(provider.error!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () =>
                      context.read<VentasProvider>().fetch(force: true),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        final data = provider.ventasData!;
        return RefreshIndicator(
          color: ShelfyTokens.primary,
          onRefresh: () => context.read<VentasProvider>().fetch(force: true),
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
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _PeriodPill(periodo: data.periodo),
        const SizedBox(height: 8),
        if (data.snapshotLabel.isNotEmpty) ...[
          _SnapshotLabel(label: data.snapshotLabel),
          const SizedBox(height: 12),
        ],
        _VentasHeader(data: data),
        const SizedBox(height: 16),
        if (data.bultosDesglose.isNotEmpty) ...[
          _BultosDesgloseSection(items: data.bultosDesglose),
          const SizedBox(height: 12),
        ],
        if (data.topCompradores.isNotEmpty) ...[
          _TopCompradoresSection(items: data.topCompradores),
          const SizedBox(height: 16),
        ],
        if (data.porPdv.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(
              child: Text(
                'Sin ventas registradas en este período',
                style: TextStyle(color: ShelfyTokens.muted),
              ),
            ),
          )
        else ...[
          Text(
            'Detalle por PDV',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: ShelfyTokens.primary,
                ),
          ),
          const SizedBox(height: 8),
          ...data.porPdv.map((pdv) => _PdvVentasTile(pdv: pdv)),
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: ShelfyTokens.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        'MTD · $periodo',
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: ShelfyTokens.primary,
        ),
      ),
    );
  }
}

class _VentasHeader extends StatelessWidget {
  final VentasResponse data;
  const _VentasHeader({required this.data});

  @override
  Widget build(BuildContext context) {
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
                    '${data.totalBultos.toStringAsFixed(data.totalBultos % 1 == 0 ? 0 : 2)} bultos',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: ShelfyTokens.primary,
                        ),
                  ),
                  if (data.totalUnidades > 0) ...[
                    const SizedBox(height: 4),
                    Text(
                      '${data.totalUnidades.toStringAsFixed(0)} unidades',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: ShelfyTokens.textSoft,
                          ),
                    ),
                  ],
                  const SizedBox(height: 4),
                  const Text(
                    'Volumen MTD (sin importes)',
                    style: TextStyle(color: ShelfyTokens.muted, fontSize: 13),
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
                const Text('facturas', style: TextStyle(color: ShelfyTokens.muted)),
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
        const Icon(Icons.access_time_outlined, size: 13, color: ShelfyTokens.muted),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 12, color: ShelfyTokens.muted)),
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
        leading: const Icon(Icons.inventory_2_outlined, color: ShelfyTokens.primary),
        title: const Text('Desglose bultos', style: TextStyle(fontWeight: FontWeight.w600)),
        children: items
            .map(
              (b) => ListTile(
                dense: true,
                title: Text(b.articulo, style: const TextStyle(fontSize: 13)),
                trailing: Text(
                  b.volumenLabel,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
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
        leading: const Icon(Icons.leaderboard_outlined, color: ShelfyTokens.primary),
        title: const Text('Top compradores', style: TextStyle(fontWeight: FontWeight.w600)),
        children: items
            .map(
              (c) => ListTile(
                dense: true,
                leading: CircleAvatar(
                  radius: 12,
                  backgroundColor: ShelfyTokens.primary.withValues(alpha: 0.15),
                  child: Text(
                    '${c.rank}',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: ShelfyTokens.primary,
                    ),
                  ),
                ),
                title: Text(c.nombreCliente, style: const TextStyle(fontSize: 13)),
                subtitle: Text('#${c.idClienteErp}',
                    style: const TextStyle(fontSize: 11, color: ShelfyTokens.muted)),
                trailing: Text(
                  '${c.totalBultos} bts',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
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
  const _PdvVentasTile({required this.pdv});

  @override
  Widget build(BuildContext context) {
    final vol = pdv.unidades > 0
        ? '${pdv.bultos.toStringAsFixed(pdv.bultos % 1 == 0 ? 0 : 2)} bts · ${pdv.unidades.toStringAsFixed(0)} u'
        : '${pdv.bultos.toStringAsFixed(pdv.bultos % 1 == 0 ? 0 : 2)} bts';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(pdv.nombreDisplay, style: const TextStyle(fontWeight: FontWeight.w500)),
        subtitle: Text(
          '#${pdv.idClienteErp} · ${pdv.facturas} factura${pdv.facturas != 1 ? 's' : ''}',
          style: const TextStyle(color: ShelfyTokens.muted, fontSize: 12),
        ),
        trailing: Text(
          vol,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 13,
            color: ShelfyTokens.primary,
          ),
        ),
      ),
    );
  }
}
