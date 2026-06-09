import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'cuentas_provider.dart';
import 'models/cc_response.dart';

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
                  onPressed: () =>
                      context.read<CuentasProvider>().fetch(modo: provider.modo),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        final data = provider.ccData;
        if (data == null) {
          return const SizedBox.shrink();
        }

        return RefreshIndicator(
          onRefresh: () =>
              context.read<CuentasProvider>().fetch(modo: provider.modo),
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
        const SizedBox(height: 16),

        // 4. Lista clientes
        if (data.clientes.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(
              child: Text(
                'Sin cuentas corrientes en este período',
                style: TextStyle(color: Colors.grey),
              ),
            ),
          )
        else ...[
          Text(
            'Clientes con saldo',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.primary,
                ),
          ),
          const SizedBox(height: 8),
          ...data.clientes
              .map((c) => _ClienteCcTile(cliente: c, fmt: fmt))
              .toList(),
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
                  provider.fetch(modo: 'general');
                }
              },
            ),
            const SizedBox(width: 8),
            _ToggleButton(
              label: 'Hoy',
              selected: provider.modo == 'hoy',
              onTap: () {
                if (provider.modo != 'hoy') {
                  provider.fetch(modo: 'hoy');
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
                              ? Colors.red[700]
                              : Theme.of(context).colorScheme.primary,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Saldo total pendiente',
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
        Icon(
          Icons.access_time_outlined,
          size: 13,
          color: Colors.grey[500],
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(fontSize: 12, color: Colors.grey[500]),
        ),
      ],
    );
  }
}

class _ClienteCcTile extends StatelessWidget {
  final ClienteCc cliente;
  final NumberFormat fmt;

  const _ClienteCcTile({required this.cliente, required this.fmt});

  @override
  Widget build(BuildContext context) {
    final esCritico = cliente.esCritico;
    final diasVencido = cliente.diasVencido;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(
          cliente.nombreDisplay,
          style: const TextStyle(fontWeight: FontWeight.w500),
        ),
        subtitle: Row(
          children: [
            Text(
              '#${cliente.idClienteErp}',
              style: TextStyle(color: Colors.grey[600], fontSize: 12),
            ),
            if (diasVencido != null) ...[
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: esCritico
                      ? Colors.red.withValues(alpha: 0.12)
                      : Colors.orange.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$diasVencido días vencido',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: esCritico ? Colors.red[700] : Colors.orange[800],
                  ),
                ),
              ),
            ],
          ],
        ),
        trailing: Text(
          fmt.format(cliente.saldo),
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 15,
            color: cliente.saldo > 0
                ? Colors.red[700]
                : Theme.of(context).colorScheme.primary,
          ),
        ),
      ),
    );
  }
}
