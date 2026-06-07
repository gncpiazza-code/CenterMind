import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_client.dart';
import '../capture_provider.dart';
import '../models/pdv_candidate.dart';

/// Widget que muestra PDVs cercanos y permite selección o ingreso manual.
class PdvSearchWidget extends StatefulWidget {
  const PdvSearchWidget({super.key});

  @override
  State<PdvSearchWidget> createState() => _PdvSearchWidgetState();
}

class _PdvSearchWidgetState extends State<PdvSearchWidget> {
  List<PdvCandidate>? _candidates;
  bool _loading = true;
  String? _fetchError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _fetchCandidates());
  }

  Future<void> _fetchCandidates() async {
    final provider = context.read<CaptureProvider>();
    final lat = provider.currentLat;
    final lng = provider.currentLng;

    if (lat == null || lng == null) {
      if (mounted) {
        setState(() {
          _loading = false;
          _candidates = [];
        });
      }
      return;
    }

    try {
      final api = context.read<ApiClient>();
      final list = await api.getList(
        '/api/vendedor-app/pdv/cercanos?lat=$lat&lng=$lng&radio=100',
      );
      if (mounted) {
        setState(() {
          _candidates = list
              .cast<Map<String, dynamic>>()
              .map(PdvCandidate.fromJson)
              .toList();
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _fetchError = 'Error al buscar PDVs: ${e.message}';
          _loading = false;
          _candidates = [];
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _fetchError = 'Error de conexión al buscar PDVs';
          _loading = false;
          _candidates = [];
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Text(
            'PDVs cercanos',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
        ),
        if (_loading)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_fetchError != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              _fetchError!,
              style: const TextStyle(color: Colors.red),
            ),
          )
        else if (_candidates!.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              'No hay PDVs cercanos (< 100m)',
              style: TextStyle(color: Colors.grey, fontStyle: FontStyle.italic),
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _candidates!.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final pdv = _candidates![index];
              return ListTile(
                leading: const Icon(Icons.store_outlined),
                title: Text(pdv.nombreDisplay),
                subtitle: Text('NRO: ${pdv.idClienteErp}'),
                trailing: Text(
                  '${pdv.distanciaM.toStringAsFixed(0)} m',
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                    color: Colors.teal,
                  ),
                ),
                onTap: () => context.read<CaptureProvider>().selectPdv(pdv),
              );
            },
          ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: TextButton.icon(
            onPressed: () =>
                context.read<CaptureProvider>().goToManualInput(),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Ingresar NRO manualmente'),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}
