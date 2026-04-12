import "package:dio/dio.dart";
import "dart:math" as math;

import "models.dart";
import "token_store.dart";

class NrccApiClient {
  final Dio _dio;
  final TokenStore _tokenStore;
  final String _baseUrl;

  NrccApiClient({
    required String baseUrl,
    required TokenStore tokenStore,
  })  : _tokenStore = tokenStore,
        _baseUrl = baseUrl,
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

    if (e.type == DioExceptionType.connectionError) {
      throw ApiError(
        "Cannot reach NRCC server at $_baseUrl.\n"
        "Check that NRCC is running and reachable from this device.\n"
        "Android emulator usually needs http://10.0.2.2:3000.\n"
        "Physical phone must use your computer LAN IP, e.g. http://192.168.x.x:3000.",
      );
    }

    if (e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout) {
      throw ApiError(
        "Request timed out when contacting NRCC at $_baseUrl. "
        "Verify network path and server availability.",
      );
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
    String searchMode = "local",
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
          "searchMode": searchMode,
          "scope": "issues",
          "openOnly": true,
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

  Future<void> updateStatus({
    required int redmineIssueId,
    required int statusId,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/status",
        data: <String, dynamic>{"statusId": statusId},
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> assignIssue({
    required int redmineIssueId,
    required int userId,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/assign",
        data: <String, dynamic>{"userId": userId},
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<List<AssignableUser>> listAssignableUsers() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>("/api/mobile/v1/issues/assignable-users");
      final items = (response.data?["users"] as List<dynamic>?) ?? const <dynamic>[];
      return items.map((e) => AssignableUser.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<List<TimeEntry>> listTimeEntries({required int redmineIssueId}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/time-entries",
      );
      final items = (response.data?["items"] as List<dynamic>?) ?? const <dynamic>[];
      return items.map((e) => TimeEntry.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> createTimeEntry({
    required int redmineIssueId,
    required double hours,
    required int activityId,
    String? comment,
    String? spentOn,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/time-entries",
        data: <String, dynamic>{
          "hours": hours,
          "activityId": activityId,
          "comment": comment,
          "spentOn": spentOn,
        },
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<List<Map<String, dynamic>>> listActivities() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>("/api/mobile/v1/activities");
      final items = (response.data?["activities"] as List<dynamic>?) ?? const <dynamic>[];
      return items.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<List<Map<String, dynamic>>> getBreadcrumbs({required int redmineIssueId}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/breadcrumbs",
      );
      final items = (response.data?["breadcrumbs"] as List<dynamic>?) ?? const <dynamic>[];
      return items.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<Map<String, dynamic>> summarizeIssue({required int redmineIssueId}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        "/api/ai/summarize",
        data: <String, dynamic>{"issueId": "$redmineIssueId"},
      );
      return response.data ?? <String, dynamic>{};
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<Map<String, dynamic>> categorizeIssue({required int redmineIssueId}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        "/api/ai/categorize",
        data: <String, dynamic>{"issueId": "$redmineIssueId"},
      );
      return response.data ?? <String, dynamic>{};
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<Map<String, dynamic>> getAiStatus() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>("/api/ai/status");
      return response.data ?? <String, dynamic>{};
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<String?> getCachedSummary({required int redmineIssueId}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        "/api/ai/summarize?issueId=$redmineIssueId",
      );
      final summary = response.data?["summary"];
      if (summary is Map<String, dynamic>) {
        return null; // Not cached yet
      }
      return null;
    } on DioException catch (_) {
      return null;
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

  Future<List<IssueAttachment>> listAttachments({
    required int redmineIssueId,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/attachments",
      );
      final items = (response.data?["items"] as List<dynamic>?) ?? const <dynamic>[];
      return items.map((e) => IssueAttachment.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> uploadAttachment({
    required int redmineIssueId,
    required String filePath,
    String? description,
  }) async {
    try {
      final fileName = filePath.split("/").last;
      final form = FormData.fromMap(<String, dynamic>{
        "file": await MultipartFile.fromFile(filePath, filename: fileName),
        "description": description,
      });
      await _dio.post<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/attachments",
        data: form,
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> addRelation({
    required int redmineIssueId,
    required int issueToId,
    required String relationType,
    int? delay,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/relations",
        data: <String, dynamic>{
          "issueToId": issueToId,
          "relationType": relationType,
          "delay": delay,
        },
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> removeRelation({
    required int redmineIssueId,
    required int relationId,
  }) async {
    try {
      await _dio.delete<Map<String, dynamic>>(
        "/api/mobile/v1/issues/$redmineIssueId/relations/$relationId",
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> updateTimeEntry({
    required int redmineTimeEntryId,
    double? hours,
    int? activityId,
    String? comment,
    String? spentOn,
  }) async {
    try {
      await _dio.patch<Map<String, dynamic>>(
        "/api/time-entries/$redmineTimeEntryId",
        data: <String, dynamic>{
          "hours": hours,
          "activityId": activityId,
          "comment": comment,
          "spentOn": spentOn,
        },
      );
    } on DioException catch (e) {
      _throwApiError(e);
    }
  }

  Future<void> deleteTimeEntry({
    required int redmineTimeEntryId,
  }) async {
    try {
      await _dio.delete<Map<String, dynamic>>("/api/time-entries/$redmineTimeEntryId");
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

  String attachmentUrl({
    required int redmineIssueId,
    required int redmineAttachmentId,
  }) {
    final base = _baseUrl.replaceAll(RegExp(r"/+$"), "");
    return "$base/api/mobile/v1/issues/$redmineIssueId/attachments/$redmineAttachmentId";
  }

  Future<Map<String, String>> attachmentPreviewHeaders() async {
    final token = await _tokenStore.getToken();
    if (token == null || token.isEmpty) {
      return const <String, String>{};
    }
    return <String, String>{"Authorization": "Bearer $token"};
  }

  Future<String?> fetchAttachmentTextPreview({
    required int redmineIssueId,
    required int redmineAttachmentId,
    int maxChars = 1200,
  }) async {
    try {
      final response = await _dio.get<String>(
        "/api/mobile/v1/issues/$redmineIssueId/attachments/$redmineAttachmentId",
        options: Options(
          responseType: ResponseType.plain,
          headers: const <String, String>{"Range": "bytes=0-4095"},
          validateStatus: (status) => status != null && status >= 200 && status < 400,
        ),
      );
      final raw = (response.data ?? "").trim();
      if (raw.isEmpty) {
        return null;
      }
      return raw.substring(0, math.min(raw.length, maxChars));
    } catch (_) {
      return null;
    }
  }
}
