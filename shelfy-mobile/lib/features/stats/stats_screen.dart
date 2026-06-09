import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../shared/widgets/shelfy/shelfy_widgets.dart';
import '../../theme/shelfy_tokens.dart';
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
          return const Center(
            child: CircularProgressIndicator(color: ShelfyTokens.primary),
          );
        }

        if (provider.error != null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: ShelfyTokens.muted),
                const SizedBox(height: 12),
                Text(
                  provider.error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: ShelfyTokens.muted),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.read<StatsProvider>().fetch(force: true),
                  style: FilledButton.styleFrom(backgroundColor: ShelfyTokens.primary),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        final data = provider.statsData;
        if (data == null) return const SizedBox.shrink();

        final kpis = provider.kpisResumen;
        final ventas = provider.ventasData;

        return RefreshIndicator(
          color: ShelfyTokens.primary,
          onRefresh: () => context.read<StatsProvider>().fetch(force: true),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Hero ventas MTD (bultos)
              if (ventas != null) ...[
                _VentasMtdCard(ventas: ventas),
                const SizedBox(height: 12),
              ],

              // KPIs 7 indicadores del mes (grid 2col)
              if (kpis != null) ...[
                _KpisResumenCard(kpis: kpis),
                const SizedBox(height: 12),
              ],

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

// ---------------------------------------------------------------------------
// Card ventas MTD: hero bultos + progress rows SKU
// ---------------------------------------------------------------------------

class _VentasMtdCard extends StatefulWidget {
  final VentasData ventas;

  const _VentasMtdCard({required this.ventas});

  @override
  State<_VentasMtdCard> createState() => _VentasMtdCardState();
}

class _VentasMtdCardState extends State<_VentasMtdCard> {
  bool _expanded = false;
  static const _topVisible = 5;

  @override
  Widget build(BuildContext context) {
    final v = widget.ventas;
    final skus = v.bultosDesglose;
    final maxBultos = skus.isEmpty
        ? 1.0
        : skus.map((s) => s.bultos).reduce((a, b) => a > b ? a : b);
    final visibleSkus = _expanded ? skus : skus.take(_topVisible).toList();
    final hasMore = skus.length > _topVisible;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Snapshot label
            if (v.snapshotLabel.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ShelfySnapshotLabel(label: v.snapshotLabel),
              ),

            // Hero metric
            ShelfyHeroMetric(
              value: _formatBultos(v.totalBultos),
              label: 'bultos MTD',
            ),
            const SizedBox(height: 4),
            Text(
              '${v.totalFacturas} facturas',
              style: const TextStyle(fontSize: 12, color: ShelfyTokens.muted),
            ),

            if (skus.isNotEmpty) ...[
              const SizedBox(height: 20),
              ShelfySectionHeader(
                title: 'Top SKUs',
                icon: Icons.bar_chart_rounded,
              ),
              const SizedBox(height: 10),
              ...visibleSkus.map((sku) => ShelfyProgressRow(
                    label: sku.articulo.isNotEmpty
                        ? sku.articulo
                        : (sku.codArticulo ?? '—'),
                    ratio: maxBultos > 0 ? sku.bultos / maxBultos : 0,
                    valueLabel: _formatBultos(sku.bultos),
                  )),
              if (hasMore)
                GestureDetector(
                  onTap: () => setState(() => _expanded = !_expanded),
                  child: Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _expanded
                              ? Icons.expand_less_rounded
                              : Icons.expand_more_rounded,
                          size: 16,
                          color: ShelfyTokens.primary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _expanded
                              ? 'Ver menos'
                              : 'Ver ${skus.length - _topVisible} más',
                          style: const TextStyle(
                            fontSize: 12,
                            color: ShelfyTokens.primary,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatBultos(double b) {
    if (b == b.truncateToDouble()) return b.toInt().toString();
    return b.toStringAsFixed(1);
  }
}

// ---------------------------------------------------------------------------
// Card mes actual
// ---------------------------------------------------------------------------

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
                  ?.copyWith(color: ShelfyTokens.muted),
            ),
            const SizedBox(height: 8),
            Text(
              '${stats.exhibicionesLogicas}',
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: ShelfyTokens.primary,
                  ),
            ),
            const SizedBox(height: 4),
            Text('Exhibiciones lógicas', style: Theme.of(context).textTheme.bodyMedium),
            if (stats.periodo.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                stats.periodo,
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: ShelfyTokens.muted),
              ),
            ],
            if (hasDesglose) ...[
              const SizedBox(height: 14),
              // Grid 2col de estados (no Wrap caótico)
              Row(
                children: [
                  if (stats.aprobadas > 0)
                    Expanded(
                      child: _EstadoChip(
                        label: 'Aprobadas',
                        count: stats.aprobadas,
                        color: ShelfyTokens.success,
                      ),
                    ),
                  if (stats.destacadas > 0) ...[
                    if (stats.aprobadas > 0) const SizedBox(width: 8),
                    Expanded(
                      child: _EstadoChip(
                        label: 'Destacadas',
                        count: stats.destacadas,
                        color: ShelfyTokens.warning,
                      ),
                    ),
                  ],
                ],
              ),
              if (stats.rechazadas > 0 || stats.pendientes > 0) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    if (stats.rechazadas > 0)
                      Expanded(
                        child: _EstadoChip(
                          label: 'Rechazadas',
                          count: stats.rechazadas,
                          color: ShelfyTokens.error,
                        ),
                      ),
                    if (stats.pendientes > 0) ...[
                      if (stats.rechazadas > 0) const SizedBox(width: 8),
                      Expanded(
                        child: _EstadoChip(
                          label: 'Pendientes',
                          count: stats.pendientes,
                          color: ShelfyTokens.textSoft,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ],
            if (stats.puntos > 0) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.star, size: 16, color: ShelfyTokens.warning),
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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
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
          Flexible(
            child: Text(
              '$count $label',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: color,
              ),
              overflow: TextOverflow.ellipsis,
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
                  ?.copyWith(color: ShelfyTokens.muted),
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
                    ?.copyWith(color: ShelfyTokens.muted),
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
                  ?.copyWith(color: ShelfyTokens.muted),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  'Posición ${ranking.posicion}',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: ShelfyTokens.primary,
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
                const Icon(Icons.star, size: 18, color: ShelfyTokens.warning),
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
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: ShelfyTokens.muted),
      );
    }

    final subio = delta! > 0;
    final color = subio ? ShelfyTokens.success : ShelfyTokens.error;
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
              create: (_) => RankingProvider(api: ctx.read()),
              child: const RankingScreen(),
            ),
          ),
        );
      },
      icon: const Icon(Icons.leaderboard_outlined, size: 18),
      label: const Text('Ver ranking completo'),
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        foregroundColor: ShelfyTokens.primary,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Card 7 KPIs resumen del mes — grid 2 columnas
// ---------------------------------------------------------------------------

