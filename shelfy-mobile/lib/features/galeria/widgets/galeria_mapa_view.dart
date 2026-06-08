import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../galeria_provider.dart';
import '../models/galeria_models.dart';
import 'galeria_timeline_sheet.dart';

/// Vista de mapa para la galería.
///
/// No hay package de mapas en pubspec.yaml, por lo que se presenta
/// una lista de clientes con coordenadas y un mensaje informativo.
/// Cuando se integre un package de mapas (flutter_map, google_maps_flutter, etc.)
/// este widget es el punto de extensión correcto.
class GaleriaMapaView extends StatelessWidget {
  const GaleriaMapaView({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<GaleriaProvider>(
      builder: (context, provider, _) {
        if (provider.loadingClientes) {
          return const Center(child: CircularProgressIndicator());
        }

        if (provider.errorClientes != null) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.grey),
                  const SizedBox(height: 12),
                  Text(
                    provider.errorClientes!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.grey),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => provider.fetchClientes(),
                    child: const Text('Reintentar'),
                  ),
                ],
              ),
            ),
          );
        }

        final clientes = provider.clientes;
        final conCoordenadas =
            clientes.where((c) => c.latitud != null && c.longitud != null).toList();
        final sinCoordenadas =
            clientes.where((c) => c.latitud == null || c.longitud == null).toList();

        if (clientes.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.map_outlined, size: 64, color: Colors.grey),
                SizedBox(height: 12),
                Text(
                  'Sin clientes con exhibiciones',
                  style: TextStyle(color: Colors.grey),
                ),
              ],
            ),
          );
        }

        return Column(
          children: [
            // Banner informativo
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: Theme.of(context).colorScheme.secondaryContainer,
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline,
                    size: 16,
                    color: Theme.of(context).colorScheme.onSecondaryContainer,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Mapa disponible próximamente. Mostrando lista de ubicaciones.',
                      style: TextStyle(
                        fontSize: 12,
                        color:
                            Theme.of(context).colorScheme.onSecondaryContainer,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: RefreshIndicator(
                onRefresh: () => provider.fetchClientes(),
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 32),
                  children: [
                    if (conCoordenadas.isNotEmpty) ...[
                      _SectionHeader(
                        icon: Icons.location_on_rounded,
                        title: 'Con ubicación (${conCoordenadas.length})',
                        color: Theme.of(context).colorScheme.primary,
                      ),
                      ...conCoordenadas.map(
                        (c) => _ClienteMapaTile(
                          cliente: c,
                          onTap: () => _openTimeline(context, c),
                        ),
                      ),
                    ],
                    if (sinCoordenadas.isNotEmpty) ...[
                      _SectionHeader(
                        icon: Icons.location_off_rounded,
                        title: 'Sin ubicación (${sinCoordenadas.length})',
                        color: Theme.of(context).colorScheme.outline,
                      ),
                      ...sinCoordenadas.map(
                        (c) => _ClienteMapaTile(
                          cliente: c,
                          onTap: () => _openTimeline(context, c),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
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

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color color;

  const _SectionHeader({
    required this.icon,
    required this.title,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
      child: Row(
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 6),
          Text(
            title,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }
}

class _ClienteMapaTile extends StatelessWidget {
  final GaleriaCliente cliente;
  final VoidCallback onTap;

  const _ClienteMapaTile({required this.cliente, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final tieneCoords = cliente.latitud != null && cliente.longitud != null;

    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: tieneCoords
              ? Theme.of(context).colorScheme.primaryContainer
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(
          tieneCoords ? Icons.location_on_rounded : Icons.location_off_rounded,
          color: tieneCoords
              ? Theme.of(context).colorScheme.onPrimaryContainer
              : Theme.of(context).colorScheme.outline,
          size: 20,
        ),
      ),
      title: Text(
        cliente.nombreDisplay,
        style: const TextStyle(fontWeight: FontWeight.w500),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: tieneCoords
          ? Text(
              '${cliente.latitud!.toStringAsFixed(4)}, ${cliente.longitud!.toStringAsFixed(4)}',
              style: const TextStyle(fontSize: 12),
            )
          : const Text(
              'Sin coordenadas',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              '${cliente.totalExhibiciones}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.onPrimaryContainer,
              ),
            ),
          ),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right_rounded, color: Colors.grey),
        ],
      ),
      onTap: onTap,
    );
  }
}
