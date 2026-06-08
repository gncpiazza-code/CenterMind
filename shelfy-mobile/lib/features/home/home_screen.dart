import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/offline/sync_worker.dart';
import '../../core/offline/upload_queue.dart';
import '../capture/capture_provider.dart';
import '../capture/capture_screen.dart';
import '../cartera/cartera_provider.dart';
import '../cartera/cartera_screen.dart';
import '../cuentas/cuentas_provider.dart';
import '../cuentas/cuentas_screen.dart';
import '../galeria/galeria_provider.dart';
import '../galeria/galeria_screen.dart';
import '../objetivos/objetivos_provider.dart';
import '../objetivos/objetivos_screen.dart';
import '../stats/stats_provider.dart';
import '../stats/stats_screen.dart';
import '../ventas/ventas_provider.dart';
import '../ventas/ventas_screen.dart';

/// Shell de navegación principal con BottomNavigationBar (7 tabs).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;
  bool _providersReady = false;

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
    _captureProvider = CaptureProvider(apiClient: api, db: db);
    _carteraProvider = CarteraProvider(api: api);
    _ventasProvider = VentasProvider(api: api);
    _cuentasProvider = CuentasProvider(api: api);
    _statsProvider = StatsProvider(api: api);
    _objetivosProvider = ObjetivosProvider(api: api);
    _galeriaProvider = GaleriaProvider(api: api);
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
        ChangeNotifierProvider<CaptureProvider>.value(value: _captureProvider),
        ChangeNotifierProvider<CarteraProvider>.value(value: _carteraProvider),
        ChangeNotifierProvider<VentasProvider>.value(value: _ventasProvider),
        ChangeNotifierProvider<CuentasProvider>.value(value: _cuentasProvider),
        ChangeNotifierProvider<StatsProvider>.value(value: _statsProvider),
        ChangeNotifierProvider<ObjetivosProvider>.value(
          value: _objetivosProvider,
        ),
        ChangeNotifierProvider<GaleriaProvider>.value(value: _galeriaProvider),
      ],
      child: Scaffold(
        appBar: AppBar(
          title: const _TenantLogo(),
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
          index: _selectedIndex,
          children: const [
            CaptureScreen(),    // 0
            CarteraScreen(),    // 1
            VentasScreen(),     // 2
            CuentasScreen(),    // 3
            StatsScreen(),      // 4
            ObjetivosScreen(),  // 5
            GaleriaScreen(),    // 6
          ],
        ),
        bottomNavigationBar: _BottomNav(
          selectedIndex: _selectedIndex,
          onTap: (index) => setState(() => _selectedIndex = index),
        ),
      ),
    );
  }
}

/// BottomNavigationBar con 7 tabs (tipo fixed) — Captura, Cartera, Ventas,
/// Cuentas, Stats, Objetivos, Galería.
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
      selectedFontSize: 10,
      unselectedFontSize: 9,
      iconSize: 22,
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
        // Tab 2: Ventas
        const BottomNavigationBarItem(
          icon: Icon(Icons.receipt_long_outlined),
          activeIcon: Icon(Icons.receipt_long),
          label: 'Ventas',
          tooltip: 'Ventas del mes',
        ),
        // Tab 3: Cuentas
        const BottomNavigationBarItem(
          icon: Icon(Icons.account_balance_wallet_outlined),
          activeIcon: Icon(Icons.account_balance_wallet),
          label: 'Cuentas',
          tooltip: 'Cuentas corrientes',
        ),
        // Tab 4: Stats
        const BottomNavigationBarItem(
          icon: Icon(Icons.bar_chart_outlined),
          activeIcon: Icon(Icons.bar_chart),
          label: 'Stats',
          tooltip: 'Estadísticas de rendimiento',
        ),
        // Tab 5: Objetivos
        const BottomNavigationBarItem(
          icon: Icon(Icons.flag_outlined),
          activeIcon: Icon(Icons.flag),
          label: 'Objetivos',
          tooltip: 'Mis objetivos activos',
        ),
        // Tab 6: Galería
        const BottomNavigationBarItem(
          icon: Icon(Icons.photo_library_outlined),
          activeIcon: Icon(Icons.photo_library),
          label: 'Galería',
          tooltip: 'Historial de exhibiciones por cliente',
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
