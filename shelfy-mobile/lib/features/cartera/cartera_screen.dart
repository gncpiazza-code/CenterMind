import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'cartera_provider.dart';
import 'models/cartera_models.dart';
import 'models/ruta_hoy_model.dart';
import 'widgets/pdv_cartera_tile.dart';

/// Pantalla de cartera de clientes con pestañas Hoy / General.
class CarteraScreen extends StatefulWidget {
  const CarteraScreen({super.key});

  @override
  State<CarteraScreen> createState() => _CarteraScreenState();
}

class _CarteraScreenState extends State<CarteraScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);

    // Carga inicial de ambas pestañas y resumen de ruta en el primer frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<CarteraProvider>();
      provider.fetchCartera('hoy');
      provider.fetchCartera('general');
      provider.fetchRutaHoy();
    });

    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        final provider = context.read<CarteraProvider>();
        if (_tabController.index == 0 && provider.cartaHoy == null) {
          provider.fetchCartera('hoy');
        } else if (_tabController.index == 1 &&
            provider.cartaGeneral == null) {
          provider.fetchCartera('general');
        }
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Hoy'),
            Tab(text: 'General'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: const [
              _CarteraTab(mode: 'hoy'),
              _CarteraTab(mode: 'general'),
            ],
          ),
        ),
      ],
    );
  }
}

class _CarteraTab extends StatelessWidget {
  final String mode;

  const _CarteraTab({required this.mode});

  @override
  Widget build(BuildContext context) {
    return Consumer<CarteraProvider>(
      builder: (context, provider, _) {
        final loading =
            mode == 'hoy' ? provider.loadingHoy : provider.loadingGeneral;
        final error = mode == 'hoy' ? provider.errorHoy : provider.errorGeneral;
        final data = mode == 'hoy' ? provider.cartaHoy : provider.cartaGeneral;

        if (loading) {
          return const Center(child: CircularProgressIndicator());
        }

        if (error != null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.grey),
                const SizedBox(height: 12),
                Text(
                  error,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () =>
                      context.read<CarteraProvider>().fetchCartera(mode),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        if (data == null) {
          return const SizedBox.shrink();
        }

        return RefreshIndicator(
          onRefresh: () async {
            await context.read<CarteraProvider>().fetchCartera(mode);
            if (mode == 'hoy') {
              await context.read<CarteraProvider>().fetchRutaHoy();
            }
          },
          child: _CarteraList(
            data: data,
            rutaHoy: mode == 'hoy' ? provider.rutaHoy : null,
          ),
        );
      },
    );
  }
}

class _CarteraList extends StatelessWidget {
  final CarteraResponse data;
  final RutaHoyResponse? rutaHoy;

  const _CarteraList({required this.data, this.rutaHoy});

  @override
  Widget build(BuildContext context) {
    // Construir lista agrupada por ruta.
    final items = <Widget>[];

    // Card de resumen ruta de hoy (solo tab Hoy)
    if (rutaHoy != null) {
      items.add(_RutaHoyCard(rutaHoy: rutaHoy!));
    }

    if (data.rutas.isEmpty) {
      items.add(
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 48),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.list_alt, size: 48, color: Colors.grey),
              SizedBox(height: 12),
              Text(
                'Sin clientes en esta cartera',
                style: TextStyle(color: Colors.grey),
              ),
            ],
          ),
        ),
      );
      return ListView(children: items);
    }

    if (data.snapshotLabel.isNotEmpty) {
      items.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(
            data.snapshotLabel,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: Colors.grey),
          ),
        ),
      );
    }

    for (final ruta in data.rutas) {
      items.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(
            ruta.diaSemana,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.primary,
                ),
          ),
        ),
      );
      for (final pdv in ruta.pdvs) {
        items.add(PdvCarteraTile(pdv: pdv));
        items.add(const Divider(height: 1, indent: 16));
      }
    }

    return ListView(children: items);
  }
}

/// Card de resumen de ruta del día de hoy.
class _RutaHoyCard extends StatelessWidget {
  final RutaHoyResponse rutaHoy;

  const _RutaHoyCard({required this.rutaHoy});

  @override
  Widget build(BuildContext context) {
    final pct = rutaHoy.porcentajeActividad;
    final colorScheme = Theme.of(context).colorScheme;

    // Color del badge según porcentaje de actividad
    Color badgeColor;
    if (pct >= 70) {
      badgeColor = Colors.green;
    } else if (pct >= 40) {
      badgeColor = Colors.orange;
    } else {
      badgeColor = Colors.red;
    }

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.route_outlined,
                  size: 18,
                  color: colorScheme.primary,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Hoy ${rutaHoy.diaSemana}',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: colorScheme.primary,
                        ),
                  ),
                ),
                // Badge porcentaje actividad
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: badgeColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${pct.toStringAsFixed(0)}% activo',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: badgeColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _StatChip(
                  label: 'Total',
                  value: '${rutaHoy.total}',
                  icon: Icons.store_outlined,
                  color: colorScheme.primary,
                ),
                const SizedBox(width: 8),
                _StatChip(
                  label: 'Activos',
                  value: '${rutaHoy.activos}',
                  icon: Icons.check_circle_outline,
                  color: Colors.green,
                ),
                const SizedBox(width: 8),
                _StatChip(
                  label: 'Por caer',
                  value: '${rutaHoy.porCaer}',
                  icon: Icons.warning_amber_outlined,
                  color: Colors.orange,
                ),
                const SizedBox(width: 8),
                _StatChip(
                  label: 'Inactivos',
                  value: '${rutaHoy.inactivos}',
                  icon: Icons.cancel_outlined,
                  color: Colors.red,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatChip({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(height: 2),
            Text(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                color: color.withValues(alpha: 0.8),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
