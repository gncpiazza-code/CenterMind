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
class ShelfyApp extends StatefulWidget {
  final AuthService authService;
  final ShelfyDatabase db;

  const ShelfyApp({
    super.key,
    required this.authService,
    required this.db,
  });

  @override
  State<ShelfyApp> createState() => _ShelfyAppState();
}

class _ShelfyAppState extends State<ShelfyApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = GoRouter(
      initialLocation: '/',
      refreshListenable: widget.authService,
      redirect: (context, state) {
        final loggedIn = widget.authService.isLoggedIn;
        final location = state.matchedLocation;
        final isActivation = location == '/activation';

        if (!loggedIn && !isActivation) return '/activation';
        if (loggedIn && isActivation) return '/home';
        return null;
      },
      routes: [
        GoRoute(
          path: '/',
          redirect: (context, state) =>
              widget.authService.isLoggedIn ? '/home' : '/activation',
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
  }

  @override
  Widget build(BuildContext context) {
    final branding = widget.authService.currentSession?.branding;

    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: widget.authService.api),
        Provider<ShelfyDatabase>.value(value: widget.db),
      ],
      child: MaterialApp.router(
        title: 'Shelfy',
        debugShowCheckedModeBanner: false,
        theme: buildTenantTheme(branding),
        routerConfig: _router,
      ),
    );
  }
}
