import "package:flutter/material.dart";
import "package:flutter_dotenv/flutter_dotenv.dart";
import "package:sentry_flutter/sentry_flutter.dart";

import "src/nrcc_api_client.dart";
import "src/repositories.dart";
import "src/screens.dart";
import "src/token_store.dart";

class _WebPalette {
  static const Color bg = Color(0xFFEAF0F4);
  static const Color bgSoft = Color(0xFFF7FAFC);
  static const Color ink = Color(0xFF162538);
  static const Color inkSoft = Color(0xFF5A6D83);
  static const Color card = Color(0xFFFBFDFF);
  static const Color line = Color(0xFFCCD7E2);
  static const Color accent = Color(0xFF0F6F87);
  static const Color accentStrong = Color(0xFF0A556A);
  static const Color accentSoft = Color(0xFFD6EAF2);
  static const Color signal = Color(0xFFBD5A26);
  static const Color signalSoft = Color(0xFFF8E2D5);
  static const Color danger = Color(0xFF9F2F2F);
  static const Color ok = Color(0xFF2C7B58);
}

ThemeData _buildTheme(Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  final baseScheme = ColorScheme.fromSeed(
    seedColor: _WebPalette.accent,
    brightness: brightness,
  );

  final scheme = isDark
      ? baseScheme.copyWith(
          primary: const Color(0xFF4ECDC4),
          onPrimary: const Color(0xFF0C2528),
          primaryContainer: const Color(0xFF1A3D3A),
          onPrimaryContainer: const Color(0xFFAEEAE4),
          secondary: const Color(0xFFFF9F43),
          onSecondary: const Color(0xFF3A230F),
          secondaryContainer: const Color(0xFF3D2A1A),
          onSecondaryContainer: const Color(0xFFFFD6B0),
          surface: const Color(0xFF1F1F3A),
          onSurface: const Color(0xFFEAEAEA),
          outline: const Color(0xFF3C4B63),
          outlineVariant: const Color(0xFF2D3A52),
          error: const Color(0xFFFF6B6B),
          onError: const Color(0xFF3A1A1A),
        )
      : baseScheme.copyWith(
          primary: _WebPalette.accent,
          onPrimary: Colors.white,
          primaryContainer: _WebPalette.accentSoft,
          onPrimaryContainer: _WebPalette.accentStrong,
          secondary: _WebPalette.signal,
          onSecondary: Colors.white,
          secondaryContainer: _WebPalette.signalSoft,
          onSecondaryContainer: _WebPalette.signal,
          tertiary: _WebPalette.ok,
          surface: _WebPalette.card,
          onSurface: _WebPalette.ink,
          outline: _WebPalette.line,
          outlineVariant: _WebPalette.line.withValues(alpha: 0.78),
          error: _WebPalette.danger,
          onError: Colors.white,
        );

  final cardColor = isDark ? const Color(0xFF232448) : _WebPalette.card;
  final scaffoldColor = isDark ? const Color(0xFF1A1A2E) : _WebPalette.bg;
  final fillColor = isDark ? const Color(0xFF232E46) : _WebPalette.bgSoft;

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: scaffoldColor,
    canvasColor: scaffoldColor,
    cardColor: cardColor,
    textTheme:
        (isDark
                ? Typography.material2021().white
                : Typography.material2021().black)
            .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface),
    appBarTheme: AppBarTheme(
      elevation: 0,
      centerTitle: false,
      backgroundColor: cardColor,
      foregroundColor: scheme.onSurface,
      scrolledUnderElevation: 0.6,
      surfaceTintColor: scheme.primary.withValues(alpha: 0.06),
      titleTextStyle: TextStyle(
        color: scheme.onSurface,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: cardColor,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: fillColor,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outline.withValues(alpha: 0.85)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.primary, width: 1.4),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      labelStyle: TextStyle(
        color: isDark ? const Color(0xFF9EB0C6) : _WebPalette.inkSoft,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: scheme.primary,
        side: BorderSide(color: scheme.outline),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      side: BorderSide(color: scheme.outlineVariant),
      selectedColor: scheme.primaryContainer,
      backgroundColor: fillColor,
      labelStyle: TextStyle(
        color: scheme.onSurface,
        fontWeight: FontWeight.w600,
      ),
      secondaryLabelStyle: TextStyle(
        color: scheme.onPrimaryContainer,
        fontWeight: FontWeight.w600,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: scheme.surface,
      contentTextStyle: TextStyle(color: scheme.onSurface),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: DividerThemeData(
      color: scheme.outlineVariant.withValues(alpha: 0.55),
      thickness: 1,
    ),
  );
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: ".env");

  final dsn = _env("SENTRY_DSN");
  final tracesSampleRate = _envDouble("SENTRY_TRACES_SAMPLE_RATE", 0.2);
  final profilesSampleRate = _envDouble("SENTRY_PROFILES_SAMPLE_RATE", 0.1);
  final sendDefaultPii = _envBool("SENTRY_SEND_DEFAULT_PII", true);
  final enableLogs = _envBool("SENTRY_ENABLE_LOGS", false);

  await SentryFlutter.init((options) {
    options.dsn = dsn.isEmpty ? null : dsn;
    options.sendDefaultPii = sendDefaultPii;
    options.tracesSampleRate = tracesSampleRate;
    options.profilesSampleRate = profilesSampleRate;
    options.enableLogs = enableLogs;
  }, appRunner: () => runApp(SentryWidget(child: const NrccApp())));
}

