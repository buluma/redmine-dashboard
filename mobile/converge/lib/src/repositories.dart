import "models.dart";
import "converge_api_client.dart";
import "token_store.dart";

class AuthRepository {
  final ConvergeApiClient _api;
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
  final ConvergeApiClient _api;

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

  Future<Issue> getIssue(String issueId) {
    return _api.getIssue(issueId);
  }
}

class IssueActionsRepository {
  final ConvergeApiClient _api;

  IssueActionsRepository(this._api);

  Future<void> updateStatus({
    required String issueId,
    required int statusId,
  }) {
    return _api.updateStatus(issueId: issueId, statusId: statusId);
  }

  Future<void> assignIssue({
    required String issueId,
    required int userId,
  }) {
    return _api.assignIssue(issueId: issueId, userId: userId);
  }

  Future<List<AssignableUser>> listAssignableUsers() {
    return _api.listAssignableUsers();
  }

  Future<List<TimeEntry>> listTimeEntries({required String issueId}) {
    return _api.listTimeEntries(issueId: issueId);
  }

  Future<void> createTimeEntry({
    required String issueId,
    required double hours,
    required int activityId,
    String? comment,
    String? spentOn,
  }) {
    return _api.createTimeEntry(
      issueId: issueId,
      hours: hours,
      activityId: activityId,
      comment: comment,
      spentOn: spentOn,
    );
  }

  Future<List<Map<String, dynamic>>> listActivities() {
    return _api.listActivities();
  }

  Future<List<Map<String, dynamic>>> getBreadcrumbs({required String issueId}) {
    return _api.getBreadcrumbs(issueId: issueId);
  }

  Future<AiSummaryResponse> summarizeIssue({required String issueId}) async {
    final json = await _api.summarizeIssue(issueId: issueId);
    return AiSummaryResponse.fromJson(json);
  }

  Future<AiCategorizeResponse> categorizeIssue({required String issueId}) async {
    final json = await _api.categorizeIssue(issueId: issueId);
    return AiCategorizeResponse.fromJson(json);
  }

  Future<Map<String, dynamic>> getAiStatus() {
    return _api.getAiStatus();
  }

  Future<void> editIssue({
    required String issueId,
    String? subject,
    String? description,
    String? priority,
    String? dueDate,
    String? startDate,
    double? estimatedHours,
  }) async {
    await _api.editIssue(
      issueId: issueId,
      subject: subject,
      description: description,
      priority: priority,
      dueDate: dueDate,
      startDate: startDate,
      estimatedHours: estimatedHours,
    );
  }

  Future<List<InternalNote>> listInternalNotes({required String issueId}) {
    return _api.listInternalNotes(issueId: issueId);
  }

  Future<InternalNote> createInternalNote({required String issueId, required String content}) {
    return _api.createInternalNote(issueId: issueId, content: content);
  }

  Future<bool> toggleFavorite({required String issueId}) {
    return _api.toggleFavorite(issueId: issueId);
  }

  Future<bool> isFavorited({required String issueId}) {
    return _api.isFavorited(issueId: issueId);
  }

  Future<void> postComment({
    required String issueId,
    required String comment,
  }) {
    return _api.postComment(
      issueId: issueId,
      comment: comment,
    );
  }

  Future<void> addGithubLink({
    required String issueId,
    required String repositoryFullName,
    int? githubIssueNumber,
    int? githubPrNumber,
    String? url,
    String? title,
  }) {
    return _api.addGithubLink(
      issueId: issueId,
      repositoryFullName: repositoryFullName,
      githubIssueNumber: githubIssueNumber,
      githubPrNumber: githubPrNumber,
      url: url,
      title: title,
    );
  }

  Future<void> removeGithubLink({
    required String issueId,
    required String linkId,
  }) {
    return _api.removeGithubLink(
      issueId: issueId,
      linkId: linkId,
    );
  }

  Future<List<IssueAttachment>> listAttachments({
    required String issueId,
  }) {
    return _api.listAttachments(issueId: issueId);
  }

  Future<void> uploadAttachment({
    required String issueId,
    required String filePath,
    String? description,
  }) {
    return _api.uploadAttachment(
      issueId: issueId,
      filePath: filePath,
      description: description,
    );
  }

  Future<void> addRelation({
    required String issueId,
    required int issueToId,
    required String relationType,
    int? delay,
  }) {
    return _api.addRelation(
      issueId: issueId,
      issueToId: issueToId,
      relationType: relationType,
      delay: delay,
    );
  }

  Future<void> removeRelation({
    required String issueId,
    required int relationId,
  }) {
    return _api.removeRelation(
      issueId: issueId,
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
    required String issueId,
    required int redmineAttachmentId,
  }) {
    return _api.attachmentUrl(
      issueId: issueId,
      redmineAttachmentId: redmineAttachmentId,
    );
  }

  Future<Map<String, String>> attachmentPreviewHeaders() {
    return _api.attachmentPreviewHeaders();
  }

  Future<String?> attachmentTextPreview({
    required String issueId,
    required int redmineAttachmentId,
    int maxChars = 1200,
  }) {
    return _api.fetchAttachmentTextPreview(
      issueId: issueId,
      redmineAttachmentId: redmineAttachmentId,
      maxChars: maxChars,
    );
  }
}
