import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_service.dart';
import '../../core/api/api_client.dart';
import '../../shared/widgets/loading_overlay.dart';

/// Pantalla de activación de dispositivo por API key.
/// El vendedor recibe la key de su supervisor e ingresa aquí la primera vez.
class ActivationScreen extends StatefulWidget {
  const ActivationScreen({super.key});

  @override
  State<ActivationScreen> createState() => _ActivationScreenState();
}

class _ActivationScreenState extends State<ActivationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _apiKeyController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  final _authService = AuthService();

  @override
  void dispose() {
    _apiKeyController.dispose();
    super.dispose();
  }

  Future<void> _activar() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await _authService.activate(_apiKeyController.text.trim());
      if (mounted) {
        context.go('/home');
      }
    } on ApiException catch (e) {
      setState(() {
        if (e.statusCode == 401 || e.statusCode == 403) {
          _errorMessage = 'Clave de activación inválida o expirada.';
        } else if (e.statusCode == 404) {
          _errorMessage = 'Clave no encontrada. Verificá con tu supervisor.';
        } else {
          _errorMessage = 'Error al activar: ${e.message}';
        }
      });
    } catch (e) {
      setState(() {
        _errorMessage =
            'Error de conexión. Verificá tu internet e intentá nuevamente.';
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: LoadingOverlay(
        isLoading: _isLoading,
        mensaje: 'Activando dispositivo...',
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Spacer(flex: 2),
                // Logo / título
                Icon(
                  Icons.store_rounded,
                  size: 72,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'SHELFYAPP',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                    letterSpacing: 2,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Ingresá tu clave de activación\npara comenzar a trabajar',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.grey.shade600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const Spacer(flex: 1),
                Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextFormField(
                        controller: _apiKeyController,
                        decoration: const InputDecoration(
                          labelText: 'Clave de activación',
                          hintText: 'sapp_...',
                          prefixIcon: Icon(Icons.vpn_key_outlined),
                        ),
                        autocorrect: false,
                        enableSuggestions: false,
                        keyboardType: TextInputType.visiblePassword,
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _activar(),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Ingresá la clave de activación';
                          }
                          if (!value.trim().startsWith('sapp_')) {
                            return 'La clave debe comenzar con "sapp_"';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      if (_errorMessage != null) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.errorContainer,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.error_outline,
                                color: theme.colorScheme.error,
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _errorMessage!,
                                  style: TextStyle(
                                    color: theme.colorScheme.error,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      ElevatedButton.icon(
                        onPressed: _isLoading ? null : _activar,
                        icon: const Icon(Icons.check_circle_outline),
                        label: const Text('Activar dispositivo'),
                      ),
                    ],
                  ),
                ),
                const Spacer(flex: 3),
                Text(
                  'Si no tenés tu clave, contactá a tu supervisor.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.grey.shade500,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
