import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:plugin_platform_interface/plugin_platform_interface.dart";
import "package:url_launcher_platform_interface/link.dart";
import "package:url_launcher_platform_interface/url_launcher_platform_interface.dart";

import "package:flutter_nrcc/src/models.dart";
import "package:flutter_nrcc/src/nrcc_api_client.dart";
import "package:flutter_nrcc/src/repositories.dart";
import "package:flutter_nrcc/src/screens.dart";
import "package:flutter_nrcc/src/token_store.dart";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late UrlLauncherPlatform originalLauncher;
  late _TestUrlLauncher testLauncher;

  setUp(() {
    originalLauncher = UrlLauncherPlatform.instance;
    testLauncher = _TestUrlLauncher();
    UrlLauncherPlatform.instance = testLauncher;
  });

  tearDown(() {
    UrlLauncherPlatform.instance = originalLauncher;
  });

  testWidgets("tapping GitHub link opens explicit URL", (tester) async {
    final issue = _issueWithLinks(<GithubLink>[
      GithubLink(
        id: "l1",
        repositoryFullName: "acme/platform",
        githubIssueNumber: 42,
        githubPrNumber: null,
        url: "https://github.com/acme/platform/issues/999",
        title: "Existing link",
      ),
    ]);

    await _pumpIssueDetail(tester, issue: issue);
    await _tapVisible(tester, find.text("GitHub Links"));
    await tester.pumpAndSettle();

    await _tapText(tester, "Existing link");
    await tester.pumpAndSettle();

    expect(testLauncher.launchedUrls, hasLength(1));
    expect(testLauncher.launchedUrls.single, "https://github.com/acme/platform/issues/999");
  });

  testWidgets("tapping link falls back to constructed issue URL when raw URL is missing", (tester) async {
    final issue = _issueWithLinks(<GithubLink>[
      GithubLink(
        id: "l2",
        repositoryFullName: "acme/platform",
        githubIssueNumber: 42,
        githubPrNumber: null,
        url: "",
        title: null,
      ),
    ]);

    await _pumpIssueDetail(tester, issue: issue);
    await _tapVisible(tester, find.text("GitHub Links"));
    await tester.pumpAndSettle();

    await _tapText(tester, "acme/platform#42");
    await tester.pumpAndSettle();

    expect(testLauncher.launchedUrls, hasLength(1));
    expect(testLauncher.launchedUrls.single, "https://github.com/acme/platform/issues/42");
  });

  testWidgets("shows snackbar when GitHub link cannot be resolved", (tester) async {
    final issue = _issueWithLinks(<GithubLink>[
      GithubLink(
        id: "l3",
        repositoryFullName: "",
        githubIssueNumber: null,
        githubPrNumber: null,
        url: "not-a-url",
        title: "Broken link",
      ),
    ]);

    await _pumpIssueDetail(tester, issue: issue);
    await _tapVisible(tester, find.text("GitHub Links"));
    await tester.pumpAndSettle();

    await _tapText(tester, "Broken link");
    await tester.pumpAndSettle();

    expect(find.text("Could not resolve GitHub link"), findsOneWidget);
    expect(testLauncher.launchedUrls, isEmpty);
  });
}

Future<void> _pumpIssueDetail(
  WidgetTester tester, {
  required Issue issue,
}) async {
  final issuesRepository = _FakeIssuesRepository(issue);
  final actionsRepository = _FakeIssueActionsRepository();

  await tester.pumpWidget(
    MaterialApp(
      home: IssueDetailScreen(
        issueId: issue.id,
        redmineIssueId: issue.redmineIssueId,
        issuesRepository: issuesRepository,
        actionsRepository: actionsRepository,
      ),
    ),
  );

  await tester.pumpAndSettle();
}

Future<void> _tapText(WidgetTester tester, String text) async {
  final finder = find.text(text);
  await _tapVisible(tester, finder);
}

Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder, warnIfMissed: false);
}

Issue _issueWithLinks(List<GithubLink> links) {
  return Issue(
    id: "issue-1",
    redmineIssueId: 123,
    subject: "Sample issue",
    description: "Sample description",
    statusName: "In Progress",
    priority: "Normal",
    githubLinks: links,
    attachments: const <IssueAttachment>[],
    relations: const <IssueRelation>[],
    allowedStatuses: const <AllowedStatus>[],
    children: const <IssueChild>[],
  );
}

class _FakeIssuesRepository extends IssuesRepository {
  _FakeIssuesRepository(this._issue) : super(_dummyApiClient());

  final Issue _issue;

  @override
  Future<Issue> getIssue(String issueId) async => _issue;
}

class _FakeIssueActionsRepository extends IssueActionsRepository {
  _FakeIssueActionsRepository() : super(_dummyApiClient());

  @override
  Future<Map<String, String>> attachmentPreviewHeaders() async => const <String, String>{};

  @override
  Future<List<TimeEntry>> listTimeEntries({required String issueId}) async => const <TimeEntry>[];

  @override
  Future<List<Map<String, dynamic>>> listActivities() async => const <Map<String, dynamic>>[];

  @override
  Future<List<AssignableUser>> listAssignableUsers() async => const <AssignableUser>[];

  @override
  Future<List<Map<String, dynamic>>> getBreadcrumbs({required String issueId}) async => const <Map<String, dynamic>>[];

  @override
  Future<bool> isFavorited({required String issueId}) async => false;

  @override
  Future<List<InternalNote>> listInternalNotes({required String issueId}) async => const <InternalNote>[];

  @override
  Future<void> postComment({required String issueId, required String comment}) async {}

  @override
  Future<void> addGithubLink({
    required String issueId,
    required String repositoryFullName,
    int? githubIssueNumber,
    int? githubPrNumber,
    String? url,
    String? title,
  }) async {}

  @override
  Future<void> removeGithubLink({required String issueId, required String linkId}) async {}

  @override
  Future<void> addRelation({
    required String issueId,
    required int issueToId,
    required String relationType,
    int? delay,
  }) async {}

  @override
  Future<void> removeRelation({required String issueId, required int relationId}) async {}
}

NrccApiClient _dummyApiClient() {
  return NrccApiClient(
    baseUrl: "http://localhost:3000",
    tokenStore: TokenStore(),
  );
}

class _TestUrlLauncher extends UrlLauncherPlatform with MockPlatformInterfaceMixin {
  final List<String> launchedUrls = <String>[];

  @override
  LinkDelegate? get linkDelegate => null;

  @override
  Future<bool> canLaunch(String url) async => true;

  @override
  Future<bool> launch(
    String url, {
    required bool useSafariVC,
    required bool useWebView,
    required bool enableJavaScript,
    required bool enableDomStorage,
    required bool universalLinksOnly,
    required Map<String, String> headers,
    String? webOnlyWindowName,
  }) async {
    launchedUrls.add(url);
    return true;
  }
}
