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
  final int? redmineIssueId;
  final String? redmineBaseUrl;
  final String source;
  final int? localIssueNumber;
  final String subject;
  final String? description;
  final String statusName;
  final String? priority;
  final String? assignedToName;
  final String? parentIssueLabel;
  final int? parentIssueId;
  final String? projectName;
  final String? dueDate;
  final String? startDate;
  final double? estimatedHours;
  final bool isFavorited;
  final List<GithubLink> githubLinks;
  final List<IssueAttachment> attachments;
  final List<IssueRelation> relations;
  final List<AllowedStatus> allowedStatuses;
  final List<IssueChild> children;
  final List<TimeEntry> timeEntries;

  Issue({
    required this.id,
    required this.redmineIssueId,
    this.redmineBaseUrl,
    this.source = "redmine",
    this.localIssueNumber,
    required this.subject,
    required this.description,
    required this.statusName,
    required this.priority,
    this.assignedToName,
    this.parentIssueLabel,
    this.parentIssueId,
    this.projectName,
    this.dueDate,
    this.startDate,
    this.estimatedHours,
    this.isFavorited = false,
    required this.githubLinks,
    required this.attachments,
    required this.relations,
    required this.allowedStatuses,
    required this.children,
    this.timeEntries = const <TimeEntry>[],
  });

  factory Issue.fromJson(Map<String, dynamic> json) => Issue(
    id: json["id"] as String,
    redmineIssueId: json["redmineIssueId"] as int?,
    redmineBaseUrl: json["redmineBaseUrl"] as String?,
    source: json["source"] as String? ?? "redmine",
    localIssueNumber: json["localIssueNumber"] as int?,
    subject: json["subject"] as String,
    description: json["description"] as String?,
    statusName: json["statusName"] as String,
    priority: json["priority"] as String?,
    assignedToName: json["assignedToName"] as String?,
    parentIssueLabel: json["parentIssueLabel"] as String?,
    parentIssueId: json["parentIssueId"] as int?,
    projectName: json["projectName"] as String?,
    dueDate: json["dueDate"] as String?,
    startDate: json["startDate"] as String?,
    estimatedHours: (json["estimatedHours"] as num?)?.toDouble(),
    isFavorited: json["isFavorited"] as bool? ?? false,
    githubLinks: ((json["githubLinks"] as List<dynamic>?) ?? const <dynamic>[])
        .map((e) => GithubLink.fromJson(e as Map<String, dynamic>))
        .toList(),
    attachments: ((json["attachments"] as List<dynamic>?) ?? const <dynamic>[])
        .map((e) => IssueAttachment.fromJson(e as Map<String, dynamic>))
        .toList(),
    relations: ((json["relations"] as List<dynamic>?) ?? const <dynamic>[])
        .map((e) => IssueRelation.fromJson(e as Map<String, dynamic>))
        .toList(),
    allowedStatuses:
        ((json["allowedStatuses"] as List<dynamic>?) ?? const <dynamic>[])
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

  factory IssueAttachment.fromJson(Map<String, dynamic> json) =>
      IssueAttachment(
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

  AllowedStatus({required this.id, required this.name});

  factory AllowedStatus.fromJson(Map<String, dynamic> json) =>
      AllowedStatus(id: json["id"] as int, name: json["name"] as String);
}

class IssueChild {
  final int id;
  final String subject;

  IssueChild({required this.id, required this.subject});

  factory IssueChild.fromJson(Map<String, dynamic> json) =>
      IssueChild(id: json["id"] as int, subject: json["subject"] as String);
}

class PairConnectResponse {
  final String token;
  final MobileUser user;

  PairConnectResponse({required this.token, required this.user});

  factory PairConnectResponse.fromJson(Map<String, dynamic> json) =>
      PairConnectResponse(
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

  factory AssignableUser.fromJson(Map<String, dynamic> json) =>
      AssignableUser(id: json["id"] as int, name: json["name"] as String);
}

class InternalNote {
  final String id;
  final String content;
  final String createdAt;
  final String authorName;

  InternalNote({
    required this.id,
    required this.content,
    required this.createdAt,
    required this.authorName,
  });

  factory InternalNote.fromJson(Map<String, dynamic> json) => InternalNote(
    id: json["id"] as String,
    content: json["content"] as String,
    createdAt: json["createdAt"] as String,
    authorName: json["authorName"] as String,
  );
}

class AiSummaryResponse {
  final String summary;
  final List<String> keyPoints;
  final List<String> actionItems;
  final double confidence;
  final String modelUsed;
  final bool rawResponse;

  AiSummaryResponse({
    required this.summary,
    required this.keyPoints,
    required this.actionItems,
    required this.confidence,
    required this.modelUsed,
    this.rawResponse = false,
  });

  factory AiSummaryResponse.fromJson(Map<String, dynamic> json) =>
      AiSummaryResponse(
        summary: json["summary"] as String? ?? "",
        keyPoints:
            (json["keyPoints"] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            const <String>[],
        actionItems:
            (json["actionItems"] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            const <String>[],
        confidence: (json["confidence"] as num?)?.toDouble() ?? 0.0,
        modelUsed: json["modelUsed"] as String? ?? "",
        rawResponse: json["rawResponse"] as bool? ?? false,
      );
}

class AiCategorizeResponse {
  final Map<String, dynamic>? suggestedPriority;
  final List<Map<String, dynamic>> suggestedTags;
  final Map<String, dynamic>? suggestedCategory;
  final String reasoning;
  final String modelUsed;

  AiCategorizeResponse({
    this.suggestedPriority,
    this.suggestedTags = const <Map<String, dynamic>>[],
    this.suggestedCategory,
    required this.reasoning,
    required this.modelUsed,
  });

  factory AiCategorizeResponse.fromJson(Map<String, dynamic> json) =>
      AiCategorizeResponse(
        suggestedPriority: json["suggestedPriority"] as Map<String, dynamic>?,
        suggestedTags:
            ((json["suggestedTags"] as List<dynamic>?) ?? const <dynamic>[])
                .map((e) => Map<String, dynamic>.from(e as Map))
                .toList(),
        suggestedCategory: json["suggestedCategory"] as Map<String, dynamic>?,
        reasoning: json["reasoning"] as String? ?? "",
        modelUsed: json["modelUsed"] as String? ?? "",
      );
}
