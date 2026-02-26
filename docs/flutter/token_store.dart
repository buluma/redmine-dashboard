import "package:flutter_secure_storage/flutter_secure_storage.dart";

class TokenStore {
  static const _key = "nrcc_mobile_bearer_token";
  final FlutterSecureStorage _storage;

  TokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  Future<void> saveToken(String token) => _storage.write(key: _key, value: token);

  Future<String?> getToken() => _storage.read(key: _key);

  Future<void> clear() => _storage.delete(key: _key);
}
