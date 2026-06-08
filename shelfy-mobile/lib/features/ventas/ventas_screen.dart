import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'models/ventas_response.dart';
import 'ventas_provider.dart';

/// Pantalla de ventas MTD del vendedor.
class VentasScreen extends StatefulWidget {
  const VentasScreen({super.key});

  @override
  State<VentasScreen> createState() => _VentasScreenState();
}

class _VentasScreenState extends State<VentasScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<VentasProvider>().fetch();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<VentasProvider>(
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
                  onPressed: () => context.read<VentasProvider>().fetch(),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          );
        }

        final data = provider.ventasData;
        if (data == null) {
          return const SizedBox.shrink();
        }

        return RefreshIndicator(
          onRefresh: () => context.read<VentasProvider>().fetch(),
          child: _VentasList(data: data),
        );
      },
    );
  }
}

class _VentasList extends StatelessWidget {
  final VentasResponse data;

  const _VentasList({required this.data});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat.currency(locale: 'es_AR', symbol: '\$');

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 1. Selector de período (solo MTD por ahora)
        _PeriodPill(periodo: data.periodo),
        const SizedBox(height: 16),

        // 2. Header: totales MTD
        _VentasHeader(data: data),
        const SizedBox(height: 16),

        // 3. Botón descargar PDF
        _PdfDownloadButton(),
        const SizedBox(height: 20),

        // 4. Lista de PDVs
        if (data.porPdv.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(
              child: Text(
                'Sin ventas registradas en este período',
                style: TextStyle(color: Colors.grey),
              ),
            ),
          )
        else ...[
          Text(
            'Detalle por PDV',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.primary,
                ),
          ),
          const SizedBox(height: 8),
          ...data.porPdv
              .map((pdv) => _PdvVentasTile(pdv: pdv, fmt: fmt))
              .toList(),
        ],
      ],
    );
  }
}

class _PeriodPill extends StatelessWidget {
  final String periodo;

  const _PeriodPill({required this.periodo});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            'MTD · $periodo',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Theme.of(context).colorScheme.onPrimaryContainer,
            ),
          ),
        ),
      ],
    );
  }
}

class _VentasHeader extends StatelessWidget {
  final VentasResponse data;

  const _VentasHeader({required this.data});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat.currency(locale: 'es_AR', symbol: '\$');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fmt.format(data.totalImporte),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Total vendido MTD',
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${data.totalFacturas}',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                Text(
                  'facturas',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Colors.grey[600]),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PdfDownloadButton extends StatelessWidget {
  const _PdfDownloadButton();

  Future<void> _onPressed(BuildContext context) async {
    final provider = context.read<VentasProvider>();
    final path = await provider.downloadPdf();
    if (!context.mounted) return;

    if (path != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('PDF descargado correctamente'),
          action: SnackBarAction(
            label: 'Abrir',
            onPressed: () => _openFile(context, path),
          ),
          duration: const Duration(seconds: 4),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.pdfError ?? 'Error al descargar el PDF'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _openFile(BuildContext context, String path) {
    // path_provider garantiza que el archivo existe en el directorio temp.
    // En iOS/Android usamos la URI nativa vía url_launcher si estuviera
    // disponible; como no está en pubspec, mostramos la ruta.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('PDF guardado en: $path')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<VentasProvider>(
      builder: (context, provider, _) {
        return OutlinedButton.icon(
          onPressed: provider.downloadingPdf ? null : () => _onPressed(context),
          icon: provider.downloadingPdf
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.picture_as_pdf_outlined),
          label: Text(
            provider.downloadingPdf ? 'Descargando...' : 'Descargar PDF',
          ),
        );
      },
    );
  }
}

class _PdvVentasTile extends StatelessWidget {
  final PdvVentas pdv;
  final NumberFormat fmt;

  const _PdvVentasTile({required this.pdv, required this.fmt});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(
          pdv.nombreDisplay,
          style: const TextStyle(fontWeight: FontWeight.w500),
        ),
        subtitle: Text(
          '#${pdv.idClienteErp} · ${pdv.facturas} factura${pdv.facturas != 1 ? "s" : ""}',
          style: TextStyle(color: Colors.grey[600], fontSize: 12),
        ),
        trailing: Text(
          fmt.format(pdv.importe),
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 15,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
      ),
    );
  }
}
