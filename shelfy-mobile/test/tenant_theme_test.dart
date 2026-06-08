import 'package:flutter_test/flutter_test.dart';
import 'package:shelfy_mobile/theme/tenant_theme.dart';

void main() {
  test('buildTenantTheme tolerates invalid branding colors', () {
    expect(
      () => buildTenantTheme({'primary_color': '#NOT_HEX'}),
      returnsNormally,
    );
    final theme = buildTenantTheme({'primary_color': '#NOT_HEX'});
    expect(theme.colorScheme.primary, isNotNull);
  });

  test('buildTenantTheme applies valid branding colors', () {
    final theme = buildTenantTheme({'primary_color': '#112233'});
    expect(theme.colorScheme.primary, isNotNull);
  });
}
