import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/build_info.dart';
import '../../theme/shelfy_tokens.dart';
import 'cuentas_provider.dart';
import 'models/cc_response.dart';
import 'widgets/cc_detalle_sheet.dart';

/// Pantalla de cuentas corrientes del vendedor.
class CuentasScreen extends StatefulWidget {
  const CuentasScreen({super.key});

  @override
  State<CuentasScreen> createState() => _CuentasScreenState();
}

class _CuentasScreenState extends State<CuentasScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CuentasProvider>().fetch(modo: 'general');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CuentasProvider>(
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
                Text(
                  provider.error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: ShelfyTokens.muted),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () =>
                      context.read<CuentasProvider>().fetch(modo: provider.modo, force: true),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        final data = provider.ccData!;

        return RefreshIndicator(
          color: ShelfyTokens.primary,
          onRefresh: () =>
              context.read<CuentasProvider>().fetch(modo: provider.modo, force: true),
          child: _CuentasList(data: data),
        );
      },
    );
  }
}

class _CuentasList extends StatelessWidget {
  final CcResponse data;

  const _CuentasList({required this.data});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat.currency(locale: 'es_AR', symbol: '\$');

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 1. Toggle Hoy / General
        _ModoToggle(),
        const SizedBox(height: 16),

        // 2. Snapshot label
        if (data.snapshotLabel.isNotEmpty) ...[
          _SnapshotLabel(label: data.snapshotLabel),
          const SizedBox(height: 8),
        ],

        // 3. Header totales
        _CcHeader(data: data),
        const SizedBox(height: 8),
        Text(
          'Build ${BuildInfo.versionLabel} · ${BuildInfo.tag}',
          style: const TextStyle(fontSize: 10, color: ShelfyTokens.muted),
        ),
        const SizedBox(height: 12),

        // 4. Lista clientes
        if (data.clientes.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(
              child: Text(
                'Sin cuentas corrientes en este período',
                style: TextStyle(color: ShelfyTokens.muted),
              ),
            ),
          )
        else ...[
          Text(
            'Clientes con saldo',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: ShelfyTokens.primary,
                ),
          ),
          const SizedBox(height: 8),
          ...data.clientes
              .map((c) => _ClienteCcTile(cliente: c, fmt: fmt)),
        ],
      ],
    );
  }
}

class _ModoToggle extends StatelessWidget {
  const _ModoToggle();

  @override
  Widget build(BuildContext context) {
    return Consumer<CuentasProvider>(
      builder: (context, provider, _) {
        return Row(
          children: [
            _ToggleButton(
              label: 'General',
              selected: provider.modo == 'general',
              onTap: () {
                if (provider.modo != 'general') {
                  provider.fetch(modo: 'general', force: true);
                }
              },
            ),
            const SizedBox(width: 8),
            _ToggleButton(
              label: 'Hoy',
              selected: provider.modo == 'hoy',
              onTap: () {
                if (provider.modo != 'hoy') {
                  provider.fetch(modo: 'hoy', force: true);
                }
              },
            ),
          ],
        );
      },
    );
  }
}

class _ToggleButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _ToggleButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? colorScheme.primaryContainer
              : colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected
                ? colorScheme.onPrimaryContainer
                : colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _CcHeader extends StatelessWidget {
  final CcResponse data;

  const _CcHeader({required this.data});

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
                    fmt.format(data.totalSaldo),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: data.totalSaldo > 0
                              ? ShelfyTokens.error
                              : ShelfyTokens.primary,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Saldo total pendiente',
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: ShelfyTokens.muted),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${data.totalClientes}',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                Text(
                  'clientes',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: ShelfyTokens.muted),
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
        const Icon(
          Icons.access_time_outlined,
          size: 13,
          color: ShelfyTokens.muted,
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: ShelfyTokens.muted),
        ),
      ],
    );
  }
}

class _ClienteCcTile extends StatelessWidget {
  final ClienteCc cliente;
  final NumberFormat fmt;

  const _ClienteCcTile({required this.cliente, required this.fmt});

