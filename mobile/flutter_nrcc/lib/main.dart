import "package:flutter/material.dart";

import "src/nrcc_api_client.dart";
import "src/repositories.dart";
import "src/screens.dart";
import "src/token_store.dart";

const String kNrccBaseUrl = String.fromEnvironment(
  "NRCC_BASE_URL",
  defaultValue: "http://10.0.2.2:3000",
);

void main() {
  runApp(const NrccApp());
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
    _apiClient = NrccApiClient(baseUrl: kNrccBaseUrl, tokenStore: _tokenStore);
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
