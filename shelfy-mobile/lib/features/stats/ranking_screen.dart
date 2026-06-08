import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'models/ranking_model.dart';
import 'ranking_provider.dart';

/// Pantalla de ranking completo de vendedores con picker de mes.
class RankingScreen extends StatefulWidget {
  const RankingScreen({super.key});

  @override
  State<RankingScreen> createState() => _RankingScreenState();
}

class _RankingScreenState extends State<RankingScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RankingProvider>().fetch();
    });
  }

  /// Genera los últimos 3 meses (incluyendo el actual) como opciones de picker.
  List<_MesPicker> _meses(int year, int month) {
    final result = <_MesPicker>[];
    for (int i = 0; i < 3; i++) {
      int m = month - i;
      int y = year;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      result.add(_MesPicker(year: y, month: m));
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RankingProvider>(
      builder: (context, provider, _) {
        final meses = _meses(provider.selectedYear, provider.selectedMonth);

        return Scaffold(
          appBar: AppBar(
            title: const Text('Ranking'),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(48),
              child: _MesPickerBar(
                opciones: meses,
                selectedYear: provider.selectedYear,
                selectedMonth: provider.selectedMonth,
                onSelected: (y, m) => provider.fetch(year: y, month: m),
              ),
            ),
          ),
          body: _buildBody(context, provider),
        );
      },
    );
  }

  Widget _buildBody(BuildContext context, RankingProvider provider) {
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
              onPressed: () => provider.fetch(),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      );
    }

    final data = provider.rankingData;
    if (data == null || data.ranking.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.leaderboard_outlined, size: 48, color: Colors.grey),
            SizedBox(height: 12),
            Text(
              'Sin datos de ranking para este período',
              style: TextStyle(color: Colors.grey, fontSize: 16),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => provider.fetch(),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: data.ranking.length,
        itemBuilder: (context, index) {
          return _RankingEntryTile(entry: data.ranking[index]);
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Picker de mes en la AppBar
// ---------------------------------------------------------------------------

class _MesPicker {
  final int year;
  final int month;
  const _MesPicker({required this.year, required this.month});
}

const _kMonthNames = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

class _MesPickerBar extends StatelessWidget {
  final List<_MesPicker> opciones;
  final int selectedYear;
  final int selectedMonth;
  final void Function(int year, int month) onSelected;

  const _MesPickerBar({
    required this.opciones,
    required this.selectedYear,
    required this.selectedMonth,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return SizedBox(
      height: 48,
      child: Row(
        children: opciones.map((m) {
          final isSelected = m.year == selectedYear && m.month == selectedMonth;
          final label = '${_kMonthNames[m.month - 1]} ${m.year}';
          return Expanded(
            child: InkWell(
              onTap: () => onSelected(m.year, m.month),
              child: Container(
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: isSelected ? accent : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                ),
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight:
                        isSelected ? FontWeight.w700 : FontWeight.w400,
                    color: isSelected ? accent : Colors.grey[600],
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Fila de ranking
// ---------------------------------------------------------------------------

class _RankingEntryTile extends StatelessWidget {
  final RankingEntry entry;

  const _RankingEntryTile({required this.entry});

  Color _medalColor(int pos) {
    if (pos == 1) return const Color(0xFFFFD700); // gold
    if (pos == 2) return const Color(0xFFC0C0C0); // silver
    if (pos == 3) return const Color(0xFFCD7F32); // bronze
    return Colors.transparent;
  }

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    final medalColor = _medalColor(entry.posicion);
    final hasMedal = entry.posicion <= 3;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: entry.esYo
            ? accent.withValues(alpha: 0.08)
            : Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        border: entry.esYo
            ? Border.all(color: accent.withValues(alpha: 0.35), width: 1.5)
            : null,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Posición / medalla
            SizedBox(
              width: 36,
              child: hasMedal
                  ? Icon(Icons.circle, color: medalColor, size: 22)
                  : Text(
                      '${entry.posicion}',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey[600],
                      ),
                      textAlign: TextAlign.center,
                    ),
            ),
            const SizedBox(width: 12),
            // Nombre
            Expanded(
              child: Text(
                entry.esYo ? 'Tú' : entry.nombre,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight:
                      entry.esYo ? FontWeight.w700 : FontWeight.w500,
                  color: entry.esYo ? accent : null,
                ),
              ),
            ),
            // Puntos
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.star,
                  size: 16,
                  color: entry.esYo ? accent : Colors.amber,
                ),
                const SizedBox(width: 4),
                Text(
                  '${entry.puntos}',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: entry.esYo ? accent : null,
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
