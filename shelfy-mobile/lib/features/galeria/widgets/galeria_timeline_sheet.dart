import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../galeria_provider.dart';
import '../models/galeria_models.dart';
import 'galeria_cliente_card.dart';

/// BottomSheet draggable con el timeline de exhibiciones de un cliente.
class GaleriaTimelineSheet extends StatefulWidget {
  final GaleriaCliente cliente;

  const GaleriaTimelineSheet({super.key, required this.cliente});

  @override
  State<GaleriaTimelineSheet> createState() => _GaleriaTimelineSheetState();
}

class _GaleriaTimelineSheetState extends State<GaleriaTimelineSheet> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context
            .read<GaleriaProvider>()
            .fetchTimeline(widget.cliente.idClienteErp);
      }
    });
  }

  @override
  void dispose() {
    // Limpiamos el timeline al cerrar para no dejar datos stale.
    // Lo hacemos con addPostFrameCallback para evitar llamar durante el build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // El provider podría haber sido desechado si el árbol fue desmontado.
      // Usamos try/catch como salvaguarda.
      try {
        // ignore: use_build_context_synchronously
        context.read<GaleriaProvider>().clearTimeline();
      } catch (_) {}
    });
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Handle visual
              _SheetHandle(),

              // Header PDV
              _SheetHeader(cliente: widget.cliente),

              const Divider(height: 1),

              // Contenido
              Expanded(
                child: Consumer<GaleriaProvider>(
                  builder: (context, provider, _) {
                    if (provider.loadingTimeline) {
                      return const Center(child: CircularProgressIndicator());
                    }

                    if (provider.errorTimeline != null) {
                      return _TimelineError(
                        message: provider.errorTimeline!,
                        onRetry: () => provider.fetchTimeline(
                          widget.cliente.idClienteErp,
                        ),
                      );
                    }

                    final timeline = provider.timelineActual;
                    if (timeline == null ||
                        timeline.publicaciones.isEmpty) {
                      return const _TimelineEmpty();
                    }

                    return _TimelineList(
                      publicaciones: timeline.publicaciones,
                      scrollController: scrollController,
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SheetHandle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Container(
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.outlineVariant,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  final GaleriaCliente cliente;

  const _SheetHeader({required this.cliente});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.store_rounded,
              color: Theme.of(context).colorScheme.onPrimaryContainer,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  cliente.nombreDisplay,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '${cliente.totalExhibiciones} exhibicion${cliente.totalExhibiciones != 1 ? 'es' : ''}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineList extends StatelessWidget {
  final List<GaleriaPublicacion> publicaciones;
  final ScrollController scrollController;

  const _TimelineList({
    required this.publicaciones,
    required this.scrollController,
  });

  @override
  Widget build(BuildContext context) {
    // Ordenadas por fecha desc (más reciente primero)
    final sorted = [...publicaciones]
      ..sort((a, b) => b.diaAr.compareTo(a.diaAr));

    return ListView.separated(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      itemCount: sorted.length,
      separatorBuilder: (_, __) => const SizedBox(height: 20),
      itemBuilder: (context, index) {
        return _PublicacionItem(publicacion: sorted[index]);
      },
    );
  }
}

class _PublicacionItem extends StatelessWidget {
  final GaleriaPublicacion publicacion;

  const _PublicacionItem({required this.publicacion});

  @override
  Widget build(BuildContext context) {
    final estadoColor =
        EstadoExhibicionColors.forEstado(publicacion.estadoDia);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Fila fecha + badge estado
        Row(
          children: [
            Icon(
              Icons.calendar_today_outlined,
              size: 14,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 6),
            Text(
              _formatFecha(publicacion.diaAr),
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(width: 8),
            _EstadoChip(estado: publicacion.estadoDia, color: estadoColor),
            const Spacer(),
            Text(
              '${publicacion.totalFotos} foto${publicacion.totalFotos != 1 ? 's' : ''}',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: Colors.grey,
                  ),
            ),
          ],
        ),

        const SizedBox(height: 10),

        // PageView de fotos (si hay 1 foto se muestra directo, si hay varias swipeable)
        if (publicacion.fotos.isNotEmpty)
          _FotosCarousel(fotos: publicacion.fotos),
      ],
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

class _EstadoChip extends StatelessWidget {
  final String estado;
  final Color color;

  const _EstadoChip({required this.estado, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        border: Border.all(color: color.withAlpha(100)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            EstadoExhibicionColors.iconForEstado(estado),
            size: 11,
            color: color,
          ),
          const SizedBox(width: 4),
          Text(
            estado,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _FotosCarousel extends StatefulWidget {
  final List<GaleriaFoto> fotos;

  const _FotosCarousel({required this.fotos});

  @override
  State<_FotosCarousel> createState() => _FotosCarouselState();
}

class _FotosCarouselState extends State<_FotosCarousel> {
  int _currentPage = 0;
  late final PageController _controller;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fotos = widget.fotos;

    return Column(
      children: [
        SizedBox(
          height: 220,
          child: PageView.builder(
            controller: _controller,
            itemCount: fotos.length,
            onPageChanged: (i) => setState(() => _currentPage = i),
            itemBuilder: (context, index) {
              return _FotoItem(foto: fotos[index]);
            },
          ),
        ),

        // Dots indicadores (solo si hay más de 1 foto)
        if (fotos.length > 1) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(fotos.length, (i) {
              final isActive = i == _currentPage;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: isActive ? 16 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: isActive
                      ? Theme.of(context).colorScheme.primary
                      : Theme.of(context).colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(3),
                ),
              );
            }),
          ),
        ],
      ],
    );
  }
}

class _FotoItem extends StatelessWidget {
  final GaleriaFoto foto;

  const _FotoItem({required this.foto});

  @override
  Widget build(BuildContext context) {
    final estadoColor = EstadoExhibicionColors.forEstado(foto.estado);

    return Column(
      children: [
        Expanded(
          child: GestureDetector(
            onTap: () => _openFullscreen(context),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (foto.urlFoto != null && foto.urlFoto!.isNotEmpty)
                    CachedNetworkImage(
                      imageUrl: foto.urlFoto!,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                        color:
                            Theme.of(context).colorScheme.surfaceContainerHighest,
                        child: const Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                      errorWidget: (context, url, error) => Container(
                        color:
                            Theme.of(context).colorScheme.surfaceContainerHighest,
                        child: Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.broken_image_outlined,
                                color: Theme.of(context).colorScheme.outline,
                                size: 36,
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'No se pudo cargar la foto',
                                style: TextStyle(
                                  color:
                                      Theme.of(context).colorScheme.outline,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    )
                  else
                    Container(
                      color:
                          Theme.of(context).colorScheme.surfaceContainerHighest,
                      child: Center(
                        child: Icon(
                          Icons.image_not_supported_outlined,
                          size: 48,
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                    ),

                  // Badge estado foto en esquina
                  Positioned(
                    bottom: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: estadoColor.withAlpha(220),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        foto.estado,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),

                  // Icono zoom
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: Colors.black.withAlpha(100),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.zoom_in_rounded,
                        color: Colors.white,
                        size: 16,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        // Comentario y supervisor (si existen)
        if (foto.comentario != null ||
            foto.supervisor != null) ...[
          const SizedBox(height: 8),
          _FotoMeta(foto: foto),
        ],
      ],
    );
  }

  void _openFullscreen(BuildContext context) {
    if (foto.urlFoto == null || foto.urlFoto!.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _FullscreenViewer(url: foto.urlFoto!),
        fullscreenDialog: true,
      ),
    );
  }
}

class _FotoMeta extends StatelessWidget {
  final GaleriaFoto foto;

  const _FotoMeta({required this.foto});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (foto.supervisor != null) ...[
            Row(
              children: [
                Icon(
                  Icons.person_outlined,
                  size: 13,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 4),
                Text(
                  foto.supervisor!,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color:
                            Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
            if (foto.comentario != null) const SizedBox(height: 4),
          ],
          if (foto.comentario != null)
            Text(
              foto.comentario!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
        ],
      ),
    );
  }
}

class _FullscreenViewer extends StatelessWidget {
  final String url;

  const _FullscreenViewer({required this.url});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: InteractiveViewer(
        minScale: 0.5,
        maxScale: 5.0,
        child: Center(
          child: CachedNetworkImage(
            imageUrl: url,
            fit: BoxFit.contain,
            placeholder: (context, url) => const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
            errorWidget: (context, url, error) => const Center(
              child: Icon(
                Icons.broken_image_outlined,
                color: Colors.white70,
                size: 64,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TimelineError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _TimelineError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.grey),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onRetry,
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimelineEmpty extends StatelessWidget {
  const _TimelineEmpty();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.photo_library_outlined,
            size: 56,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 12),
          Text(
            'Sin exhibiciones registradas',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ],
      ),
    );
  }
}
