import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/shelfy_tokens.dart';
import '../../core/auth/auth_service.dart';
import '../../core/auth/patron_cuenta_model.dart';

/// Selector de cuenta para patrón (Equipo / Monchi / Jorge Coronel).
class PatronCuentaSwitcher extends StatelessWidget {
  final VoidCallback? onChanged;

  const PatronCuentaSwitcher({super.key, this.onChanged});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final session = auth.currentSession;
    if (session == null || !session.patronMode || session.cuentas.length < 2) {
      return const SizedBox.shrink();
    }

    final teamCuentas = session.cuentas
        .where((c) => c.id != 'ivan_soto')
        .toList();
    if (teamCuentas.isEmpty) return const SizedBox.shrink();

    final active = session.selectedCuentaId ?? patronCuentaEquipo;

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 8, 0),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: active,
          isDense: true,
          borderRadius: BorderRadius.circular(12),
          dropdownColor: ShelfyTokens.panel,
          icon: Icon(Icons.swap_horiz, color: ShelfyTokens.primary, size: 20),
          selectedItemBuilder: (context) => [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                active == patronCuentaEquipo ? 'Equipo' : _labelFor(active, teamCuentas),
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: ShelfyTokens.text,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            ...teamCuentas.map(
              (c) => Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  c.label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: ShelfyTokens.text,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
          items: [
            DropdownMenuItem<String>(
              value: patronCuentaEquipo,
              child: Text(
                'Equipo (consolidado)',
                style: TextStyle(color: ShelfyTokens.text, fontSize: 14),
              ),
            ),
            ...teamCuentas.map(
              (PatronCuenta c) => DropdownMenuItem<String>(
                value: c.id,
                child: Text(
                  c.label,
                  style: TextStyle(color: ShelfyTokens.text, fontSize: 14),
                ),
              ),
            ),
          ],
          onChanged: (value) async {
            if (value == null || value == session.selectedCuentaId) return;
            await auth.setSelectedCuenta(value);
            onChanged?.call();
          },
        ),
      ),
    );
  }

  String _labelFor(String id, List<PatronCuenta> cuentas) {
    for (final c in cuentas) {
      if (c.id == id) return c.label;
    }
    return id;
  }
}
