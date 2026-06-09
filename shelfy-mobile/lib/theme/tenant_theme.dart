import 'package:flutter/material.dart';
import 'shelfy_tokens.dart';

/// Construye el ThemeData Shelfy — violeta marca siempre; tenant solo ajusta acento.
ThemeData buildTenantTheme(Map<String, dynamic>? branding) {
  final tenantPrimary = _parseColor(branding?['primary_color']);
  final primary = _shelfyPrimary(tenantPrimary);

  final colorScheme = ColorScheme(
    brightness: Brightness.light,
    primary: primary,
    onPrimary: Colors.white,
    primaryContainer: primary.withValues(alpha: 0.12),
    onPrimaryContainer: primary,
    secondary: ShelfyTokens.primary2,
    onSecondary: Colors.white,
    surface: ShelfyTokens.panel,
    onSurface: ShelfyTokens.text,
    onSurfaceVariant: ShelfyTokens.textSoft,
    outline: ShelfyTokens.border,
    error: ShelfyTokens.error,
    onError: Colors.white,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: ShelfyTokens.bg,
    progressIndicatorTheme: ProgressIndicatorThemeData(color: primary),
    appBarTheme: AppBarTheme(
      backgroundColor: primary,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: true,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: primary, width: 2),
      ),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      selectedItemColor: primary,
      unselectedItemColor: ShelfyTokens.muted,
      backgroundColor: ShelfyTokens.panel,
      type: BottomNavigationBarType.fixed,
      elevation: 8,
    ),
    cardTheme: CardThemeData(
      color: ShelfyTokens.panel,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        side: const BorderSide(color: ShelfyTokens.border),
      ),
    ),
  );
}

/// Mantiene violeta Shelfy; ignora azules legacy del branding tenant.
Color _shelfyPrimary(Color? tenant) {
  if (tenant == null) return ShelfyTokens.primary;
  final hex = tenant.toARGB32().toRadixString(16).padLeft(8, '0').substring(2);
  const legacyBlues = {'1a56db', '2196f3', '6c63ff', '1976d2', '2563eb'};
  if (legacyBlues.contains(hex.toLowerCase())) return ShelfyTokens.primary;
  return tenant;
}

Color? _parseColor(dynamic raw) {
  if (raw is! String) return null;
  final hex = raw.trim().replaceFirst('#', '');
  if (!RegExp(r'^[0-9A-Fa-f]+$').hasMatch(hex)) return null;
  try {
    if (hex.length == 6) {
      return Color(int.parse('FF$hex', radix: 16));
    }
    if (hex.length == 8) {
      return Color(int.parse(hex, radix: 16));
    }
  } catch (_) {
    return null;
  }
  return null;
}
