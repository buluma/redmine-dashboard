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
  final String? assignedToName;
  final List<GithubLink> githubLinks;
  final List<IssueAttachment> attachments;
  final List<IssueRelation> relations;
  final List<AllowedStatus> allowedStatuses;
  final List<IssueChild> children;
  final List<TimeEntry> timeEntries;

  Issue({
    required this.id,
    required this.redmineIssueId,
    required this.subject,
    required this.description,
    required this.statusName,
    required this.priority,
    this.assignedToName,
    required this.githubLinks,
    required this.attachments,
    required this.relations,
    required this.allowedStatuses,
    required this.children,
    this.timeEntries = const <TimeEntry>[],
  });

  factory Issue.fromJson(Map<String, dynamic> json) => Issue(
        id: json["id"] as String,
        redmineIssueId: json["redmineIssueId"] as int,
        subject: json["subject"] as String,
        description: json["description"] as String?,
        statusName: json["statusName"] as String,
        priority: json["priority"] as String?,
        assignedToName: json["assignedToName"] as String?,
        githubLinks: ((json["githubLinks"] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => GithubLink.fromJson(e as Map<String, dynamic>))
            .toList(),
        attachments: ((json["attachments"] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => IssueAttachment.fromJson(e as Map<String, dynamic>))
            .toList(),
        relations: ((json["relations"] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => IssueRelation.fromJson(e as Map<String, dynamic>))
            .toList(),
        allowedStatuses: ((json["allowedStatuses"] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => AllowedStatus.fromJson(e as Map<String, dynamic>))
            .toList(),
        children: ((json["children"] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => IssueChild.fromJson(e as Map<String, dynamic>))
            .toList(),
        timeEntries: ((json["timeEntries"] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => TimeEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class IssueAttachment {
  final String id;
  final int redmineAttachmentId;
  final String filename;
  final int filesize;
  final String? contentType;
  final String? author;
  final String? createdOnRemote;

  IssueAttachment({
    required this.id,
    required this.redmineAttachmentId,
    required this.filename,
    required this.filesize,
    required this.contentType,
    required this.author,
    required this.createdOnRemote,
  });

  factory IssueAttachment.fromJson(Map<String, dynamic> json) => IssueAttachment(
        id: json["id"] as String,
        redmineAttachmentId: json["redmineAttachmentId"] as int,
        filename: json["filename"] as String,
        filesize: json["filesize"] as int? ?? 0,
        contentType: json["contentType"] as String?,
        author: json["author"] as String?,
        createdOnRemote: json["createdOnRemote"] as String?,
      );
}

class IssueRelation {
  final String id;
  final int redmineRelationId;
  final int targetIssueId;
  final String relationType;
  final int? delay;

  IssueRelation({
    required this.id,
    required this.redmineRelationId,
    required this.targetIssueId,
    required this.relationType,
    required this.delay,
  });

  factory IssueRelation.fromJson(Map<String, dynamic> json) => IssueRelation(
        id: json["id"] as String,
        redmineRelationId: json["redmineRelationId"] as int,
        targetIssueId: json["targetIssueId"] as int,
        relationType: json["relationType"] as String,
        delay: json["delay"] as int?,
      );
}

class AllowedStatus {
  final int id;
  final String name;

  AllowedStatus({
    required this.id,
    required this.name,
  });

  factory AllowedStatus.fromJson(Map<String, dynamic> json) => AllowedStatus(
        id: json["id"] as int,
        name: json["name"] as String,
      );
}

class IssueChild {
  final int id;
  final String subject;

  IssueChild({
    required this.id,
    required this.subject,
  });

  factory IssueChild.fromJson(Map<String, dynamic> json) => IssueChild(
        id: json["id"] as int,
        subject: json["subject"] as String,
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

class TimeEntry {
  final String id;
  final int? redmineTimeEntryId;
  final double hours;
  final int? activityId;
  final String? activityName;
  final String? authorName;
  final String? comments;
  final String spentOn;

  TimeEntry({
    required this.id,
    required this.redmineTimeEntryId,
    required this.hours,
    required this.activityId,
    required this.activityName,
    required this.authorName,
    required this.comments,
    required this.spentOn,
  });

  factory TimeEntry.fromJson(Map<String, dynamic> json) => TimeEntry(
        id: json["id"] as String,
        redmineTimeEntryId: json["redmineTimeEntryId"] as int?,
        hours: (json["hours"] as num?)?.toDouble() ?? 0.0,
        activityId: json["activityId"] as int?,
        activityName: json["activityName"] as String?,
        authorName: json["authorName"] as String?,
        comments: json["comments"] as String?,
        spentOn: json["spentOn"] as String,
      );
}

class AssignableUser {
  final int id;
  final String name;

  AssignableUser({required this.id, required this.name});

  factory AssignableUser.fromJson(Map<String, dynamic> json) => AssignableUser(
        id: json["id"] as int,
        name: json["name"] as String,
      );
}
