import "package:flutter_secure_storage/flutter_secure_storage.dart";
import "biometric_service.dart";

class TokenStore {
  static const String _key = "converge_mobile_bearer_token";
  static const String _biometricEnabledKey = "biometric_enabled";
  
  final FlutterSecureStorage _storage;
  final BiometricService _biometricService;

  TokenStore({
    FlutterSecureStorage? storage,
    BiometricService? biometricService,
  })  : _storage = storage ?? const FlutterSecureStorage(
          aOptions: AndroidOptions(
            encryptedSharedPreferences: true,
          ),
        ),
        _biometricService = biometricService ?? BiometricService();

  /// Save the authentication token
  Future<void> saveToken(String token) => _storage.write(key: _key, value: token);

  /// Get the token - optionally requires biometric
  /// [requireBiometric] If true, will prompt for biometric before returning token
  Future<String?> getToken({bool requireBiometric = false}) async {
    if (requireBiometric) {
      final authenticated = await _biometricService.authenticate();
      if (!authenticated) {
        return null;
      }
    }
    return _storage.read(key: _key);
  }

  /// Check if biometric authentication is enabled by the user
  Future<bool> isBiometricEnabled() async {
    final value = await _storage.read(key: _biometricEnabledKey);
    return value == "true";
  }

  /// Enable or disable biometric authentication
  Future<void> setBiometricEnabled(bool enabled) async {
    await _storage.write(key: _biometricEnabledKey, value: enabled ? "true" : "false");
  }

  /// Check if biometric is available on device
  Future<bool> isBiometricAvailable() => _biometricService.isAvailable();

  /// Get the type of biometric available
  Future<String> getBiometricType() => _biometricService.getBiometricType();

  /// Clear the token (logout)
  Future<void> clear() => _storage.delete(key: _key);
}