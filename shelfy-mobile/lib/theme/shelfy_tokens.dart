import 'package:flutter/material.dart';

/// Tokens de diseño Shelfy — derivados de globals.css del portal.
/// Siempre usar estos valores; nunca hardcodear colores en los widgets.
abstract final class ShelfyTokens {
  // ── Brand colors ────────────────────────────────────────────────────────────
  static const Color primary  = Color(0xFFa855f7);   // --shelfy-primary
  static const Color primary2 = Color(0xFF8b5cf6);   // gradientes / pressed
  static const Color accent   = Color(0xFF7C3AED);   // focus rings

  // ── Backgrounds ─────────────────────────────────────────────────────────────
  static const Color bg    = Color(0xFFF8FAFC);      // shell / cartera / stats
  static const Color panel = Color(0xFFFFFFFF);      // glass panel (+ blur + opacity 88%)

  // ── Text ────────────────────────────────────────────────────────────────────
  static const Color text     = Color(0xFF0F172A);   // títulos
  static const Color textSoft = Color(0xFF475569);   // subtítulos PDV
  static const Color muted    = Color(0xFF64748B);   // snapshot labels
  static const Color border   = Color(0xFFE2E8F0);

  // ── States ──────────────────────────────────────────────────────────────────
  static const Color success = Color(0xFF22C55E);
  static const Color error   = Color(0xFFEF4444);
  static const Color warning = Color(0xFFF59E0B);

  // ── Glow ────────────────────────────────────────────────────────────────────
  static Color get glow => primary.withValues(alpha: 0.15);

  // ── Radius ──────────────────────────────────────────────────────────────────
  static const double radiusSm = 8.0;
  static const double radiusMd = 12.0;
  static const double radiusLg = 16.0;
  static const double radiusXl = 20.0;

  // ── Glass panel ─────────────────────────────────────────────────────────────
  static const double panelBlur    = 20.0;
  static const double panelOpacity = 0.88;
}
