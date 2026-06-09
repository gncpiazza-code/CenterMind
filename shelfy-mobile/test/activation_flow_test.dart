import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shelfy_mobile/app.dart';
import 'package:shelfy_mobile/core/auth/auth_service.dart';
import 'package:shelfy_mobile/core/auth/session_model.dart';
import 'package:shelfy_mobile/core/offline/sync_worker.dart';
import 'package:shelfy_mobile/core/offline/upload_queue.dart';
import 'package:shelfy_mobile/features/home/home_screen.dart';

void main() {
  testWidgets('session activa navega al shell principal con 4 tabs', (
    WidgetTester tester,
  ) async {
    final auth = AuthService();
    auth.debugSetSession(
      const SessionData(
        jwt: 'test-jwt',
        idDistribuidor: 3,
        idVendedor: 42,
        deviceId: 'device-test',
        branding: {'primary_color': '#6C63FF'},
      ),
    );

    final db = ShelfyDatabase();
    final syncWorker = SyncWorker(db: db, api: auth.api);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthService>.value(value: auth),
          Provider<SyncWorker>.value(value: syncWorker),
        ],
        child: ShelfyApp(authService: auth, db: db),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // 4 tabs: Captura, Cartera, Stats, Más
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Captura'), findsOneWidget);
    expect(find.text('Cartera'), findsOneWidget);
    expect(find.text('Stats'), findsOneWidget);
    expect(find.text('Más'), findsOneWidget);

    await tester.tap(find.text('Cartera'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Hoy'), findsOneWidget);

    await tester.tap(find.text('Stats'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('Más'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    // Hub Más debe mostrar sus 4 destinos
    expect(find.text('Ventas'), findsOneWidget);
    expect(find.text('Cuentas'), findsOneWidget);

    await tester.tap(find.text('Captura'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Abriendo cámara...'), findsOneWidget);
  });
}
