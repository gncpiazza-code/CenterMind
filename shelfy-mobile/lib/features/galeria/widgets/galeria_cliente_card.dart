import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../models/galeria_models.dart';

/// Colores canónicos de estado de exhibición.
class EstadoExhibicionColors {
  static Color forEstado(String estado) {
    switch (estado.toLowerCase()) {
      case 'aprobado':
        return const Color(0xFF22C55E);
      case 'destacado':
        return const Color(0xFFF59E0B);
      case 'rechazado':
        return const Color(0xFFEF4444);
      case 'pendiente':
      default:
        return const Color(0xFF9CA3AF);
    }
  }

  static IconData iconForEstado(String estado) {
    switch (estado.toLowerCase()) {
      case 'aprobado':
        return Icons.check_circle_rounded;
      case 'destacado':
        return Icons.star_rounded;
      case 'rechazado':
        return Icons.cancel_rounded;
      case 'pendiente':
      default:
        return Icons.hourglass_empty_rounded;
    }
  }
}

/// Card de cliente con thumbnail, nombre, badge de exhibiciones y última fecha.
class GaleriaClienteCard extends StatelessWidget {
  final GaleriaCliente cliente;
  final VoidCallback onTap;

  const GaleriaClienteCard({
    super.key,
    required this.cliente,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onTap,
      child: Card(
        clipBehavior: Clip.antiAlias,
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Thumbnail
            Expanded(
              child: _ThumbnailArea(cliente: cliente),
            ),

            // Info footer
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    cliente.nombreDisplay,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      // Badge exhibiciones
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.photo_library_outlined,
                              size: 11,
                              color: colorScheme.onPrimaryContainer,
                            ),
                            const SizedBox(width: 3),
                            Text(
                              '${cliente.totalExhibiciones}',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: colorScheme.onPrimaryContainer,
                              ),
                            ),
                          ],
                        ),
                      ),

                      if (cliente.ultimaExhibicion != null) ...[
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            _formatFecha(cliente.ultimaExhibicion!),
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(color: Colors.grey),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatFecha(String fecha) {
    // fecha en formato 'YYYY-MM-DD' o similar
    if (fecha.length >= 10) {
      final parts = fecha.substring(0, 10).split('-');
      if (parts.length == 3) return '${parts[2]}/${parts[1]}/${parts[0]}';
    }
    return fecha;
  }
}

class _ThumbnailArea extends StatelessWidget {
  final GaleriaCliente cliente;

  const _ThumbnailArea({required this.cliente});

  @override
  Widget build(BuildContext context) {
    // Thumbnail placeholder con icono de tienda
    return Container(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Center(
        child: Icon(
          Icons.store_rounded,
          size: 40,
          color: Theme.of(context).colorScheme.outline,
        ),
      ),
    );
  }
}

/// Thumbnail con foto real usando CachedNetworkImage.
class GaleriaClienteCardWithPhoto extends StatelessWidget {
  final GaleriaCliente cliente;
  final String? urlFoto;
  final String? estadoDia;
  final VoidCallback onTap;

  const GaleriaClienteCardWithPhoto({
    super.key,
    required this.cliente,
    this.urlFoto,
    this.estadoDia,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onTap,
      child: Card(
        clipBehavior: Clip.antiAlias,
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (urlFoto != null && urlFoto!.isNotEmpty)
                    CachedNetworkImage(
                      imageUrl: urlFoto!,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                        color: colorScheme.surfaceContainerHighest,
                        child: const Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                      errorWidget: (context, url, error) => Container(
                        color: colorScheme.surfaceContainerHighest,
                        child: Center(
                          child: Icon(
                            Icons.broken_image_outlined,
                            color: colorScheme.outline,
                          ),
                        ),
                      ),
                    )
                  else
                    Container(
                      color: colorScheme.surfaceContainerHighest,
                      child: Center(
                        child: Icon(
                          Icons.store_rounded,
                          size: 40,
                          color: colorScheme.outline,
                        ),
                      ),
                    ),

                  // Badge estado en esquina superior derecha
                  if (estadoDia != null)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: _EstadoBadge(estado: estadoDia!),
                    ),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    cliente.nombreDisplay,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.photo_library_outlined,
                              size: 11,
                              color: colorScheme.onPrimaryContainer,
                            ),
                            const SizedBox(width: 3),
                            Text(
                              '${cliente.totalExhibiciones}',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: colorScheme.onPrimaryContainer,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (cliente.ultimaExhibicion != null) ...[
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            _formatFecha(cliente.ultimaExhibicion!),
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(color: Colors.grey),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatFecha(String fecha) {
    if (fecha.length >= 10) {
      final parts = fecha.substring(0, 10).split('-');
      if (parts.length == 3) return '${parts[2]}/${parts[1]}/${parts[0]}';
    }
    return fecha;
  }
}

class _EstadoBadge extends StatelessWidget {
  final String estado;

  const _EstadoBadge({required this.estado});

  @override
  Widget build(BuildContext context) {
    final color = EstadoExhibicionColors.forEstado(estado);
    final icon = EstadoExhibicionColors.iconForEstado(estado);
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(40),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Icon(icon, size: 12, color: Colors.white),
    );
  }
}
