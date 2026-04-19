import "package:local_auth/local_auth.dart";

class BiometricService {
  static const String _reason = "Authenticate to unlock Converge";

  final LocalAuthentication _localAuth;

  BiometricService({LocalAuthentication? localAuth})
      : _localAuth = localAuth ?? LocalAuthentication();

  // Check if device supports biometric authentication
  Future<bool> isAvailable() async {
    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final isSupported = await _localAuth.isDeviceSupported();
      return canCheck || isSupported;
    } catch (e) {
      return false;
    }
  }

  // Get the type of biometric available
  Future<String> getBiometricType() async {
    try {
      final availableBiometrics = await _localAuth.getAvailableBiometrics();

      if (availableBiometrics.contains(BiometricType.face)) {
        return "Face ID";
      } else if (availableBiometrics.contains(BiometricType.fingerprint)) {
        return "Fingerprint";
      } else if (availableBiometrics.contains(BiometricType.iris)) {
        return "Iris";
      } else if (availableBiometrics.contains(BiometricType.strong)) {
        return "Biometric";
      } else if (availableBiometrics.contains(BiometricType.weak)) {
        return "Weak Biometric";
      }
      return "None";
    } catch (e) {
      return "None";
    }
  }

  // Authenticate the user
  // Returns true if successful, false if failed/cancelled
  Future<bool> authenticate() async {
    try {
      final canAuth = await isAvailable();
      if (!canAuth) {
        return false;
      }

      return await _localAuth.authenticate(
        localizedReason: _reason,
        options: const AuthenticationOptions(
          stickyAuth: true,        // Keep auth sticky across app resume
          biometricOnly: true,     // Only allow biometrics, no PIN/pattern
        ),
      );
    } catch (e) {
      return false;
    }
  }

  // Cancel any ongoing authentication
  Future<void> cancel() async {
    try {
      await _localAuth.stopAuthentication();
    } catch (e) {
      // Ignore
    }
  }
}