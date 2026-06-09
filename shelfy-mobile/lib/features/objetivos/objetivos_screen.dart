import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../theme/shelfy_tokens.dart';
import 'models/objetivo_app.dart';
import 'models/objetivo_detalle.dart';
import 'objetivos_provider.dart';
import 'widgets/objetivo_card.dart';
import 'widgets/objetivo_detalle_sheet.dart';

/// Pantalla de objetivos activos del vendedor.
class ObjetivosScreen extends StatefulWidget {
  const ObjetivosScreen({super.key});

  @override
  State<ObjetivosScreen> createState() => _ObjetivosScreenState();
}

class _ObjetivosScreenState extends State<ObjetivosScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ObjetivosProvider>().fetch();
    });
  }

  Future<void> _abrirDetalle(
    BuildContext context,
    ObjetivosProvider provider,
    ObjetivoApp objetivo,
  ) async {
    try {
      final detalle = await provider.fetchDetalle(objetivo.id);
      if (!context.mounted) return;
      await ObjetivoDetalleSheet.show(context, detalle);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      if (e.statusCode == 404 || e.statusCode >= 500) {
        await ObjetivoDetalleSheet.show(
          context,
          ObjetivoDetalle.fromListItem(objetivo),
        );
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('No se pudo cargar el detalle: ${e.message}'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } on Exception catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('No se pudo cargar el detalle: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<ObjetivosProvider>(
      builder: (context, provider, _) {
        if (!provider.hasLoaded || provider.loading) {
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
                  style: const TextStyle(color: ShelfyTokens.textSoft),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.read<ObjetivosProvider>().fetch(force: true),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        if (provider.objetivos.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.flag_outlined, size: 48, color: ShelfyTokens.muted),
                SizedBox(height: 12),
                Text(
                  'No tenés objetivos activos',
                  style: TextStyle(color: ShelfyTokens.textSoft, fontSize: 16),
                ),
              ],
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () => context.read<ObjetivosProvider>().fetch(force: true),
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: provider.objetivos.length,
            itemBuilder: (context, index) {
              final objetivo = provider.objetivos[index];
              return ObjetivoCard(
                objetivo: objetivo,
                onTap: () => _abrirDetalle(context, provider, objetivo),
              );
            },
          ),
        );
      },
    );
  }
}
