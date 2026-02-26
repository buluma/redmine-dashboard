class ApiError implements Exception {
  final String message;
  ApiError(this.message);

  @override
  String toString() => message;
}

class MobileUser {
  final String id;
  final String username;
  final String displayName;

  MobileUser({
    required this.id,
    required this.username,
    required this.displayName,
  });

  factory MobileUser.fromJson(Map<String, dynamic> json) => MobileUser(
        id: json["id"] as String,
        username: json["username"] as String,
        displayName: json["displayName"] as String,
      );
}

class GithubLink {
  final String id;
  final String repositoryFullName;
  final int? githubIssueNumber;
  final int? githubPrNumber;
  final String url;
  final String? title;

  GithubLink({
    required this.id,
    required this.repositoryFullName,
    required this.githubIssueNumber,
    required this.githubPrNumber,
    required this.url,
    required this.title,
  });

  factory GithubLink.fromJson(Map<String, dynamic> json) => GithubLink(
        id: json["id"] as String,
        repositoryFullName: json["repositoryFullName"] as String,
        githubIssueNumber: json["githubIssueNumber"] as int?,
        githubPrNumber: json["githubPrNumber"] as int?,
        url: json["url"] as String,
        title: json["title"] as String?,
      );
}

class Issue {
  final String id;
  final int redmineIssueId;
  final String subject;
  final String? description;
  final String statusName;
  final String? priority;
  final List<GithubLink> githubLinks;

  Issue({
    required this.id,
    required this.redmineIssueId,
    required this.subject,
    required this.description,
    required this.statusName,
    required this.priority,
    required this.githubLinks,
  });

  factory Issue.fromJson(Map<String, dynamic> json) => Issue(
        id: json["id"] as String,
        redmineIssueId: json["redmineIssueId"] as int,
        subject: json["subject"] as String,
        description: json["description"] as String?,
        statusName: json["statusName"] as String,
        priority: json["priority"] as String?,
        githubLinks: ((json["githubLinks"] as List<dynamic>?) ?? const [])
            .map((e) => GithubLink.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class PairConnectResponse {
  final String token;
  final MobileUser user;

  PairConnectResponse({
    required this.token,
    required this.user,
  });

  factory PairConnectResponse.fromJson(Map<String, dynamic> json) => PairConnectResponse(
        token: json["token"] as String,
        user: MobileUser.fromJson(json["user"] as Map<String, dynamic>),
      );
}
