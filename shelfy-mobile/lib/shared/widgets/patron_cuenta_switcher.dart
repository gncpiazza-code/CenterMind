import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/shelfy_tokens.dart';
import '../../core/auth/auth_service.dart';
import '../../core/auth/patron_cuenta_model.dart';

/// Selector de cuenta para patrón (Monchi / Jorge Coronel / etc.).
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

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 8, 0),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: session.selectedCuentaId,
          isDense: true,
          borderRadius: BorderRadius.circular(12),
          dropdownColor: ShelfyTokens.panel,
          icon: Icon(Icons.swap_horiz, color: ShelfyTokens.primary, size: 20),
          selectedItemBuilder: (context) => session.cuentas
              .map(
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
              )
              .toList(),
          items: session.cuentas
              .map(
                (PatronCuenta c) => DropdownMenuItem<String>(
                  value: c.id,
                  child: Text(
                    c.label,
                    style: TextStyle(color: ShelfyTokens.text, fontSize: 14),
                  ),
                ),
              )
              .toList(),
          onChanged: (value) async {
            if (value == null || value == session.selectedCuentaId) return;
            await auth.setSelectedCuenta(value);
            onChanged?.call();
          },
        ),
      ),
    );
  }
}
