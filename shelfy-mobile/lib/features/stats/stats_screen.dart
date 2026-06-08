import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'models/stats_models.dart';
import 'ranking_provider.dart';
import 'ranking_screen.dart';
import 'stats_provider.dart';

/// Pantalla de estadísticas de rendimiento del vendedor.
class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key});

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<StatsProvider>().fetch();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<StatsProvider>(
      builder: (context, provider, _) {
        if (provider.loading) {
          return const Center(child: CircularProgressIndicator());
        }

        if (provider.error != null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.grey),
                const SizedBox(height: 12),
                Text(
                  provider.error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.read<StatsProvider>().fetch(),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        final data = provider.statsData;
        if (data == null) {
          return const SizedBox.shrink();
        }

        return RefreshIndicator(
          onRefresh: () => context.read<StatsProvider>().fetch(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _MesActualCard(stats: data.mesActual),
              const SizedBox(height: 12),
              _MesAnteriorCard(stats: data.mesAnterior),
              const SizedBox(height: 12),
              _RankingCard(ranking: data.ranking),
              const SizedBox(height: 4),
              _VerRankingButton(),
            ],
          ),
        );
      },
    );
  }
}

class _MesActualCard extends StatelessWidget {
  final MesStats stats;

  const _MesActualCard({required this.stats});

  @override
  Widget build(BuildContext context) {
    final hasDesglose =
        stats.aprobadas + stats.destacadas + stats.rechazadas + stats.pendientes > 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Mes actual',
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(color: Colors.grey[600]),
            ),
            const SizedBox(height: 8),
            Text(
              '${stats.exhibicionesLogicas}',
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.primary,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              'Exhibiciones lógicas',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            if (stats.periodo.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                stats.periodo,
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: Colors.grey),
              ),
            ],
            if (hasDesglose) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (stats.aprobadas > 0)
                    _EstadoChip(
                      label: 'Aprobadas',
                      count: stats.aprobadas,
                      color: Colors.green,
                    ),
                  if (stats.destacadas > 0)
                    _EstadoChip(
                      label: 'Destacadas',
                      count: stats.destacadas,
                      color: Colors.amber[700]!,
                    ),
                  if (stats.rechazadas > 0)
                    _EstadoChip(
                      label: 'Rechazadas',
                      count: stats.rechazadas,
                      color: Colors.red,
                    ),
                  if (stats.pendientes > 0)
                    _EstadoChip(
                      label: 'Pendientes',
                      count: stats.pendientes,
                      color: Colors.grey,
                    ),
                ],
              ),
            ],
            if (stats.puntos > 0) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.star, size: 16, color: Colors.amber),
                  const SizedBox(width: 4),
                  Text(
                    '${stats.puntos} puntos',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Chip de estado individual
// ---------------------------------------------------------------------------

class _EstadoChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _EstadoChip({
    required this.label,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.30)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            '$count $label',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _MesAnteriorCard extends StatelessWidget {
  final MesStats stats;

  const _MesAnteriorCard({required this.stats});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Mes anterior',
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(color: Colors.grey[600]),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${stats.exhibicionesLogicas}',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(width: 8),
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    'exhibiciones lógicas',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
            if (stats.periodo.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                stats.periodo,
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: Colors.grey),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RankingCard extends StatelessWidget {
  final RankingStats ranking;

  const _RankingCard({required this.ranking});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Ranking',
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(color: Colors.grey[600]),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  'Posición ${ranking.posicion}',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                ),
                const SizedBox(width: 6),
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    'de ${ranking.totalVendedores}',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                const Spacer(),
                _DeltaWidget(delta: ranking.deltaPosicion),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.star, size: 18, color: Colors.amber),
                const SizedBox(width: 4),
                Text(
                  '${ranking.puntos} puntos',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Widget de delta de posición
// ---------------------------------------------------------------------------

class _DeltaWidget extends StatelessWidget {
  final int? delta;

  const _DeltaWidget({this.delta});

  @override
  Widget build(BuildContext context) {
    if (delta == null || delta == 0) {
      return Text(
        '—',
        style: Theme.of(context)
            .textTheme
            .bodyMedium
            ?.copyWith(color: Colors.grey),
      );
    }

    final subio = delta! > 0;
    final color = subio ? Colors.green : Colors.red;
    final icon = subio ? Icons.arrow_upward : Icons.arrow_downward;
    final abs = delta!.abs();
    final suffix = abs == 1 ? 'posición' : 'posiciones';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 2),
        Text(
          '$abs $suffix',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w600,
              ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Botón "Ver ranking completo"
// ---------------------------------------------------------------------------

class _VerRankingButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: () {
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (ctx) => ChangeNotifierProvider(
              create: (_) => RankingProvider(
                api: ctx.read(),
              ),
              child: const RankingScreen(),
            ),
          ),
        );
      },
      icon: const Icon(Icons.leaderboard_outlined, size: 18),
      label: const Text('Ver ranking completo'),
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      ),
    );
  }
}
