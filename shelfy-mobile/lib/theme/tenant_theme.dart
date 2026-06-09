import 'package:flutter/material.dart';
import 'shelfy_tokens.dart';

/// Construye el ThemeData del tenant a partir del JSON de branding.
///
/// El objeto [branding] puede incluir:
/// - `primary_color`: string hex ej. "#a855f7"
/// - `secondary_color`: string hex opcional
/// - `font_family`: nombre de fuente opcional
ThemeData buildTenantTheme(Map<String, dynamic>? branding) {
  // Tenant override mezcla sobre violeta Shelfy; fallback = violeta Shelfy (no azul genérico)
  final primaryColor = _parseColor(branding?['primary_color']) ??
      ShelfyTokens.primary;
  final secondaryColor = _parseColor(branding?['secondary_color']) ??
      primaryColor.withValues(alpha: 0.7);

  final colorScheme = ColorScheme.fromSeed(
    seedColor: primaryColor,
    secondary: secondaryColor,
    brightness: Brightness.light,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: ShelfyTokens.bg,
    appBarTheme: AppBarTheme(
      backgroundColor: primaryColor,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: true,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: primaryColor, width: 2),
      ),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      selectedItemColor: primaryColor,
      unselectedItemColor: Colors.grey.shade500,
      type: BottomNavigationBarType.fixed,
      elevation: 8,
    ),
  );
}

/// Parsea un string hex "#RRGGBB" o "#AARRGGBB" a [Color].
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
