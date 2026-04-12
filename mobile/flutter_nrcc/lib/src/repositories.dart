import "models.dart";
import "nrcc_api_client.dart";
import "token_store.dart";

class AuthRepository {
  final NrccApiClient _api;
  final TokenStore _tokenStore;

  AuthRepository(this._api, this._tokenStore);

  Future<void> pair({
    required String redmineBaseUrl,
    required String redmineApiKey,
    String? deviceName,
  }) async {
    final response = await _api.pairConnect(
      redmineBaseUrl: redmineBaseUrl,
      redmineApiKey: redmineApiKey,
      deviceName: deviceName,
    );
    await _tokenStore.saveToken(response.token);
  }

  Future<void> rotateToken() async {
    final token = await _api.rotateToken();
    if (token.isNotEmpty) {
      await _tokenStore.saveToken(token);
    }
  }

  Future<void> logout() async {
    await _api.revokeCurrentToken();
    await _tokenStore.clear();
  }
}

class IssuesRepository {
  final NrccApiClient _api;

  IssuesRepository(this._api);

  Future<List<Issue>> listIssues({
    String? status,
    String? priority,
    String? search,
    String searchMode = "local",
    String sort = "updated_desc",
    int page = 1,
    int pageSize = 25,
  }) {
    return _api.listIssues(
      status: status,
      priority: priority,
      search: search,
      searchMode: searchMode,
      sort: sort,
      page: page,
      pageSize: pageSize,
    );
  }

  Future<Issue> getIssue(int redmineIssueId) {
    return _api.getIssue(redmineIssueId);
  }
}

class IssueActionsRepository {
  final NrccApiClient _api;

  IssueActionsRepository(this._api);

  Future<void> updateStatus({
    required int redmineIssueId,
    required int statusId,
  }) {
    return _api.updateStatus(redmineIssueId: redmineIssueId, statusId: statusId);
  }

  Future<void> assignIssue({
    required int redmineIssueId,
    required int userId,
  }) {
    return _api.assignIssue(redmineIssueId: redmineIssueId, userId: userId);
  }

  Future<List<AssignableUser>> listAssignableUsers() {
    return _api.listAssignableUsers();
  }

  Future<List<TimeEntry>> listTimeEntries({required int redmineIssueId}) {
    return _api.listTimeEntries(redmineIssueId: redmineIssueId);
  }

  Future<void> createTimeEntry({
    required int redmineIssueId,
    required double hours,
    required int activityId,
    String? comment,
    String? spentOn,
  }) {
    return _api.createTimeEntry(
      redmineIssueId: redmineIssueId,
      hours: hours,
      activityId: activityId,
      comment: comment,
      spentOn: spentOn,
    );
  }

  Future<List<Map<String, dynamic>>> listActivities() {
    return _api.listActivities();
  }

  Future<List<Map<String, dynamic>>> getBreadcrumbs({required int redmineIssueId}) {
    return _api.getBreadcrumbs(redmineIssueId: redmineIssueId);
  }

  Future<AiSummaryResponse> summarizeIssue({required int redmineIssueId}) async {
    final json = await _api.summarizeIssue(redmineIssueId: redmineIssueId);
    return AiSummaryResponse.fromJson(json);
  }

  Future<AiCategorizeResponse> categorizeIssue({required int redmineIssueId}) async {
    final json = await _api.categorizeIssue(redmineIssueId: redmineIssueId);
    return AiCategorizeResponse.fromJson(json);
  }

  Future<Map<String, dynamic>> getAiStatus() {
    return _api.getAiStatus();
  }

  Future<void> postComment({
    required int redmineIssueId,
    required String comment,
  }) {
    return _api.postComment(
      redmineIssueId: redmineIssueId,
      comment: comment,
    );
  }

  Future<void> addGithubLink({
    required int redmineIssueId,
    required String repositoryFullName,
    int? githubIssueNumber,
    int? githubPrNumber,
    String? url,
    String? title,
  }) {
    return _api.addGithubLink(
      redmineIssueId: redmineIssueId,
      repositoryFullName: repositoryFullName,
      githubIssueNumber: githubIssueNumber,
      githubPrNumber: githubPrNumber,
      url: url,
      title: title,
    );
  }

  Future<void> removeGithubLink({
    required int redmineIssueId,
    required String linkId,
  }) {
    return _api.removeGithubLink(
      redmineIssueId: redmineIssueId,
      linkId: linkId,
    );
  }

  Future<List<IssueAttachment>> listAttachments({
    required int redmineIssueId,
  }) {
    return _api.listAttachments(redmineIssueId: redmineIssueId);
  }

  Future<void> uploadAttachment({
    required int redmineIssueId,
    required String filePath,
    String? description,
  }) {
    return _api.uploadAttachment(
      redmineIssueId: redmineIssueId,
      filePath: filePath,
      description: description,
    );
  }

  Future<void> addRelation({
    required int redmineIssueId,
    required int issueToId,
    required String relationType,
    int? delay,
  }) {
    return _api.addRelation(
      redmineIssueId: redmineIssueId,
      issueToId: issueToId,
      relationType: relationType,
      delay: delay,
    );
  }

  Future<void> removeRelation({
    required int redmineIssueId,
    required int relationId,
  }) {
    return _api.removeRelation(
      redmineIssueId: redmineIssueId,
      relationId: relationId,
    );
  }

  Future<void> updateTimeEntry({
    required int redmineTimeEntryId,
    double? hours,
    int? activityId,
    String? comment,
    String? spentOn,
  }) {
    return _api.updateTimeEntry(
      redmineTimeEntryId: redmineTimeEntryId,
      hours: hours,
      activityId: activityId,
      comment: comment,
      spentOn: spentOn,
    );
  }

  Future<void> deleteTimeEntry({
    required int redmineTimeEntryId,
  }) {
    return _api.deleteTimeEntry(
      redmineTimeEntryId: redmineTimeEntryId,
    );
  }

  String attachmentPreviewUrl({
    required int redmineIssueId,
    required int redmineAttachmentId,
  }) {
    return _api.attachmentUrl(
      redmineIssueId: redmineIssueId,
      redmineAttachmentId: redmineAttachmentId,
    );
  }

  Future<Map<String, String>> attachmentPreviewHeaders() {
    return _api.attachmentPreviewHeaders();
  }

  Future<String?> attachmentTextPreview({
    required int redmineIssueId,
    required int redmineAttachmentId,
    int maxChars = 1200,
  }) {
    return _api.fetchAttachmentTextPreview(
      redmineIssueId: redmineIssueId,
      redmineAttachmentId: redmineAttachmentId,
      maxChars: maxChars,
    );
  }
}
