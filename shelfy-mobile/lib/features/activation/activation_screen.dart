import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_service.dart';
import '../../core/config/app_config.dart';
import '../../shared/widgets/loading_overlay.dart';
import '../../shared/widgets/shelfy_logo.dart';
import '../../theme/shelfy_tokens.dart';

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
  String? _backendStatus;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkBackend());
  }

  Future<void> _checkBackend() async {
    final authService = context.read<AuthService>();
    try {
      await authService.api.pingHealth();
      if (mounted) {
        setState(() {
          _backendStatus = 'Backend OK · ${AppConfig.baseUrl}';
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _backendStatus = 'Sin backend · ${AppConfig.baseUrl} · ${e.message}';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _backendStatus = 'Sin backend · ${AppConfig.baseUrl}';
        });
      }
    }
  }

  @override
  void dispose() {
    _apiKeyController.dispose();
    super.dispose();
  }

  Future<void> _activar(AuthService authService) async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await authService.activate(_apiKeyController.text.trim());
      // GoRouter redirect (refreshListenable) navega a /home automáticamente.
    } on ApiException catch (e) {
      setState(() {
        if (e.statusCode == 0) {
          _errorMessage = e.message;
        } else if (e.statusCode == 401 || e.statusCode == 403) {
          _errorMessage = 'Clave de activación inválida o expirada.';
        } else if (e.statusCode == 404) {
          _errorMessage = 'Clave no encontrada. Verificá con tu supervisor.';
        } else if (e.statusCode == 422) {
          _errorMessage = 'Datos inválidos. Revisá el formato de la clave.';
        } else {
          _errorMessage = e.message;
        }
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Error inesperado: $e';
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authService = context.read<AuthService>();
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      backgroundColor: ShelfyTokens.bg,
      resizeToAvoidBottomInset: true,
      body: LoadingOverlay(
        isLoading: _isLoading,
        mensaje: 'Activando dispositivo...',
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(24, 16, 24, 24 + bottomInset),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: constraints.maxHeight - bottomInset - 32,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 24),
                      const Center(
                        child: ShelfyLogo(size: 88, showLabel: true),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Ingresá tu clave de activación\npara comenzar a trabajar',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: Colors.grey.shade600,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),
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
                              keyboardType: TextInputType.text,
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => _activar(authService),
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
                              onPressed:
                                  _isLoading ? null : () => _activar(authService),
                              icon: const Icon(Icons.check_circle_outline),
                              label: const Text('Activar dispositivo'),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 32),
                      if (_backendStatus != null)
                        Text(
                          _backendStatus!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: _backendStatus!.startsWith('Backend OK')
                                ? Colors.green.shade700
                                : Colors.orange.shade800,
                            fontSize: 11,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      const SizedBox(height: 8),
                      Text(
                        'La key completa empieza con sapp_ (copiala entera del portal).',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.grey.shade500,
                          fontSize: 11,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
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
              );
            },
          ),
        ),
      ),
    );
  }
}
