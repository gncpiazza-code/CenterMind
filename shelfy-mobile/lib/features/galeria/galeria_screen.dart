import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../home/home_tab_controller.dart';
import 'galeria_provider.dart';
import 'models/galeria_models.dart';
import 'widgets/galeria_grid.dart';
import 'widgets/galeria_mapa_view.dart';
import 'widgets/galeria_timeline_sheet.dart';

/// Pantalla principal de galería — muestra exhibiciones por cliente.
///
/// Contiene toggle "Grid / Mapa" en la AppBar secondary area.
/// Vista default: Grid 2 columnas.
class GaleriaScreen extends StatefulWidget {
  const GaleriaScreen({super.key});

  @override
  State<GaleriaScreen> createState() => _GaleriaScreenState();
}

class _GaleriaScreenState extends State<GaleriaScreen> {
  late HomeTabController _shell;

  @override
  void initState() {
    super.initState();
    _shell = context.read<HomeTabController>();
    _shell.addListener(_onTabChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<GaleriaProvider>().fetchClientes();
      _maybeOpenPendingCliente();
    });
  }

  @override
  void dispose() {
    _shell.removeListener(_onTabChanged);
    super.dispose();
  }

  void _onTabChanged() {
    if (!mounted) return;
    if (context.read<HomeTabController>().selectedIndex == 6) {
      _maybeOpenPendingCliente();
    }
  }

  Future<void> _maybeOpenPendingCliente() async {
    if (_shell.selectedIndex != 6) return;
    final pending = _shell.takePendingGaleriaCliente();
    if (pending == null || pending.isEmpty) return;

    final galeria = context.read<GaleriaProvider>();
    await galeria.refreshAfterUpload(pending);
    if (!mounted) return;

    GaleriaCliente? cliente;
    for (final c in galeria.clientes) {
      if (c.idClienteErp == pending) {
        cliente = c;
        break;
      }
    }
    if (cliente == null) {
      final stripped = pending.replaceFirst(RegExp(r'^0+'), '');
      for (final c in galeria.clientes) {
        if (c.idClienteErp.replaceFirst(RegExp(r'^0+'), '') == stripped) {
          cliente = c;
          break;
        }
      }
    }

    if (cliente == null || !mounted) return;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => ChangeNotifierProvider.value(
        value: galeria,
        child: GaleriaTimelineSheet(cliente: cliente!),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<GaleriaProvider>(
      builder: (context, provider, _) {
        return Column(
          children: [
            // Toggle Grid / Mapa
            _ViewToggleBar(
              viewMode: provider.viewMode,
              onChanged: (mode) => provider.setViewMode(mode),
              onRefresh: () => provider.fetchClientes(),
            ),

            // Contenido
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: provider.viewMode == 'grid'
                    ? const GaleriaGrid(key: ValueKey('grid'))
                    : const GaleriaMapaView(key: ValueKey('mapa')),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ViewToggleBar extends StatelessWidget {
  final String viewMode;
  final ValueChanged<String> onChanged;
  final VoidCallback onRefresh;

  const _ViewToggleBar({
    required this.viewMode,
    required this.onChanged,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      color: colorScheme.surface,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Row(
        children: [
          // Toggle segmentado
          Expanded(
            child: Container(
              height: 36,
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  _ToggleOption(
                    label: 'Grid',
                    icon: Icons.grid_view_rounded,
                    isActive: viewMode == 'grid',
                    onTap: () => onChanged('grid'),
                  ),
                  _ToggleOption(
                    label: 'Mapa',
                    icon: Icons.map_outlined,
                    isActive: viewMode == 'mapa',
                    onTap: () => onChanged('mapa'),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(width: 8),

          // Botón refresh
          SizedBox(
            width: 36,
            height: 36,
            child: IconButton(
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh_rounded),
              iconSize: 20,
              tooltip: 'Actualizar galería',
              style: IconButton.styleFrom(
                backgroundColor: colorScheme.surfaceContainerHighest,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ToggleOption extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isActive;
  final VoidCallback onTap;

  const _ToggleOption({
    required this.label,
    required this.icon,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            color: isActive ? colorScheme.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 15,
                color: isActive
                    ? colorScheme.onPrimary
                    : colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 5),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight:
                      isActive ? FontWeight.w600 : FontWeight.w400,
                  color: isActive
                      ? colorScheme.onPrimary
                      : colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