class _KpisResumenCard extends StatelessWidget {
  final KpisResumen kpis;

  const _KpisResumenCard({required this.kpis});

  @override
  Widget build(BuildContext context) {
    final items = [
      (label: 'PDVs activos', value: '${kpis.pdvs}'),
      (label: 'Altas', value: '${kpis.altas}'),
      (label: 'Exhibiciones', value: '${kpis.exhibiciones}'),
      (label: 'Compradores', value: '${kpis.compradores}'),
      (label: 'Cobertura', value: '${kpis.coberturaPct.toStringAsFixed(1)}%'),
      (label: 'Objetivos', value: '${kpis.objetivosPct.toStringAsFixed(1)}%'),
    ];

    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 2) {
      final a = items[i];
      final b = i + 1 < items.length ? items[i + 1] : null;
      rows.add(Row(
        children: [
          Expanded(child: _KpiCell(label: a.label, value: a.value)),
          const SizedBox(width: 8),
          if (b != null)
            Expanded(child: _KpiCell(label: b.label, value: b.value))
          else
            const Expanded(child: SizedBox.shrink()),
        ],
      ));
      if (i + 2 < items.length) rows.add(const SizedBox(height: 8));
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'KPIs del mes',
              style: Theme.of(context)
                  .textTheme
                  .labelLarge
                  ?.copyWith(color: ShelfyTokens.muted),
            ),
            const SizedBox(height: 12),
            ...rows,
          ],
        ),
      ),
    );
  }
}

class _KpiCell extends StatelessWidget {
  final String label;
  final String value;

  const _KpiCell({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ShelfyTokens.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(ShelfyTokens.radiusMd),
        border: Border.all(
          color: ShelfyTokens.primary.withValues(alpha: 0.15),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: ShelfyTokens.primary,
            ),
          ),
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              color: ShelfyTokens.muted,
            ),
          ),
        ],
      ),
    );
  }
}
