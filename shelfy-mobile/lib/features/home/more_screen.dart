import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/shelfy_tokens.dart';

import '../cuentas/cuentas_screen.dart';
import '../galeria/galeria_provider.dart';
import '../galeria/galeria_screen.dart';
import '../objetivos/objetivos_screen.dart';
import '../ventas/ventas_screen.dart';
import 'home_tab_controller.dart';

/// Hub animado "Más" — punto de entrada a Ventas, Cuentas, Objetivos, Galería.
class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final List<Animation<double>> _fadeAnims;
  late final List<Animation<Offset>> _slideAnims;

  static const _items = [
    _HubItem(
      index: 0,
      icon: Icons.receipt_long_outlined,
      activeIcon: Icons.receipt_long,
      label: 'Ventas',
      subtitle: 'Ventas del mes',
      color: ShelfyTokens.primary,
    ),
    _HubItem(
      index: 1,
      icon: Icons.account_balance_wallet_outlined,
      activeIcon: Icons.account_balance_wallet,
      label: 'Cuentas',
      subtitle: 'Saldos pendientes',
      color: ShelfyTokens.error,
    ),
    _HubItem(
      index: 2,
      icon: Icons.flag_outlined,
      activeIcon: Icons.flag,
      label: 'Objetivos',
      subtitle: 'Mis objetivos activos',
      color: ShelfyTokens.success,
    ),
    _HubItem(
      index: 3,
      icon: Icons.photo_library_outlined,
      activeIcon: Icons.photo_library,
      label: 'Galería',
      subtitle: 'Historial de exhibiciones',
      color: ShelfyTokens.accent,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );

    _fadeAnims = List.generate(_items.length, (i) {
      final start = i * 0.15;
      return Tween<double>(begin: 0, end: 1).animate(
        CurvedAnimation(
          parent: _ctrl,
          curve: Interval(start, (start + 0.5).clamp(0.0, 1.0),
              curve: Curves.easeOut),
        ),
      );
    });

    _slideAnims = List.generate(_items.length, (i) {
      final start = i * 0.15;
      return Tween<Offset>(
        begin: const Offset(0, 0.18),
        end: Offset.zero,
      ).animate(
        CurvedAnimation(
          parent: _ctrl,
          curve: Interval(start, (start + 0.5).clamp(0.0, 1.0),
              curve: Curves.easeOut),
        ),
      );
    });

    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _onTap(BuildContext context, int hubIndex) {
    final tabCtrl = context.read<HomeTabController>();

    // Pre-fetch galería si va a abrirse
    if (hubIndex == 3 && tabCtrl.pendingGaleriaClienteErp == null) {
      context.read<GaleriaProvider>().fetchClientes();
    }

    tabCtrl.pushMoreSubScreen(hubIndex);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<HomeTabController>(
      builder: (context, tabCtrl, _) {
        final subIndex = tabCtrl.moreSubScreenIndex;

        if (subIndex != null) {
          return _MoreSubScreen(
            subIndex: subIndex,
            onBack: () => tabCtrl.popMoreSubScreen(),
          );
        }

        return _HubGrid(
          items: _items,
          fadeAnims: _fadeAnims,
          slideAnims: _slideAnims,
          onTap: (i) => _onTap(context, i),
        );
      },
    );
  }
}

class _HubGrid extends StatelessWidget {
  final List<_HubItem> items;
  final List<Animation<double>> fadeAnims;
  final List<Animation<Offset>> slideAnims;
  final ValueChanged<int> onTap;

  const _HubGrid({
    required this.items,
    required this.fadeAnims,
    required this.slideAnims,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Más opciones',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
          ),
          const SizedBox(height: 20),
          Expanded(
            child: GridView.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.4,
              ),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final item = items[i];
                return FadeTransition(
                  opacity: fadeAnims[i],
                  child: SlideTransition(
                    position: slideAnims[i],
                    child: _HubCard(item: item, onTap: () => onTap(i)),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _HubCard extends StatelessWidget {
  final _HubItem item;
  final VoidCallback onTap;

  const _HubCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: item.color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(item.icon, color: item.color, size: 28),
              const Spacer(),
              Text(
                item.label,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: item.color,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                item.subtitle,
                style: TextStyle(
                  fontSize: 11,
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.55),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MoreSubScreen extends StatelessWidget {
  final int subIndex;
  final VoidCallback onBack;

  const _MoreSubScreen({required this.subIndex, required this.onBack});

  static const _titles = ['Ventas', 'Cuentas', 'Objetivos', 'Galería'];

  @override
  Widget build(BuildContext context) {
    final body = switch (subIndex) {
      0 => const VentasScreen(),
      1 => const CuentasScreen(),
      2 => const ObjetivosScreen(),
      3 => const GaleriaScreen(),
      _ => const SizedBox.shrink(),
    };

    return Column(
      children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          elevation: 0,
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                tooltip: 'Volver',
                onPressed: onBack,
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Text(
                  _titles[subIndex],
                  key: ValueKey(subIndex),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(child: body),
      ],
    );
  }
}

class _HubItem {
  final int index;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final String subtitle;
  final Color color;

  const _HubItem({
    required this.index,
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.subtitle,
    required this.color,
  });
}
