import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/offline/sync_worker.dart';
import '../../core/offline/upload_queue.dart';
import '../../shared/widgets/shelfy/shelfy_widgets.dart';
import '../../theme/shelfy_tokens.dart';
import '../capture/capture_provider.dart';
import '../capture/capture_screen.dart';
import '../cartera/cartera_provider.dart';
import '../cartera/cartera_screen.dart';
import '../cuentas/cuentas_provider.dart';
import '../galeria/galeria_provider.dart';
import '../objetivos/objetivos_provider.dart';
import '../stats/stats_provider.dart';
import '../stats/stats_screen.dart';
import '../ventas/ventas_provider.dart';
import 'home_tab_controller.dart';
import 'more_screen.dart';

/// Shell de navegación principal con BottomNavigationBar de 4 tabs.
/// Tabs: Captura · Cartera · Stats · Más (hub animado → Ventas/Cuentas/Objetivos/Galería).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _providersReady = false;

  late HomeTabController _tabController;
  late CaptureProvider _captureProvider;
  late CarteraProvider _carteraProvider;
  late VentasProvider _ventasProvider;
  late CuentasProvider _cuentasProvider;
  late StatsProvider _statsProvider;
  late ObjetivosProvider _objetivosProvider;
  late GaleriaProvider _galeriaProvider;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_providersReady) return;

    final api = context.read<ApiClient>();
    final db = context.read<ShelfyDatabase>();
    _tabController = HomeTabController();
    _captureProvider = CaptureProvider(apiClient: api, db: db);
    _carteraProvider = CarteraProvider(api: api);
    _ventasProvider = VentasProvider(api: api);
    _cuentasProvider = CuentasProvider(api: api);
    _statsProvider = StatsProvider(api: api);
    _objetivosProvider = ObjetivosProvider(api: api);
    _galeriaProvider = GaleriaProvider(api: api);
    _captureProvider.onUploadSuccess = (nroCliente) {
      _galeriaProvider.refreshAfterUpload(nroCliente);
    };
    _providersReady = true;
  }

  @override
  Widget build(BuildContext context) {
    if (!_providersReady) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return MultiProvider(
      providers: [
        ChangeNotifierProvider<HomeTabController>.value(value: _tabController),
        ChangeNotifierProvider<CaptureProvider>.value(value: _captureProvider),
        ChangeNotifierProvider<CarteraProvider>.value(value: _carteraProvider),
        ChangeNotifierProvider<VentasProvider>.value(value: _ventasProvider),
        ChangeNotifierProvider<CuentasProvider>.value(value: _cuentasProvider),
        ChangeNotifierProvider<StatsProvider>.value(value: _statsProvider),
        ChangeNotifierProvider<ObjetivosProvider>.value(
            value: _objetivosProvider),
        ChangeNotifierProvider<GaleriaProvider>.value(value: _galeriaProvider),
      ],
      child: ListenableBuilder(
        listenable: _tabController,
        builder: (context, _) => Scaffold(
          appBar: AppBar(
            title: const ShelfyAppBarTitle(),
            actions: [
              IconButton(
                icon: const Icon(Icons.sync_outlined),
                tooltip: 'Sincronizar pendientes',
                onPressed: () {
                  context.read<SyncWorker>().syncNow();
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
            index: _tabController.selectedIndex,
            children: const [
              CaptureScreen(), // 0
              CarteraScreen(), // 1
              StatsScreen(),   // 2
              MoreScreen(),    // 3 — hub animado
            ],
          ),
          bottomNavigationBar: _BottomNav(
            selectedIndex: _tabController.selectedIndex,
            onTap: (index) => _tabController.goToTab(index),
          ),
        ),
      ),
    );
  }
}

/// BottomNavigationBar con 4 tabs: Captura, Cartera, Stats, Más.
class _BottomNav extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onTap;

  const _BottomNav({required this.selectedIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final syncWorker = _trySyncWorker(context);

    return BottomNavigationBar(
      currentIndex: selectedIndex,
      onTap: onTap,
      type: BottomNavigationBarType.fixed,
      selectedFontSize: 11,
      unselectedFontSize: 10,
      iconSize: 24,
      selectedItemColor: ShelfyTokens.primary,
      unselectedItemColor: ShelfyTokens.muted,
      backgroundColor: ShelfyTokens.panel,
      items: [
        // Tab 0: Captura
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
        // Tab 1: Cartera
        const BottomNavigationBarItem(
          icon: Icon(Icons.list_alt_outlined),
          activeIcon: Icon(Icons.list_alt),
          label: 'Cartera',
          tooltip: 'Ver clientes de tu ruta',
        ),
        // Tab 2: Stats
        const BottomNavigationBarItem(
          icon: Icon(Icons.bar_chart_outlined),
          activeIcon: Icon(Icons.bar_chart),
          label: 'Stats',
          tooltip: 'Estadísticas de rendimiento',
        ),
        // Tab 3: Más
        const BottomNavigationBarItem(
          icon: Icon(Icons.grid_view_outlined),
          activeIcon: Icon(Icons.grid_view),
          label: 'Más',
          tooltip: 'Ventas, Cuentas, Objetivos, Galería',
        ),
      ],
    );
  }

  Stream<int>? _trySyncWorker(BuildContext context) {
    try {
      return context.read<SyncWorker>().pendingCount;
    } catch (_) {
      return null;
    }
  }
}

