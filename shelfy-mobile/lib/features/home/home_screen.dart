import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_service.dart';
import '../../core/offline/bundle_provider.dart';
import '../../core/offline/sync_worker.dart';
import '../../core/offline/upload_queue.dart';
import '../../shared/widgets/shelfy/shelfy_widgets.dart';
import '../../theme/shelfy_tokens.dart';
import '../settings/settings_screen.dart';
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
import 'home_tab_controller.dart';

/// Shell de navegación principal con BottomNavigationBar de 5 tabs MVP.
/// Tabs: Captura · CC · Cartera · Objetivos · Stats.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _providersReady = false;
  bool _captureTabReady = false; // lazy para evitar OOM iOS en cold start

  late HomeTabController _tabController;
  late BundleProvider _bundleProvider;
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
    final session = context.read<AuthService>().currentSession;
    _tabController = HomeTabController();
    _bundleProvider = BundleProvider(api: api);
    _bundleProvider.init(); // fetch en background; no await para no bloquear
    _captureProvider = CaptureProvider(
      apiClient: api,
      db: db,
      distId: session?.idDistribuidor,
      vendorId: session?.idVendedor,
    );
    _carteraProvider = CarteraProvider(api: api);
    _ventasProvider = VentasProvider(api: api);
    _cuentasProvider = CuentasProvider(api: api);
    _statsProvider = StatsProvider(api: api);
    _objetivosProvider = ObjetivosProvider(api: api);
    _galeriaProvider = GaleriaProvider(api: api);
    _captureProvider.onUploadSuccess = (nroCliente) {
      _galeriaProvider.refreshAfterUpload(nroCliente);
    };
    setState(() => _providersReady = true);

    // Lazy mount cámara ~350 ms tras providers listos — evita SIGKILL iOS cold start.
    Future<void>.delayed(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _captureTabReady = true);
    });
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content: const Text('¿Querés salir de tu cuenta?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Salir'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await context.read<AuthService>().logout();
    }
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
        ChangeNotifierProvider<BundleProvider>.value(value: _bundleProvider),
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
        builder: (context, _) {
          final onCaptureTab = _tabController.selectedIndex == 0;
          return Scaffold(
            extendBody: onCaptureTab,
            appBar: onCaptureTab
                ? null
                : AppBar(
                    title: const ShelfyAppBarTitle(),
                    actions: [
                      IconButton(
                        icon: const Icon(Icons.sync_outlined),
                        tooltip: 'Sincronizar pendientes',
                        onPressed: () {
                          context.read<SyncWorker>().syncNow();
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Sincronizando exhibiciones pendientes...',
                              ),
                              duration: Duration(seconds: 2),
                            ),
                          );
                        },
                      ),
                      IconButton(
                        icon: const Icon(Icons.settings_outlined),
                        tooltip: 'Ajustes',
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const SettingsScreen(),
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.logout_outlined),
                        tooltip: 'Cerrar sesión',
                        onPressed: () => _confirmLogout(context),
                      ),
                    ],
                  ),
            // Solo monta el tab activo — evita OOM con cámara + múltiples pantallas vivas.
            body: switch (_tabController.selectedIndex) {
              0 => _captureTabReady
                  ? const CaptureScreen(key: ValueKey('tab_capture'))
                  : const Center(child: CircularProgressIndicator()),
              1 => const CuentasScreen(key: ValueKey('tab_cc')),
              2 => const CarteraScreen(key: ValueKey('tab_cartera')),
              3 => const ObjetivosScreen(key: ValueKey('tab_objetivos')),
              4 => const StatsScreen(key: ValueKey('tab_stats')),
              5 => const GaleriaScreen(key: ValueKey('tab_galeria')),
              _ => const SizedBox.shrink(),
            },
            bottomNavigationBar: _BottomNav(
              selectedIndex: _tabController.selectedIndex,
              onTap: (index) => _tabController.goToTab(index),
            ),
          );
        },
      ),
    );
  }
}

/// BottomNavigationBar con 5 tabs MVP: Captura, CC, Cartera, Objetivos, Stats.
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
        // Tab 1: CC
        const BottomNavigationBarItem(
          icon: Icon(Icons.account_balance_wallet_outlined),
          activeIcon: Icon(Icons.account_balance_wallet),
          label: 'CC',
          tooltip: 'Cuentas corrientes',
        ),
        // Tab 2: Cartera
        const BottomNavigationBarItem(
          icon: Icon(Icons.list_alt_outlined),
          activeIcon: Icon(Icons.list_alt),
          label: 'Cartera',
          tooltip: 'Ver clientes de tu ruta',
        ),
        // Tab 3: Objetivos
        const BottomNavigationBarItem(
          icon: Icon(Icons.flag_outlined),
          activeIcon: Icon(Icons.flag),
          label: 'Objetivos',
          tooltip: 'Objetivos activos',
        ),
        // Tab 4: Stats
        const BottomNavigationBarItem(
          icon: Icon(Icons.bar_chart_outlined),
          activeIcon: Icon(Icons.bar_chart),
          label: 'Stats',
          tooltip: 'Estadísticas de rendimiento',
        ),
        // Tab 5: Galería
        const BottomNavigationBarItem(
          icon: Icon(Icons.photo_library_outlined),
          activeIcon: Icon(Icons.photo_library),
          label: 'Galería',
          tooltip: 'Historial de exhibiciones',
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

