import "package:flutter/material.dart";
import "package:flutter_dotenv/flutter_dotenv.dart";
import "package:sentry_flutter/sentry_flutter.dart";

import "src/nrcc_api_client.dart";
import "src/repositories.dart";
import "src/screens.dart";
import "src/token_store.dart";

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
      title: "NRCC Flutter",
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0A6E4F)),
        useMaterial3: true,
      ),
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
