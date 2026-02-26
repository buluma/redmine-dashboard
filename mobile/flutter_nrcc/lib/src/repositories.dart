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

  Future<List<Issue>> listIssues({String? search, String searchMode = "local"}) {
    return _api.listIssues(search: search, searchMode: searchMode);
  }

  Future<Issue> getIssue(int redmineIssueId) {
    return _api.getIssue(redmineIssueId);
  }
}

class IssueActionsRepository {
  final NrccApiClient _api;

  IssueActionsRepository(this._api);

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
}
