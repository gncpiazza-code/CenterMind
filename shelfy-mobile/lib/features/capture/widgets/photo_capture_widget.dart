import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../capture_provider.dart';

/// Widget de captura multi-foto: grilla con botón agregar y borrado por tap.
class PhotoCaptureWidget extends StatelessWidget {
  const PhotoCaptureWidget({super.key});

  static final _picker = ImagePicker();

  Future<void> _addPhoto(BuildContext context) async {
    final provider = context.read<CaptureProvider>();
    if (provider.photos.length >= 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Máximo 10 fotos por exhibición')),
      );
      return;
    }

    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 1920,
      maxHeight: 1920,
    );

    if (picked != null) {
      provider.addPhoto(File(picked.path));
    }
  }

  void _deletePhoto(BuildContext context, int index) {
    context.read<CaptureProvider>().removePhoto(index);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CaptureProvider>(
      builder: (context, provider, _) {
        final photos = provider.photos;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${photos.length} foto${photos.length == 1 ? '' : 's'}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (photos.length < 10)
                    TextButton.icon(
                      onPressed: () => _addPhoto(context),
                      icon: const Icon(Icons.add_a_photo_outlined),
                      label: const Text('Agregar foto'),
                    ),
                ],
              ),
            ),
            if (photos.isEmpty)
              GestureDetector(
                onTap: () => _addPhoto(context),
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  height: 160,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: Theme.of(context).colorScheme.outline,
                      style: BorderStyle.solid,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_a_photo, size: 48, color: Colors.grey),
                      SizedBox(height: 8),
                      Text(
                        'Toca para tomar la primera foto',
                        style: TextStyle(color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              )
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                ),
                itemCount: photos.length + (photos.length < 10 ? 1 : 0),
                itemBuilder: (context, index) {
                  // Último ítem = botón agregar (si < 10 fotos)
                  if (index == photos.length) {
                    return GestureDetector(
                      onTap: () => _addPhoto(context),
                      child: Container(
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: Theme.of(context).colorScheme.outline,
                          ),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.add, size: 36, color: Colors.grey),
                      ),
                    );
                  }

                  final file = photos[index];
                  return Stack(
                    fit: StackFit.expand,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(
                          file,
                          fit: BoxFit.cover,
                        ),
                      ),
                      // Botón eliminar
                      Positioned(
                        top: 4,
                        right: 4,
                        child: GestureDetector(
                          onTap: () => _deletePhoto(context, index),
                          child: Container(
                            decoration: const BoxDecoration(
                              color: Colors.black54,
                              shape: BoxShape.circle,
                            ),
                            padding: const EdgeInsets.all(4),
                            child: const Icon(
                              Icons.close,
                              color: Colors.white,
                              size: 16,
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            const SizedBox(height: 16),
          ],
        );
      },
    );
  }
}
