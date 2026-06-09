import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/auth/auth_service.dart';
import 'core/config/app_config.dart';
import 'core/offline/sync_worker.dart';
import 'core/offline/upload_queue.dart';
import 'core/push/vendedor_push_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await AppConfig.ensureLoaded();

  // Inicializar base de datos offline.
  final db = ShelfyDatabase();

  // Inicializar API client.
  final apiClient = ApiClient();

  // Inicializar servicio de autenticación y cargar sesión persistida.
  final authService = AuthService(apiClient: apiClient);
  await authService.initialize();

  final syncWorker = SyncWorker(db: db, api: apiClient);

  // 401 global: limpiar sesión para que GoRouter redirija a /activation.
  apiClient.setUnauthorizedCallback(() => authService.logout());

  // Registrar token FCM si Firebase está configurado (stub por ahora).
  if (authService.isLoggedIn) {
    VendedorPushService(apiClient).requestAndRegisterToken();
  }

  runApp(
    // SyncWorker disponible en todo el árbol.
    // ApiClient y ShelfyDatabase son provistos dentro de ShelfyApp.
    MultiProvider(
      providers: [
        Provider<SyncWorker>.value(value: syncWorker),
        ChangeNotifierProvider<AuthService>.value(value: authService),
      ],
      child: ShelfyApp(
        authService: authService,
        db: db,
        syncWorker: syncWorker,
      ),
    ),
  );
}
