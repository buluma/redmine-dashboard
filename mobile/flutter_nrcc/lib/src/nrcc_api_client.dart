import "package:dio/dio.dart";

import "models.dart";
import "token_store.dart";

class NrccApiClient {
  final Dio _dio;
  final TokenStore _tokenStore;

  NrccApiClient({
    required String baseUrl,
    required TokenStore tokenStore,
  })  : _tokenStore = tokenStore,
        _dio = Dio(BaseOptions(baseUrl: baseUrl)) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStore.getToken();
          if (token != null && token.isNotEmpty) {
            options.headers["Authorization"] = "Bearer $token";
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            await _tokenStore.clear();
          }
          handler.next(error);
        },
      ),
    );
  }

  Never _throwApiError(DioException e) {
    final data = e.response?.data;
    if (data is Map<String, dynamic> && data["error"] is String) {
      throw ApiError(data["error"] as String);
    }
    throw ApiError(e.message ?? "API request failed");
  }

  Future<PairConnectResponse> pairConnect({
    required String redmineBaseUrl,
    required String redmineApiKey,
    String? deviceName,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        "/api/mobile/v1/pair/connect",
        data: <String, dynamic>{
          "baseUrl": redmineBaseUrl,
          "apiKey": redmineApiKey,
          "deviceName": deviceName,
        },
      );
      return PairConnectResponse.fromJson(response.data ?? <String, dynamic>{});
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<List<Issue>> listIssues({
    String? status,
    String? priority,
    String? search,
    String sort = "updated_desc",
    int page = 1,
    int pageSize = 25,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        "/api/mobile/v1/issues",
        queryParameters: <String, dynamic>{
          "status": status,
          "priority": priority,
          "search": search,
          "sort": sort,
          "page": page,
          "pageSize": pageSize,
        },
      );
      final items = (response.data?["items"] as List<dynamic>?) ?? const <dynamic>[];
      return items.map((e) => Issue.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<Issue> getIssue(int redmineIssueId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>("/api/mobile/v1/issues/$redmineIssueId");
      final issue = response.data?["issue"] as Map<String, dynamic>? ?? <String, dynamic>{};
      return Issue.fromJson(issue);
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> postComment({
    required int redmineIssueId,
    required String comment,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/comment",
        data: <String, dynamic>{"comment": comment},
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> addGithubLink({
    required int redmineIssueId,
    required String repositoryFullName,
    int? githubIssueNumber,
    int? githubPrNumber,
    String? url,
    String? title,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/github-links",
        data: <String, dynamic>{
          "repositoryFullName": repositoryFullName,
          "githubIssueNumber": githubIssueNumber,
          "githubPrNumber": githubPrNumber,
          "url": url,
          "title": title,
        },
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> removeGithubLink({
    required int redmineIssueId,
    required String linkId,
  }) async {
    try {
      await _dio.delete<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/github-links/$linkId",
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<String> rotateToken() async {
    try {
      final response = await _dio.post<Map<String, dynamic>>("/api/mobile/v1/tokens/rotate");
      return (response.data?["token"] as String?) ?? "";
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> revokeCurrentToken() async {
    try {
      await _dio.delete<Map<String, dynamic>>("/api/mobile/v1/tokens/current");
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }
}
