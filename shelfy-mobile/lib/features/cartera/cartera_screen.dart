import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'cartera_provider.dart';
import 'models/cartera_models.dart';
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

    // Carga inicial de ambas pestañas en el primer frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<CarteraProvider>();
      provider.fetchCartera('hoy');
      provider.fetchCartera('general');
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
          onRefresh: () =>
              context.read<CarteraProvider>().fetchCartera(mode),
          child: _CarteraList(data: data),
        );
      },
    );
  }
}

class _CarteraList extends StatelessWidget {
  final CarteraResponse data;

  const _CarteraList({required this.data});

  @override
  Widget build(BuildContext context) {
    if (data.rutas.isEmpty) {
      return const Center(
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
      );
    }

    // Construir lista agrupada por ruta.
    final items = <Widget>[];

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
