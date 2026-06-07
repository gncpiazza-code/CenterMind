import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../capture_provider.dart';

/// Lista de tipos de PDV disponibles.
const kTiposPdv = [
  'Comercio sin Ingreso',
  'Comercio con Ingreso',
  'Super / Hiper',
  'Estación de Servicio',
  'Kiosco',
  'Farmacia',
];

/// Grilla de tarjetas seleccionables para el tipo de PDV.
class TipoPdvSelector extends StatelessWidget {
  const TipoPdvSelector({super.key});

  IconData _iconForTipo(String tipo) {
    switch (tipo) {
      case 'Super / Hiper':
        return Icons.shopping_cart_outlined;
      case 'Estación de Servicio':
        return Icons.local_gas_station_outlined;
      case 'Kiosco':
        return Icons.storefront_outlined;
      case 'Farmacia':
        return Icons.local_pharmacy_outlined;
      default:
        return Icons.store_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CaptureProvider>(
      builder: (context, provider, _) {
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 2.2,
          ),
          itemCount: kTiposPdv.length,
          itemBuilder: (context, index) {
            final tipo = kTiposPdv[index];
            final selected = provider.selectedTipo == tipo;
            return InkWell(
              onTap: () => provider.selectTipo(tipo),
              borderRadius: BorderRadius.circular(12),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                decoration: BoxDecoration(
                  color: selected
                      ? Theme.of(context).colorScheme.primary
                      : Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                  border: selected
                      ? null
                      : Border.all(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    Icon(
                      _iconForTipo(tipo),
                      color: selected
                          ? Theme.of(context).colorScheme.onPrimary
                          : Theme.of(context).colorScheme.onSurfaceVariant,
                      size: 22,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        tipo,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: selected
                              ? Theme.of(context).colorScheme.onPrimary
                              : Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
