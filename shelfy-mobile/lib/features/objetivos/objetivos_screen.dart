import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'objetivos_provider.dart';
import 'widgets/objetivo_card.dart';

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

  @override
  Widget build(BuildContext context) {
    return Consumer<ObjetivosProvider>(
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
                  onPressed: () => context.read<ObjetivosProvider>().fetch(),
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
                Icon(Icons.flag_outlined, size: 48, color: Colors.grey),
                SizedBox(height: 12),
                Text(
                  'No tenés objetivos activos',
                  style: TextStyle(color: Colors.grey, fontSize: 16),
                ),
              ],
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () => context.read<ObjetivosProvider>().fetch(),
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: provider.objetivos.length,
            itemBuilder: (context, index) {
              return ObjetivoCard(objetivo: provider.objetivos[index]);
            },
          ),
        );
      },
    );
  }
}
