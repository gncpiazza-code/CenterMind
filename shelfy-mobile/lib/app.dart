import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/api/api_client.dart';
import 'core/auth/auth_service.dart';
import 'core/offline/upload_queue.dart';
import 'features/activation/activation_screen.dart';
import 'features/home/home_screen.dart';
import 'theme/tenant_theme.dart';

/// Entrada principal de la aplicación con routing y tema tenant.
class ShelfyApp extends StatelessWidget {
  final AuthService authService;
  final ShelfyDatabase db;

  const ShelfyApp({
    super.key,
    required this.authService,
    required this.db,
  });

  @override
  Widget build(BuildContext context) {
    final router = GoRouter(
      initialLocation: '/',
      redirect: (context, state) {
        final loggedIn = authService.isLoggedIn;
        final isActivation = state.matchedLocation == '/activation';

        if (!loggedIn && !isActivation) return '/activation';
        if (loggedIn && isActivation) return '/home';
        return null;
      },
      routes: [
        GoRoute(
          path: '/',
          redirect: (context, state) =>
              authService.isLoggedIn ? '/home' : '/activation',
        ),
        GoRoute(
          path: '/activation',
          builder: (context, state) => const ActivationScreen(),
        ),
        GoRoute(
          path: '/home',
          builder: (context, state) => const HomeScreen(),
        ),
      ],
    );

    final branding = authService.currentSession?.branding;

    // Proveer ApiClient y ShelfyDatabase para HomeScreen y sus providers.
    // SyncWorker ya es provisto en main.dart (outer Provider).
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: authService.api),
        Provider<ShelfyDatabase>.value(value: db),
      ],
      child: MaterialApp.router(
        title: 'SHELFYAPP',
        debugShowCheckedModeBanner: false,
        theme: buildTenantTheme(branding),
        routerConfig: router,
      ),
    );
  }
}
