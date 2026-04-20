import "package:flutter_secure_storage/flutter_secure_storage.dart";

class TokenStore {
  static const String _key = "converge_mobile_bearer_token";

  final FlutterSecureStorage _storage;

  TokenStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
          );

  // Save the authentication token
  Future<void> saveToken(String token) =>
      _storage.write(key: _key, value: token);

  // Get the token
  Future<String?> getToken() => _storage.read(key: _key);

  // Clear the token (logout)
  Future<void> clear() => _storage.delete(key: _key);
}
