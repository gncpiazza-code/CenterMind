import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../galeria_provider.dart';
import '../models/galeria_models.dart';
import 'galeria_cliente_card.dart';
import 'galeria_timeline_sheet.dart';

/// Grid 2 columnas de clientes con exhibiciones.
class GaleriaGrid extends StatelessWidget {
  const GaleriaGrid({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<GaleriaProvider>(
      builder: (context, provider, _) {
        if (provider.loadingClientes) {
          return const Center(child: CircularProgressIndicator());
        }

        if (provider.errorClientes != null) {
          return _ErrorState(
            message: provider.errorClientes!,
            onRetry: () => provider.fetchClientes(force: true),
          );
        }

        if (provider.clientes.isEmpty) {
          return const _EmptyState();
        }

        return RefreshIndicator(
          onRefresh: () => provider.fetchClientes(force: true),
          child: GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.72,
            ),
            itemCount: provider.clientes.length,
            itemBuilder: (context, index) {
              final cliente = provider.clientes[index];
              return GaleriaClienteCard(
                cliente: cliente,
                onTap: () => _openTimeline(context, cliente),
              );
            },
          ),
        );
      },
    );
  }

  void _openTimeline(BuildContext context, GaleriaCliente cliente) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => ChangeNotifierProvider.value(
        value: context.read<GaleriaProvider>(),
        child: GaleriaTimelineSheet(cliente: cliente),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.grey),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: onRetry,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.photo_library_outlined,
            size: 64,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 16),
          Text(
            'Sin exhibiciones registradas',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Las fotos que captures aparecerán aquí',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey,
                ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