  String _formatFuc(String iso) {
    if (iso.length < 10) return iso;
    final parts = iso.substring(0, 10).split('-');
    if (parts.length != 3) return iso;
    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }

  Future<void> _openMaps() async {
    final url = cliente.mapsUrl();
    if (url == null) return;
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final esCritico = cliente.esCritico;
    final diasVencido = cliente.diasVencido;
    final fuc = cliente.fechaUltimaCompra;
    final hasMaps = cliente.mapsUrl() != null;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => CcDetalleSheet.show(context, cliente),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
            // Fila 1: nombre + saldo
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    cliente.nombreDisplay,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  fmt.format(cliente.saldo),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: cliente.saldo > 0
                        ? ShelfyTokens.error
                        : ShelfyTokens.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            // Fila 2: ERP id + antigüedad + FUC
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                _InfoChip(
                  label: '#${cliente.idClienteErp}',
                  color: ShelfyTokens.muted,
                ),
                if (diasVencido != null && diasVencido > 0)
                  _InfoChip(
                    label: 'Antigüedad $diasVencido d',
                    color: esCritico ? ShelfyTokens.error : ShelfyTokens.warning,
                    filled: true,
                  ),
                if (fuc != null && fuc.isNotEmpty)
                  _InfoChip(
                    label: 'ÚC: ${_formatFuc(fuc)}',
                    color: ShelfyTokens.textSoft,
                  ),
              ],
            ),
            // Aging visual: barras proporcionales por bucket de deuda
            if (cliente.saldo > 0) ...[
              const SizedBox(height: 8),
              _AgingBar(cliente: cliente),
            ],
            if (hasMaps) ...[
              const SizedBox(height: 8),
              GestureDetector(
                onTap: _openMaps,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.map_outlined, size: 14, color: ShelfyTokens.primary),
                    const SizedBox(width: 4),
                    Text(
                      'Ver en Google Maps',
                      style: const TextStyle(
                        fontSize: 12,
                        color: ShelfyTokens.primary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final String label;
  final Color color;
  final bool filled;

  const _InfoChip({
    required this.label,
    required this.color,
    this.filled = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: filled ? color.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(6),
        border: filled ? null : Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: filled ? FontWeight.w600 : FontWeight.w400,
          color: color,
        ),
      ),
    );
  }
}

/// Barra visual de aging: segmentos coloreados proporcionales a cada bucket de deuda.
class _AgingBar extends StatelessWidget {
  final ClienteCc cliente;

  const _AgingBar({required this.cliente});

  @override
  Widget build(BuildContext context) {
    final buckets = <_Bucket>[
      _Bucket('≤7d', cliente.deuda7Dias, Colors.green),
      _Bucket('≤15d', cliente.deuda15Dias, Colors.lightGreen),
      _Bucket('≤30d', cliente.deuda30Dias, Colors.orange),
      _Bucket('≤60d', cliente.deuda60Dias, Colors.deepOrange),
      _Bucket('>60d', cliente.deudaMas60Dias, ShelfyTokens.error),
    ].where((b) => b.value > 0).toList();

    if (buckets.isEmpty) return const SizedBox.shrink();

    final total = buckets.fold<double>(0, (s, b) => s + b.value);
    final fmt = NumberFormat.compactCurrency(locale: 'es_AR', symbol: '\$');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Row(
            children: buckets
                .map(
                  (b) => Expanded(
                    flex: ((b.value / total) * 100).clamp(1, 100).round(),
                    child: Container(height: 6, color: b.color),
                  ),
                )
                .toList(),
          ),
        ),
        const SizedBox(height: 4),
        Wrap(
          spacing: 8,
          runSpacing: 2,
          children: buckets
              .map(
                (b) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: b.color, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 3),
                    Text(
                      '${b.label} ${fmt.format(b.value)}',
                      style: const TextStyle(fontSize: 10, color: ShelfyTokens.textSoft),
                    ),
                  ],
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class _Bucket {
  final String label;
  final double value;
  final Color color;
  const _Bucket(this.label, this.value, this.color);
}
