import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/offline/sync_worker.dart';
import '../../core/offline/upload_queue.dart';
import '../capture/capture_provider.dart';
import '../capture/capture_screen.dart';
import '../cartera/cartera_provider.dart';
import '../cartera/cartera_screen.dart';
import '../objetivos/objetivos_provider.dart';
import '../objetivos/objetivos_screen.dart';
import '../stats/stats_provider.dart';
import '../stats/stats_screen.dart';

/// Shell de navegación principal con BottomNavigationBar (4 tabs).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final api = context.read<ApiClient>();

    final db = context.read<ShelfyDatabase>();

    final tabs = [
      ChangeNotifierProvider<CaptureProvider>(
        create: (_) => CaptureProvider(apiClient: api, db: db),
        child: const CaptureScreen(),
      ),
      ChangeNotifierProvider<CarteraProvider>(
        create: (_) => CarteraProvider(api: api),
        child: const CarteraScreen(),
      ),
      ChangeNotifierProvider<StatsProvider>(
        create: (_) => StatsProvider(api: api),
        child: const StatsScreen(),
      ),
      ChangeNotifierProvider<ObjetivosProvider>(
        create: (_) => ObjetivosProvider(api: api),
        child: const ObjetivosScreen(),
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const _TenantLogo(),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync_outlined),
            tooltip: 'Sincronizar pendientes',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Sincronizando exhibiciones pendientes...'),
                  duration: Duration(seconds: 2),
                ),
              );
            },
          ),
        ],
      ),
      body: IndexedStack(
        index: _selectedIndex,
        children: tabs,
      ),
      bottomNavigationBar: _BottomNav(
        selectedIndex: _selectedIndex,
        onTap: (index) => setState(() => _selectedIndex = index),
      ),
    );
  }
}

/// BottomNavigationBar con badge de pendientes en la pestaña Captura.
class _BottomNav extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onTap;

  const _BottomNav({required this.selectedIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    // Intentar leer el stream de pendingCount del SyncWorker si está disponible.
    // Si no está en el árbol, simplemente no mostramos el badge.
    final syncWorker = _trySyncWorker(context);

    return BottomNavigationBar(
      currentIndex: selectedIndex,
      onTap: onTap,
      items: [
        BottomNavigationBarItem(
          icon: syncWorker != null
              ? StreamBuilder<int>(
                  stream: syncWorker,
                  builder: (context, snapshot) {
                    final count = snapshot.data ?? 0;
                    if (count > 0) {
                      return Badge(
                        label: Text('$count'),
                        child: const Icon(Icons.camera_alt_outlined),
                      );
                    }
                    return const Icon(Icons.camera_alt_outlined);
                  },
                )
              : const Icon(Icons.camera_alt_outlined),
          activeIcon: const Icon(Icons.camera_alt),
          label: 'Captura',
          tooltip: 'Registrar exhibición',
        ),
        const BottomNavigationBarItem(
          icon: Icon(Icons.list_alt_outlined),
          activeIcon: Icon(Icons.list_alt),
          label: 'Cartera',
          tooltip: 'Ver clientes de tu ruta',
        ),
        const BottomNavigationBarItem(
          icon: Icon(Icons.bar_chart_outlined),
          activeIcon: Icon(Icons.bar_chart),
          label: 'Stats',
          tooltip: 'Estadísticas de rendimiento',
        ),
        const BottomNavigationBarItem(
          icon: Icon(Icons.flag_outlined),
          activeIcon: Icon(Icons.flag),
          label: 'Objetivos',
          tooltip: 'Mis objetivos activos',
        ),
      ],
    );
  }

  /// Obtiene el stream de pendingCount del SyncWorker.
  /// Devuelve null si el worker no está registrado en el contexto.
  Stream<int>? _trySyncWorker(BuildContext context) {
    try {
      return context.read<SyncWorker>().pendingCount;
    } catch (_) {
      return null;
    }
  }
}

/// Widget del logo del tenant en el AppBar.
/// Cuando el branding esté disponible, reemplazar por una imagen de red.
class _TenantLogo extends StatelessWidget {
  const _TenantLogo();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.store_rounded,
          color: Theme.of(context).appBarTheme.foregroundColor,
          size: 22,
        ),
        const SizedBox(width: 8),
        const Text(
          'SHELFYAPP',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }
}