String _env(String key, [String fallback = ""]) {
  return dotenv.env[key]?.trim() ?? fallback;
}

double _envDouble(String key, double fallback) {
  final raw = _env(key);
  return double.tryParse(raw) ?? fallback;
}

bool _envBool(String key, bool fallback) {
  final raw = _env(key).toLowerCase();
  if (raw == "true" || raw == "1" || raw == "yes") return true;
  if (raw == "false" || raw == "0" || raw == "no") return false;
  return fallback;
}

class NrccApp extends StatefulWidget {
  const NrccApp({super.key});

  @override
  State<NrccApp> createState() => _NrccAppState();
}

class _NrccAppState extends State<NrccApp> {
  late final TokenStore _tokenStore;
  late final NrccApiClient _apiClient;
  late final AuthRepository _authRepository;
  late final IssuesRepository _issuesRepository;
  late final IssueActionsRepository _actionsRepository;
  bool _paired = false;
  bool _bootstrapping = true;

  @override
  void initState() {
    super.initState();
    _tokenStore = TokenStore();
    _apiClient = NrccApiClient(
      baseUrl: _env("NRCC_BASE_URL", "http://100.100.245.3:3000"),
      tokenStore: _tokenStore,
      onUnauthorized: () {
        if (!mounted) return;
        setState(() {
          _paired = false;
          _bootstrapping = false;
        });
      },
    );
    _authRepository = AuthRepository(_apiClient, _tokenStore);
    _issuesRepository = IssuesRepository(_apiClient);
    _actionsRepository = IssueActionsRepository(_apiClient);
    _checkExistingToken();
  }

  Future<void> _checkExistingToken() async {
    final token = await _tokenStore.getToken();
    if (!mounted) return;
    setState(() {
      _paired = token != null && token.isNotEmpty;
      _bootstrapping = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "NRCC",
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
      home: _bootstrapping
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : _paired
          ? IssueListScreen(
              issuesRepository: _issuesRepository,
              actionsRepository: _actionsRepository,
              onLogout: () async {
                await _authRepository.logout();
                if (!mounted) return;
                setState(() {
                  _paired = false;
                });
              },
            )
          : PairScreen(
              authRepository: _authRepository,
              onPaired: () {
                setState(() {
                  _paired = true;
                });
              },
            ),
    );
  }
}
