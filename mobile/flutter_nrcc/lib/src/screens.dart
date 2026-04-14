import "package:flutter/material.dart";
import "package:flutter_highlight/flutter_highlight.dart";
import "package:flutter_highlight/themes/github.dart";
import "package:flutter_markdown/flutter_markdown.dart";
import "package:highlight/highlight.dart" as hi;
import "package:markdown/markdown.dart" as md;
import "package:url_launcher/url_launcher.dart";

import "models.dart";
import "repositories.dart";

class _CodeBlockBuilder extends MarkdownElementBuilder {
  _CodeBlockBuilder({required this.theme});

  final ThemeData theme;

  static const Map<String, String> _languageAlias = <String, String>{
    "rb": "ruby",
    "js": "javascript",
    "ts": "typescript",
    "sh": "bash",
    "shell": "bash",
    "yml": "yaml",
    "plain": "plaintext",
    "text": "plaintext",
  };

  String? _languageFromElement(md.Element? element) {
    final className = element?.attributes["class"];
    if (className == null || className.trim().isEmpty) {
      return null;
    }
    final match = RegExp(
      r"(?:^|\s)language-([A-Za-z0-9_+\-]+)(?:\s|$)",
    ).firstMatch(className);
    if (match == null) {
      return null;
    }
    final raw = (match.group(1) ?? "").toLowerCase();
    if (raw.isEmpty) {
      return null;
    }
    return _languageAlias[raw] ?? raw;
  }

  String? _safeLanguage(String? language, String source) {
    if (language == null) {
      return null;
    }
    try {
      hi.highlight.parse(source, language: language);
      return language;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    md.Element? codeElement;
    for (final node in element.children ?? const <md.Node>[]) {
      if (node is md.Element && node.tag == "code") {
        codeElement = node;
        break;
      }
    }

    final code = (codeElement?.textContent ?? element.textContent).trimRight();
    if (code.isEmpty) {
      return null;
    }

    final language = _safeLanguage(_languageFromElement(codeElement), code);
    final baseStyle = preferredStyle ?? theme.textTheme.bodySmall;
    final textStyle = (baseStyle ?? const TextStyle()).copyWith(
      fontFamily: "monospace",
      height: 1.35,
      fontSize: 13,
    );

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.all(12),
        child: HighlightView(
          code,
          language: language,
          theme: githubTheme,
          textStyle: textStyle,
        ),
      ),
    );
  }
}

class PairScreen extends StatefulWidget {
  final AuthRepository authRepository;
  final VoidCallback onPaired;

  const PairScreen({
    super.key,
    required this.authRepository,
    required this.onPaired,
  });

  @override
  State<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends State<PairScreen> {
  final _baseUrl = TextEditingController();
  final _apiKey = TextEditingController();
  final _deviceName = TextEditingController(text: "Android Device");
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _baseUrl.dispose();
    _apiKey.dispose();
    _deviceName.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text("Pair with NRCC")),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: <Widget>[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: <Color>[scheme.primary, scheme.primaryContainer],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: scheme.outlineVariant.withValues(alpha: 0.6),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Icon(
                      Icons.phonelink_lock,
                      color: scheme.onPrimary,
                      size: 24,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Connect this phone to Redmine Dashboard",
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: scheme.onPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Use your base URL and API key from web settings.",
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onPrimary.withValues(alpha: 0.86),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    children: <Widget>[
                      TextField(
                        controller: _baseUrl,
                        decoration: const InputDecoration(
                          labelText: "Redmine Base URL",
                          prefixIcon: Icon(Icons.link),
                        ),
                        keyboardType: TextInputType.url,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _apiKey,
                        decoration: const InputDecoration(
                          labelText: "Redmine API Key",
                          prefixIcon: Icon(Icons.key),
                        ),
                        obscureText: true,
                        enableSuggestions: false,
                        autocorrect: false,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _deviceName,
                        decoration: const InputDecoration(
                          labelText: "Device Name",
                          prefixIcon: Icon(Icons.smartphone),
                        ),
                        textInputAction: TextInputAction.done,
                      ),
                      const SizedBox(height: 14),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _loading
                              ? null
                              : () async {
                                  setState(() {
                                    _loading = true;
                                    _error = null;
                                  });
                                  try {
                                    await widget.authRepository.pair(
                                      redmineBaseUrl: _baseUrl.text.trim(),
                                      redmineApiKey: _apiKey.text.trim(),
                                      deviceName: _deviceName.text.trim(),
                                    );
                                    widget.onPaired();
                                  } catch (e) {
                                    setState(() => _error = e.toString());
                                  } finally {
                                    if (mounted) {
                                      setState(() => _loading = false);
                                    }
                                  }
                                },
                          icon: _loading
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.login),
                          label: Text(_loading ? "Pairing..." : "Pair Device"),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (_error != null) ...<Widget>[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _error!,
                    style: TextStyle(color: theme.colorScheme.onErrorContainer),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class IssueListScreen extends StatefulWidget {
  final IssuesRepository issuesRepository;
  final IssueActionsRepository actionsRepository;
  final VoidCallback onLogout;

  const IssueListScreen({
    super.key,
    required this.issuesRepository,
    required this.actionsRepository,
    required this.onLogout,
  });

  @override
  State<IssueListScreen> createState() => _IssueListScreenState();
}

class _IssueListScreenState extends State<IssueListScreen> {
  final _search = TextEditingController();
  String _searchMode = "local";
  String _sort = "updated_desc";
  int _page = 1;
  final int _pageSize = 20;
  bool _showFavoritesOnly = false;
  List<Issue> _issues = <Issue>[];
  bool _loading = false;
  bool _hasMore = false;
  String? _error;

  Future<void> _load({bool reset = false}) async {
    if (reset) setState(() => _page = 1);
    final currentPage = reset ? 1 : _page;

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final issues = await widget.issuesRepository.listIssues(
        search: _search.text.trim().isEmpty ? null : _search.text.trim(),
        searchMode: _searchMode,
        sort: _sort,
        page: currentPage,
        pageSize: _pageSize,
      );
      setState(() {
        _issues = issues;
        _hasMore = issues.length >= _pageSize;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _nextPage() {
    if (!_hasMore || _loading) return;
    setState(() => _page++);
    _load();
  }

  void _prevPage() {
    if (_page <= 1 || _loading) return;
    setState(() => _page--);
    _load();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  bool _isHighPriority(String? value) {
    final normalized = (value ?? "").toLowerCase();
    return normalized.contains("urgent") ||
        normalized.contains("high") ||
        normalized.contains("critical") ||
        normalized.contains("immediate");
  }

  bool _isDoneStatus(String value) {
    final normalized = value.toLowerCase();
    return normalized.contains("closed") ||
        normalized.contains("resolved") ||
        normalized.contains("done");
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final visibleIssues = _showFavoritesOnly
        ? _issues.where((issue) => issue.isFavorited).toList(growable: false)
        : _issues;

    return Scaffold(
      appBar: AppBar(
        title: const Text("My Issues"),
        actions: <Widget>[
          IconButton(
            onPressed: () =>
                setState(() => _showFavoritesOnly = !_showFavoritesOnly),
            icon: Icon(_showFavoritesOnly ? Icons.star : Icons.star_border),
            tooltip: _showFavoritesOnly ? "Show all" : "Show favorites",
          ),
          IconButton(
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
            tooltip: "Logout",
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => _load(reset: true),
          child: Column(
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                child: SearchBar(
                  controller: _search,
                  hintText: "Search issues",
                  leading: const Icon(Icons.search),
                  trailing: <Widget>[
                    IconButton(
                      icon: Icon(
                        _loading ? Icons.hourglass_bottom : Icons.sync,
                      ),
                      onPressed: _loading ? null : () => _load(reset: true),
                      tooltip: "Refresh",
                    ),
                  ],
                  onSubmitted: (_) => _load(reset: true),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: <Widget>[
                      FilterChip(
                        label: const Text("Updated ↓"),
                        selected: _sort == "updated_desc",
                        onSelected: (_) {
                          setState(() => _sort = "updated_desc");
                          _load(reset: true);
                        },
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: const Text("Updated ↑"),
                        selected: _sort == "updated_asc",
                        onSelected: (_) {
                          setState(() => _sort = "updated_asc");
                          _load(reset: true);
                        },
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: const Text("Priority"),
                        selected: _sort == "priority",
                        onSelected: (_) {
                          setState(() => _sort = "priority");
                          _load(reset: true);
                        },
                      ),
                      const SizedBox(width: 6),
                      FilterChip(
                        label: const Text("Due Date"),
                        selected: _sort == "due_date",
                        onSelected: (_) {
                          setState(() => _sort = "due_date");
                          _load(reset: true);
                        },
                      ),
                      const SizedBox(width: 12),
                      FilterChip(
                        avatar: const Icon(Icons.cloud, size: 16),
                        label: const Text("Hybrid"),
                        selected: _searchMode == "hybrid",
                        onSelected: (_) {
                          setState(() {
                            _searchMode = _searchMode == "hybrid" ? "local" : "hybrid";
                          });
                          _load(reset: true);
                        },
                      ),
                    ],
                  ),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: scheme.errorContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _error!,
                      style: TextStyle(color: scheme.onErrorContainer),
                    ),
                  ),
                ),
              if (_loading && _issues.isEmpty) const LinearProgressIndicator(),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: <Widget>[
                    Text(
                      "Page $_page · ${visibleIssues.length} issues",
                      style: theme.textTheme.bodySmall,
                    ),
                    Row(
                      children: <Widget>[
                        TextButton.icon(
                          onPressed: _page > 1 && !_loading ? _prevPage : null,
                          icon: const Icon(Icons.chevron_left, size: 18),
                          label: const Text("Prev"),
                        ),
                        TextButton.icon(
                          onPressed: _hasMore && !_loading ? _nextPage : null,
                          label: const Text("Next"),
                          icon: const Icon(Icons.chevron_right, size: 18),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Expanded(
                child: visibleIssues.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: <Widget>[
                          const SizedBox(height: 56),
                          Icon(
                            _showFavoritesOnly
                                ? Icons.star_border
                                : Icons.inbox_outlined,
                            size: 34,
                            color: scheme.outline,
                          ),
                          const SizedBox(height: 10),
                          Center(
                            child: Text(
                              _showFavoritesOnly
                                  ? "No favorited issues on this page."
                                  : "No issues found.",
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ],
                      )
                    : ListView.builder(
                        itemCount: visibleIssues.length,
                        itemBuilder: (context, index) {
                          final issue = visibleIssues[index];
                          final isDone = _isDoneStatus(issue.statusName);
                          final priorityColor = _isHighPriority(issue.priority)
                              ? scheme.error
                              : scheme.onSurfaceVariant;

                          final isLocal = issue.source == "local";

                          return Card(
                            margin: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 4,
                            ),
                            clipBehavior: Clip.antiAlias,
                            shape: isLocal
                                ? RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    side: BorderSide(
                                      color: scheme.tertiary.withValues(alpha: 0.3),
                                      width: 1,
                                    ),
                                  )
                                : null,
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 8,
                              ),
                              leading: Stack(
                                clipBehavior: Clip.none,
                                children: <Widget>[
                                  Container(
                                    width: 48,
                                    height: 48,
                                    decoration: BoxDecoration(
                                      color: isDone
                                          ? scheme.tertiaryContainer
                                          : _isHighPriority(issue.priority)
                                              ? scheme.errorContainer
                                              : scheme.primaryContainer,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    alignment: Alignment.center,
                                    child: FittedBox(
                                      fit: BoxFit.scaleDown,
                                      child: Text(
                                        isLocal
                                            ? "L${issue.localIssueNumber ?? "?"}"
                                            : "#${issue.redmineIssueId ?? "?"}",
                                        style: theme.textTheme.labelMedium
                                            ?.copyWith(
                                              color: isDone
                                                  ? scheme.onTertiaryContainer
                                                  : _isHighPriority(issue.priority)
                                                      ? scheme.onErrorContainer
                                                      : scheme.onPrimaryContainer,
                                              fontWeight: FontWeight.w700,
                                            ),
                                      ),
                                    ),
                                  ),
                                  if (isLocal)
                                    Positioned(
                                      right: -4,
                                      top: -4,
                                      child: Container(
                                        padding: const EdgeInsets.all(2),
                                        decoration: BoxDecoration(
                                          color: scheme.tertiary,
                                          shape: BoxShape.circle,
                                        ),
                                        child: const Icon(
                                          Icons.person,
                                          size: 8,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              title: Text(
                                issue.subject,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  if (issue.projectName != null &&
                                      issue.projectName!.trim().isNotEmpty)
                                    Text(
                                      issue.projectName!,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                            color: scheme.onSurfaceVariant,
                                          ),
                                    ),
                                  if (issue.assignedToName != null)
                                    Text(
                                      issue.assignedToName!,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                            color: scheme.onSurfaceVariant,
                                          ),
                                    ),
                                ],
                              ),
                              trailing: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                mainAxisSize: MainAxisSize.min,
                                children: <Widget>[
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 3,
                                    ),
                                    decoration: BoxDecoration(
                                      color: isDone
                                          ? scheme.tertiaryContainer
                                          : scheme.primaryContainer,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      issue.statusName,
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: isDone
                                            ? scheme.onTertiaryContainer
                                            : scheme.onPrimaryContainer,
                                      ),
                                    ),
                                  ),
                                  if (issue.priority != null) ...<Widget>[
                                    const SizedBox(height: 4),
                                    Text(
                                      issue.priority!,
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w600,
                                            color: priorityColor,
                                          ),
                                    ),
                                  ],
                                  const SizedBox(height: 2),
                                  Icon(
                                    issue.isFavorited
                                        ? Icons.star
                                        : Icons.chevron_right,
                                    color: issue.isFavorited
                                        ? scheme.secondary
                                        : scheme.outline,
                                    size: 18,
                                  ),
                                ],
                              ),
                              onTap: () async {
                                await Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => IssueDetailScreen(
                                      issueId: issue.id,
                                      redmineIssueId: issue.redmineIssueId,
                                      issuesRepository: widget.issuesRepository,
                                      actionsRepository:
                                          widget.actionsRepository,
                                    ),
                                  ),
                                );
                                if (mounted) {
                                  await _load();
                                }
                              },
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class IssueDetailScreen extends StatefulWidget {
  final String issueId;
  final int? redmineIssueId;
  final IssuesRepository issuesRepository;
  final IssueActionsRepository actionsRepository;

  const IssueDetailScreen({
    super.key,
    required this.issueId,
    this.redmineIssueId,
    required this.issuesRepository,
    required this.actionsRepository,
  });

  @override
  State<IssueDetailScreen> createState() => _IssueDetailScreenState();
}

class _IssueDetailScreenState extends State<IssueDetailScreen> {
  Issue? _issue;
  bool _loading = false;
  String? _error;
  Map<String, String> _attachmentHeaders = const <String, String>{};
  final _comment = TextEditingController();
  final _repo = TextEditingController();
  final _ghIssue = TextEditingController();
  final _relationIssue = TextEditingController();
  String _relationType = "relates";
  bool _expandOverview = true;
  bool _expandDescription = true;
  bool _expandStatus = false;
  bool _expandAssign = false;
  bool _expandTime = false;
  bool _expandAllowed = false;
  bool _expandComment = false;
  bool _expandGithub = false;
  bool _expandInternalNotes = false;
  bool _expandAttachments = false;
  bool _expandRelations = false;
  bool _expandAi = false;
  String? _statusError;
  String? _assignError;
  List<TimeEntry> _timeEntries = <TimeEntry>[];
  List<Map<String, dynamic>> _activities = <Map<String, dynamic>>[];
  List<AssignableUser> _assignableUsers = <AssignableUser>[];
  List<Map<String, dynamic>> _breadcrumbs = <Map<String, dynamic>>[];
  List<InternalNote> _internalNotes = <InternalNote>[];
  bool _isFavorited = false;
  AiSummaryResponse? _aiSummary;
  AiCategorizeResponse? _aiCategory;
  bool _aiLoading = false;
  String? _aiError;
  final _timeHours = TextEditingController();
  final _timeComment = TextEditingController();
  String? _timeSpentOn;
  int? _timeActivityId;
  bool _timeLoading = false;

  bool _isHighPriority(String? value) {
    final normalized = (value ?? "").toLowerCase();
    return normalized.contains("urgent") ||
        normalized.contains("high") ||
        normalized.contains("critical") ||
        normalized.contains("immediate");
  }

  bool _isDoneStatus(String value) {
    final normalized = value.toLowerCase();
    return normalized.contains("closed") ||
        normalized.contains("resolved") ||
        normalized.contains("done");
  }

  String _formatDateShort(String dateStr) {
    try {
      final d = DateTime.parse(dateStr);
      return "${d.day}/${d.month}";
    } catch (_) {
      return dateStr.substring(0, 10);
    }
  }

  Widget _buildSkeleton(ThemeData theme) {
    final scheme = theme.colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
      children: <Widget>[
        // Hero skeleton
        Container(
          height: 120,
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Center(
            child: CircularProgressIndicator(),
          ),
        ),
        const SizedBox(height: 12),
        // Section skeletons
        for (int i = 0; i < 4; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
      ],
    );
  }

  String _normalizeIssueDescription(String? input) {
    if (input == null || input.trim().isEmpty) return "";
    String out = input;
    // Textile → Markdown approximations

    // Strip Redmine TOC/notextile macros that do not map to flutter_markdown.
    out = out
        .replaceAll(
          RegExp(r"^\s*\{\{>?toc(?:\([^)]*\))?\}\}\s*$", multiLine: true),
          "",
        )
        .replaceAll(RegExp(r"</?notextile>", caseSensitive: false), "");

    // Convert Textile headings (h1. / h2.) into Markdown headings.
    out = out.replaceAllMapped(
      RegExp(r"^h([1-6])\.\s+(.+)$", multiLine: true),
      (m) => "${"#" * int.parse(m.group(1)!)} ${m.group(2)!.trim()}",
    );

    // Convert Redmine collapse macro blocks to blockquotes with a bold title.
    out = out.replaceAllMapped(
      RegExp(r"\{\{collapse(?:\(([^)]*)\))?\s*\n([\s\S]*?)\n\}\}"),
      (m) {
        final title = (m.group(1) ?? "Details").trim().isEmpty
            ? "Details"
            : (m.group(1) ?? "Details").trim();
        final body = (m.group(2) ?? "").trim();
        if (body.isEmpty) return "> **$title**";
        final quoted = body
            .split("\n")
            .map((line) => line.trim().isEmpty ? ">" : "> $line")
            .join("\n");
        return "> **$title**\n>\n$quoted";
      },
    );

    // Convert patterns like: "link":https://example.com
    out = out.replaceAllMapped(
      RegExp(r'"?link"?\s*:\s*(https?:\/\/[^\s)"\]]+)'),
      (m) => "[link](${m.group(1)})",
    );

    // Convert Textile links: "label":https://example.com
    out = out.replaceAllMapped(
      RegExp(r'"([^"\n]+)":(https?:\/\/[^\s<>"\)\]]+)'),
      (m) => "[${m.group(1)}](${m.group(2)})",
    );

    // Convert Textile inline code and image syntax.
    out = out
        .replaceAllMapped(
          RegExp(r"(^|[^\w`])@([^\n@]+?)@(?=[^\w`]|$)"),
          (m) => "${m.group(1)}`${m.group(2)}`",
        )
        .replaceAllMapped(
          RegExp(r"!((?:https?:\/\/|\/)[^\s!]+)!"),
          (m) => "![](${m.group(1)})",
        );

    // Convert any remaining bare URLs to markdown links.
    out = out.replaceAllMapped(
      RegExp(r'(?<!\()(?<!\])\b(https?:\/\/[^\s<]+)'),
      (m) => "<${m.group(1)}>",
    );

    return out;
  }

  Widget _sectionCard({
    required BuildContext context,
    required String sectionId,
    required String title,
    required Widget child,
    required bool expanded,
    required ValueChanged<bool> onExpandedChanged,
  }) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    IconData sectionIcon(String id) {
      switch (id) {
        case "overview":
          return Icons.info_outline;
        case "description":
          return Icons.notes;
        case "status":
          return Icons.sync_alt;
        case "assign":
          return Icons.person_add_alt_1;
        case "time":
          return Icons.timer_outlined;
        case "ai":
          return Icons.auto_awesome;
        case "allowed":
          return Icons.rule;
        case "comment":
          return Icons.chat_bubble_outline;
        case "github":
          return Icons.link;
        case "internal-notes":
          return Icons.sticky_note_2_outlined;
        case "attachments":
          return Icons.attach_file;
        case "relations":
          return Icons.device_hub;
        default:
          return Icons.tune;
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 0),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          bottom: BorderSide(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.2),
            width: 0.5,
          ),
        ),
      ),
      child: Theme(
        data: theme.copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: ValueKey<String>("$sectionId:$expanded"),
          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          initiallyExpanded: expanded,
          onExpansionChanged: onExpandedChanged,
          iconColor: scheme.primary,
          collapsedIconColor: scheme.onSurfaceVariant,
          title: Row(
            children: <Widget>[
              Icon(
                sectionIcon(sectionId),
                size: 18,
                color: expanded ? scheme.primary : scheme.onSurfaceVariant,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: expanded ? scheme.onSurface : scheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
          children: <Widget>[child],
        ),
      ),
    );
  }

  Future<void> _openMarkdownLink(String? href) async {
    if (href == null || href.trim().isEmpty) return;
    final uri = Uri.tryParse(href.trim());
    if (uri == null) return;
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text("Could not open link: $href")));
    }
  }

  bool _isImageAttachment(IssueAttachment attachment) {
    final type = (attachment.contentType ?? "").toLowerCase();
    if (type.startsWith("image/")) return true;
    final file = attachment.filename.toLowerCase();
    return file.endsWith(".png") ||
        file.endsWith(".jpg") ||
        file.endsWith(".jpeg") ||
        file.endsWith(".gif") ||
        file.endsWith(".webp") ||
        file.endsWith(".bmp");
  }

  bool _isTextDocAttachment(IssueAttachment attachment) {
    final type = (attachment.contentType ?? "").toLowerCase();
    if (type.startsWith("text/")) return true;
    return type == "application/json" ||
        type == "application/xml" ||
        type == "application/yaml" ||
        type == "application/x-yaml" ||
        type == "application/javascript";
  }

  String _attachmentUrl(IssueAttachment attachment) {
    return widget.actionsRepository.attachmentPreviewUrl(
      issueId: widget.issueId,
      redmineAttachmentId: attachment.redmineAttachmentId,
    );
  }

  Future<void> _loadAttachmentHeaders() async {
    final headers = await widget.actionsRepository.attachmentPreviewHeaders();
    if (!mounted) return;
    setState(() => _attachmentHeaders = headers);
  }

  Uri? _resolveGithubUri(GithubLink link) {
    final rawUrl = link.url.trim();
    if (rawUrl.isNotEmpty) {
      final parsed = Uri.tryParse(rawUrl);
      if (parsed != null &&
          (parsed.scheme == "http" || parsed.scheme == "https")) {
        return parsed;
      }
    }

    final repo = link.repositoryFullName.trim();
    if (repo.isEmpty) {
      return null;
    }

    final issueNo = link.githubIssueNumber;
    if (issueNo != null && issueNo > 0) {
      return Uri.https("github.com", "/$repo/issues/$issueNo");
    }

    final prNo = link.githubPrNumber;
    if (prNo != null && prNo > 0) {
      return Uri.https("github.com", "/$repo/pull/$prNo");
    }

    return Uri.https("github.com", "/$repo");
  }

  String _githubLinkDisplayTitle(GithubLink link) {
    final customTitle = link.title?.trim();
    if (customTitle != null && customTitle.isNotEmpty) {
      return customTitle;
    }
    if (link.githubPrNumber != null) {
      return "${link.repositoryFullName}#PR-${link.githubPrNumber}";
    }
    if (link.githubIssueNumber != null) {
      return "${link.repositoryFullName}#${link.githubIssueNumber}";
    }
    return link.repositoryFullName;
  }

  Future<void> _openGithubLink(GithubLink link) async {
    final uri = _resolveGithubUri(link);
    if (uri == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Could not resolve GitHub link")),
      );
      return;
    }

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Could not open GitHub link: ${uri.toString()}"),
        ),
      );
    }
  }

  MarkdownStyleSheet _markdownStyle(BuildContext context) {
    final theme = Theme.of(context);
    final textTheme = theme.textTheme;

    return MarkdownStyleSheet.fromTheme(theme).copyWith(
      p: textTheme.bodyMedium?.copyWith(height: 1.45),
      h1: textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
      h2: textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
      h3: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      h4: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      blockSpacing: 14,
      listIndent: 22,
      listBullet: textTheme.bodyLarge?.copyWith(height: 1.4),
      code: textTheme.bodySmall?.copyWith(
        fontFamily: "monospace",
        backgroundColor: theme.colorScheme.surfaceContainerHighest,
      ),
      codeblockPadding: const EdgeInsets.all(12),
      codeblockDecoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      blockquote: textTheme.bodyMedium?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
        height: 1.45,
      ),
      blockquotePadding: const EdgeInsets.symmetric(
        horizontal: 12,
        vertical: 8,
      ),
      blockquoteDecoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        border: Border(
          left: BorderSide(color: theme.colorScheme.primary, width: 3),
        ),
      ),
      tableHead: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      tableBody: textTheme.bodyMedium,
      tableBorder: TableBorder.all(color: theme.colorScheme.outlineVariant),
      tableCellsPadding: const EdgeInsets.symmetric(
        horizontal: 10,
        vertical: 8,
      ),
      a: textTheme.bodyMedium?.copyWith(
        color: theme.colorScheme.primary,
        decoration: TextDecoration.underline,
      ),
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final issue = await widget.issuesRepository.getIssue(widget.issueId);
      setState(() => _issue = issue);
      await _loadAttachmentHeaders();
      await _loadTimeEntries();
      await _loadAssignableUsers();
      await _loadBreadcrumbs();
      await _loadFavoriteStatus();
      await _loadInternalNotes();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadTimeEntries() async {
    try {
      final entries = await widget.actionsRepository.listTimeEntries(
        issueId: widget.issueId,
      );
      final activities = await widget.actionsRepository.listActivities();
      if (mounted) {
        setState(() {
          _timeEntries = entries;
          _activities = activities;
          if (activities.isNotEmpty && _timeActivityId == null) {
            _timeActivityId = activities.first["id"] as int?;
          }
        });
      }
    } catch (_) {
      // Time entries are optional
    }
  }

  Future<void> _loadAssignableUsers() async {
    try {
      final users = await widget.actionsRepository.listAssignableUsers();
      if (mounted) {
        setState(() => _assignableUsers = users);
      }
    } catch (_) {
      // Assignable users are optional
    }
  }

  Future<void> _loadBreadcrumbs() async {
    try {
      final breadcrumbs = await widget.actionsRepository.getBreadcrumbs(
        issueId: widget.issueId,
      );
      if (mounted) {
        setState(() => _breadcrumbs = breadcrumbs);
      }
    } catch (_) {
      // Breadcrumbs are optional
    }
  }

  Future<void> _loadFavoriteStatus() async {
    try {
      final favorited = await widget.actionsRepository.isFavorited(
        issueId: widget.issueId,
      );
      if (mounted) setState(() => _isFavorited = favorited);
    } catch (_) {}
  }

  Future<void> _toggleFavorite() async {
    try {
      final favorited = await widget.actionsRepository.toggleFavorite(
        issueId: widget.issueId,
      );
      if (mounted) setState(() => _isFavorited = favorited);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed to toggle favorite: $e")),
        );
      }
    }
  }

  Future<void> _loadInternalNotes() async {
    try {
      final notes = await widget.actionsRepository.listInternalNotes(
        issueId: widget.issueId,
      );
      if (mounted) setState(() => _internalNotes = notes);
    } catch (_) {}
  }

  Future<void> _addInternalNote(String content) async {
    try {
      await widget.actionsRepository.createInternalNote(
        issueId: widget.issueId,
        content: content,
      );
      await _loadInternalNotes();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text("Failed to add note: $e")));
      }
    }
  }

  Future<void> _editIssue({
    String? subject,
    String? description,
    String? priority,
    String? dueDate,
    String? startDate,
    double? estimatedHours,
  }) async {
    await widget.actionsRepository.editIssue(
      issueId: widget.issueId,
      subject: subject,
      description: description,
      priority: priority,
      dueDate: dueDate,
      startDate: startDate,
      estimatedHours: estimatedHours,
    );
    await _load();
  }

  void _showEditDialog(BuildContext context, ThemeData theme) {
    final subjectCtrl = TextEditingController(text: _issue?.subject);
    final descCtrl = TextEditingController(text: _issue?.description);
    final priorityCtrl = TextEditingController(text: _issue?.priority ?? "");
    String? dueDate = _issue?.dueDate;
    String? startDate = _issue?.startDate;
    final estHoursCtrl = TextEditingController(
      text: _issue?.estimatedHours?.toString() ?? "",
    );

    showDialog<void>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text("Edit Issue"),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                TextField(
                  controller: subjectCtrl,
                  decoration: const InputDecoration(labelText: "Subject"),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: descCtrl,
                  decoration: const InputDecoration(labelText: "Description"),
                  maxLines: 3,
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: priorityCtrl,
                  decoration: const InputDecoration(labelText: "Priority"),
                ),
                const SizedBox(height: 8),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: TextButton.icon(
                        onPressed: () async {
                          final s = startDate;
                          final initDate = s != null
                              ? (DateTime.tryParse(s) ?? DateTime.now())
                              : DateTime.now();
                          final d = await showDatePicker(
                            context: ctx,
                            initialDate: initDate,
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (d != null) {
                            setDialogState(
                              () => startDate = d
                                  .toIso8601String()
                                  .split("T")
                                  .first,
                            );
                          }
                        },
                        icon: const Icon(Icons.calendar_today),
                        label: Text(startDate ?? "Start Date"),
                      ),
                    ),
                    Expanded(
                      child: TextButton.icon(
                        onPressed: () async {
                          final dd = dueDate;
                          final initDate = dd != null
                              ? (DateTime.tryParse(dd) ?? DateTime.now())
                              : DateTime.now();
                          final d = await showDatePicker(
                            context: ctx,
                            initialDate: initDate,
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (d != null) {
                            setDialogState(
                              () => dueDate = d
                                  .toIso8601String()
                                  .split("T")
                                  .first,
                            );
                          }
                        },
                        icon: const Icon(Icons.event),
                        label: Text(dueDate ?? "Due Date"),
                      ),
                    ),
                  ],
                ),
                TextField(
                  controller: estHoursCtrl,
                  decoration: const InputDecoration(
                    labelText: "Estimated Hours",
                  ),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text("Cancel"),
            ),
            ElevatedButton(
              onPressed: () {
                _editIssue(
                  subject: subjectCtrl.text.trim().isEmpty
                      ? null
                      : subjectCtrl.text.trim(),
                  description: descCtrl.text.isEmpty ? null : descCtrl.text,
                  priority: priorityCtrl.text.trim().isEmpty
                      ? null
                      : priorityCtrl.text.trim(),
                  dueDate: dueDate,
                  startDate: startDate,
                  estimatedHours: estHoursCtrl.text.isEmpty
                      ? null
                      : double.tryParse(estHoursCtrl.text),
                );
                Navigator.pop(ctx);
              },
              child: const Text("Save"),
            ),
          ],
        ),
      ),
    );
  }

  String _formatRelative(String isoDate) {
    final dt = DateTime.parse(isoDate);
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return "now";
    if (diff.inHours < 1) return "${diff.inMinutes}m ago";
    if (diff.inDays < 1) return "${diff.inHours}h ago";
    return "${diff.inDays}d ago";
  }

  void _showAddNoteDialog(BuildContext context) {
    final ctrl = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Add Internal Note"),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            labelText: "Note",
            hintText: "Private note visible only to your team",
          ),
          maxLines: 3,
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            onPressed: () {
              if (ctrl.text.trim().isNotEmpty) {
                _addInternalNote(ctrl.text.trim());
              }
              Navigator.pop(context);
            },
            child: const Text("Add"),
          ),
        ],
      ),
    );
  }

  Future<void> _aiSummarize() async {
    setState(() {
      _aiLoading = true;
      _aiError = null;
    });
    try {
      final summary = await widget.actionsRepository.summarizeIssue(
        issueId: widget.issueId,
      );
      if (mounted) setState(() => _aiSummary = summary);
    } catch (e) {
      if (mounted) setState(() => _aiError = "Summarize failed: $e");
    } finally {
      if (mounted) setState(() => _aiLoading = false);
    }
  }

  Future<void> _aiCategorize() async {
    setState(() {
      _aiLoading = true;
      _aiError = null;
    });
    try {
      final category = await widget.actionsRepository.categorizeIssue(
        issueId: widget.issueId,
      );
      if (mounted) setState(() => _aiCategory = category);
    } catch (e) {
      if (mounted) setState(() => _aiError = "Categorize failed: $e");
    } finally {
      if (mounted) setState(() => _aiLoading = false);
    }
  }

  Future<void> _postComment() async {
    if (_comment.text.trim().isEmpty) return;
    await widget.actionsRepository.postComment(
      issueId: widget.issueId,
      comment: _comment.text.trim(),
    );
    _comment.clear();
    await _load();
  }

  Future<void> _updateStatus(int statusId) async {
    setState(() => _statusError = null);
    try {
      await widget.actionsRepository.updateStatus(
        issueId: widget.issueId,
        statusId: statusId,
      );
      await _load();
    } catch (e) {
      setState(() => _statusError = e.toString());
    }
  }

  Future<void> _assignUser(int userId) async {
    setState(() => _assignError = null);
    try {
      await widget.actionsRepository.assignIssue(
        issueId: widget.issueId,
        userId: userId,
      );
      await _load();
    } catch (e) {
      setState(() => _assignError = e.toString());
    }
  }

  Future<void> _logTime() async {
    final hours = double.tryParse(_timeHours.text.trim());
    if (hours == null || hours <= 0 || _timeActivityId == null) return;
    setState(() => _timeLoading = true);
    try {
      await widget.actionsRepository.createTimeEntry(
        issueId: widget.issueId,
        hours: hours,
        activityId: _timeActivityId!,
        comment: _timeComment.text.trim().isEmpty
            ? null
            : _timeComment.text.trim(),
        spentOn: _timeSpentOn,
      );
      _timeHours.clear();
      _timeComment.clear();
      await _loadTimeEntries();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text("Failed to log time: $e")));
      }
    } finally {
      if (mounted) setState(() => _timeLoading = false);
    }
  }

  Future<void> _deleteTimeEntry(int entryId) async {
    try {
      await widget.actionsRepository.deleteTimeEntry(
        redmineTimeEntryId: entryId,
      );
      await _loadTimeEntries();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text("Failed to delete: $e")));
      }
    }
  }

  Future<void> _addGithubLink() async {
    if (_repo.text.trim().isEmpty) return;
    await widget.actionsRepository.addGithubLink(
      issueId: widget.issueId,
      repositoryFullName: _repo.text.trim(),
      githubIssueNumber: int.tryParse(_ghIssue.text.trim()),
    );
    _repo.clear();
    _ghIssue.clear();
    await _load();
  }

  Future<void> _addRelation() async {
    final target = int.tryParse(_relationIssue.text.trim());
    if (target == null || target <= 0) return;
    await widget.actionsRepository.addRelation(
      issueId: widget.issueId,
      issueToId: target,
      relationType: _relationType,
    );
    _relationIssue.clear();
    await _load();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    _repo.dispose();
    _ghIssue.dispose();
    _relationIssue.dispose();
    _timeHours.dispose();
    _timeComment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayId = _issue != null
        ? (_issue!.source == "local"
            ? "L${_issue!.localIssueNumber ?? "?"}"
            : "#${_issue!.redmineIssueId ?? widget.issueId}")
        : "#${widget.issueId}";
    return Scaffold(
      appBar: AppBar(
        title: Text("Issue $displayId"),
        actions: <Widget>[
          IconButton(
            onPressed: () => _showEditDialog(context, theme),
            icon: const Icon(Icons.edit),
            tooltip: "Edit Issue",
          ),
          IconButton(
            onPressed: _toggleFavorite,
            icon: Icon(_isFavorited ? Icons.star : Icons.star_border),
            tooltip: _isFavorited
                ? "Remove from favorites"
                : "Add to favorites",
          ),
        ],
      ),
      body: _loading
          ? _buildSkeleton(theme)
          : _error != null
          ? Center(
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            )
          : _issue == null
          ? const Center(child: Text("Issue not found"))
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: <Color>[
                          theme.colorScheme.primaryContainer,
                          theme.colorScheme.surfaceContainerHighest,
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: theme.colorScheme.outlineVariant.withValues(
                          alpha: 0.5,
                        ),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(
                                    _issue!.source == "local"
                                        ? "L${_issue!.localIssueNumber ?? "?"}"
                                        : "#${_issue!.redmineIssueId ?? "?"}",
                                    style: theme.textTheme.labelMedium?.copyWith(
                                      color: theme.colorScheme.onPrimaryContainer
                                          .withValues(alpha: 0.7),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _issue!.subject,
                                    style: theme.textTheme.titleLarge?.copyWith(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  if (_issue!.projectName != null &&
                                      _issue!.projectName!.trim().isNotEmpty)
                                    Text(
                                      _issue!.projectName!,
                                      style: theme.textTheme.bodyMedium?.copyWith(
                                        color: theme.colorScheme.onSurfaceVariant
                                            .withValues(alpha: 0.8),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color: _isDoneStatus(_issue!.statusName)
                                    ? theme.colorScheme.tertiaryContainer
                                    : theme.colorScheme.primaryContainer,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                _issue!.statusName,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: _isDoneStatus(_issue!.statusName)
                                      ? theme.colorScheme.onTertiaryContainer
                                      : theme.colorScheme.onPrimaryContainer,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: <Widget>[
                            if (_issue!.priority != null)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: _isHighPriority(_issue!.priority)
                                      ? theme.colorScheme.errorContainer
                                      : theme.colorScheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  _issue!.priority!,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: _isHighPriority(_issue!.priority)
                                        ? theme.colorScheme.onErrorContainer
                                        : theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                            if (_issue!.assignedToName != null)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.secondaryContainer,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: <Widget>[
                                    Icon(
                                      Icons.person_outline,
                                      size: 12,
                                      color: theme.colorScheme.onSecondaryContainer,
                                    ),
                                    const SizedBox(width: 3),
                                    Text(
                                      _issue!.assignedToName!,
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: theme.colorScheme.onSecondaryContainer,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            if (_issue!.dueDate != null)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: <Widget>[
                                    Icon(
                                      Icons.calendar_today,
                                      size: 10,
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                    const SizedBox(width: 3),
                                    Text(
                                      _formatDateShort(_issue!.dueDate!),
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: theme.colorScheme.onSurfaceVariant,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  // Parent breadcrumbs inline
                  if (_issue!.parentIssueLabel != null &&
                      _issue!.parentIssueId != null)
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: theme.colorScheme.outlineVariant.withValues(
                            alpha: 0.3,
                          ),
                        ),
                      ),
                      child: Row(
                        children: <Widget>[
                          Icon(
                            Icons.arrow_upward,
                            size: 14,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            "Parent: ",
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              _issue!.parentIssueLabel!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: <Widget>[
                      OutlinedButton.icon(
                        onPressed: () {
                          setState(() {
                            _expandOverview = true;
                            _expandDescription = true;
                            _expandStatus = true;
                            _expandAssign = true;
                            _expandTime = true;
                            _expandAi = true;
                            _expandAllowed = true;
                            _expandComment = true;
                            _expandGithub = true;
                            _expandInternalNotes = true;
                            _expandAttachments = true;
                            _expandRelations = true;
                          });
                        },
                        icon: const Icon(Icons.unfold_more, size: 18),
                        label: const Text("Expand all"),
                      ),
                      OutlinedButton.icon(
                        onPressed: () {
                          setState(() {
                            _expandOverview = false;
                            _expandDescription = false;
                            _expandStatus = false;
                            _expandAssign = false;
                            _expandTime = false;
                            _expandAi = false;
                            _expandAllowed = false;
                            _expandComment = false;
                            _expandGithub = false;
                            _expandInternalNotes = false;
                            _expandAttachments = false;
                            _expandRelations = false;
                          });
                        },
                        icon: const Icon(Icons.unfold_less, size: 18),
                        label: const Text("Collapse all"),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Card(
                    clipBehavior: Clip.antiAlias,
                    margin: EdgeInsets.zero,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                  _sectionCard(
                    context: context,
                    sectionId: "overview",
                    title: "Overview",
                    expanded: _expandOverview,
                    onExpandedChanged: (value) =>
                        setState(() => _expandOverview = value),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: <Widget>[
                            Chip(
                              label: Text(_issue!.statusName),
                              backgroundColor:
                                  theme.colorScheme.primaryContainer,
                            ),
                            Chip(
                              label: Text(_issue!.priority ?? "No priority"),
                              side: BorderSide(
                                color: theme.colorScheme.outlineVariant,
                              ),
                            ),
                            if (_issue!.children.isNotEmpty)
                              Chip(
                                label: Text(
                                  "Children ${_issue!.children.length}",
                                ),
                                side: BorderSide(
                                  color: theme.colorScheme.outlineVariant,
                                ),
                              ),
                            if (_issue!.dueDate != null)
                              Chip(
                                label: Text("Due ${_issue!.dueDate!}"),
                                side: BorderSide(
                                  color: theme.colorScheme.outlineVariant,
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (_breadcrumbs.isNotEmpty)
                    Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              "Parent Issues",
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: _breadcrumbs.map((bc) {
                                final id = bc["id"] as int;
                                final subject = bc["subject"] as String;
                                return ActionChip(
                                  avatar: const Icon(
                                    Icons.arrow_upward,
                                    size: 14,
                                  ),
                                  label: Text(
                                    "#$id $subject",
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  onPressed: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute<void>(
                                        builder: (_) => IssueDetailScreen(
                                          issueId: "$id",
                                          issuesRepository:
                                              widget.issuesRepository,
                                          actionsRepository:
                                              widget.actionsRepository,
                                        ),
                                      ),
                                    );
                                  },
                                );
                              }).toList(),
                            ),
                          ],
                        ),
                      ),
                    ),
                  _sectionCard(
                    context: context,
                    sectionId: "description",
                    title: "Description",
                    expanded: _expandDescription,
                    onExpandedChanged: (value) =>
                        setState(() => _expandDescription = value),
                    child: MarkdownBody(
                      data: _normalizeIssueDescription(_issue!.description),
                      selectable: true,
                      extensionSet: md.ExtensionSet.gitHubWeb,
                      styleSheet: _markdownStyle(context),
                      builders: <String, MarkdownElementBuilder>{
                        "pre": _CodeBlockBuilder(theme: theme),
                      },
                      onTapLink: (text, href, title) => _openMarkdownLink(href),
                    ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "status",
                    title: "Change Status",
                    expanded: _expandStatus,
                    onExpandedChanged: (value) =>
                        setState(() => _expandStatus = value),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          "Current: ${_issue!.statusName}",
                          style: theme.textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 8),
                        if (_statusError != null)
                          Text(
                            _statusError!,
                            style: TextStyle(color: theme.colorScheme.error),
                          ),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: _issue!.allowedStatuses.map((s) {
                            final isCurrent = s.name == _issue!.statusName;
                            return ChoiceChip(
                              label: Text(s.name),
                              selected: isCurrent,
                              onSelected: isCurrent
                                  ? null
                                  : (_) => _updateStatus(s.id),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "assign",
                    title: "Assign",
                    expanded: _expandAssign,
                    onExpandedChanged: (value) =>
                        setState(() => _expandAssign = value),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          "Current: ${_issue!.assignedToName ?? "Unassigned"}",
                          style: theme.textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 8),
                        if (_assignError != null)
                          Text(
                            _assignError!,
                            style: TextStyle(color: theme.colorScheme.error),
                          ),
                        if (_assignableUsers.isEmpty)
                          const Text("No assignable users available.")
                        else
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: _assignableUsers.map((u) {
                              final isCurrent =
                                  _issue!.assignedToName == u.name;
                              return ChoiceChip(
                                label: Text(u.name),
                                selected: isCurrent,
                                onSelected: isCurrent
                                    ? null
                                    : (_) => _assignUser(u.id),
                              );
                            }).toList(),
                          ),
                      ],
                    ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "time",
                    title: "Time Tracking",
                    expanded: _expandTime,
                    onExpandedChanged: (value) =>
                        setState(() => _expandTime = value),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainerLow,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            children: <Widget>[
                              TextField(
                                controller: _timeHours,
                                decoration: const InputDecoration(
                                  labelText: "Hours",
                                  isDense: true,
                                  prefixIcon: Icon(Icons.timer, size: 20),
                                ),
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
                              ),
                              const SizedBox(height: 8),
                              DropdownButtonFormField<int>(
                                key: ValueKey<int?>(_timeActivityId),
                                initialValue: _timeActivityId,
                                isDense: true,
                                decoration: const InputDecoration(
                                  labelText: "Activity",
                                  isDense: true,
                                ),
                                items: _activities
                                    .map(
                                      (a) => DropdownMenuItem<int>(
                                        value: a["id"] as int,
                                        child: Text(
                                          a["name"] as String,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    )
                                    .toList(),
                                onChanged: (v) =>
                                    setState(() => _timeActivityId = v),
                              ),
                              const SizedBox(height: 8),
                              TextField(
                                controller: _timeComment,
                                decoration: const InputDecoration(
                                  labelText: "Comment (optional)",
                                  isDense: true,
                                ),
                                maxLines: 2,
                              ),
                              const SizedBox(height: 10),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton.icon(
                                  onPressed: _timeLoading ? null : _logTime,
                                  icon: _timeLoading
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(Icons.add_circle, size: 18),
                                  label: const Text("Log Time"),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_timeEntries.isNotEmpty) ...<Widget>[
                          const SizedBox(height: 12),
                          Text(
                            "Recent Entries (${_timeEntries.length})",
                            style: theme.textTheme.labelMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 6),
                          ..._timeEntries
                              .take(10)
                              .map(
                                (entry) => Container(
                                  margin: const EdgeInsets.only(bottom: 6),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 8,
                                  ),
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.surfaceContainerHighest,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    children: <Widget>[
                                      Container(
                                        padding: const EdgeInsets.all(6),
                                        decoration: BoxDecoration(
                                          color: theme.colorScheme.primaryContainer,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          "${entry.hours}h",
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                            color: theme.colorScheme.onPrimaryContainer,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: <Widget>[
                                            Text(
                                              entry.activityName ?? "No activity",
                                              style: theme.textTheme.bodySmall?.copyWith(
                                                fontWeight: FontWeight.w600,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            if (entry.comments != null)
                                              Text(
                                                entry.comments!,
                                                style: theme.textTheme.bodySmall?.copyWith(
                                                  color: theme.colorScheme.onSurfaceVariant,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            Text(
                                              entry.spentOn,
                                              style: theme.textTheme.bodySmall?.copyWith(
                                                color: theme.colorScheme.onSurfaceVariant,
                                                fontSize: 10,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (entry.redmineTimeEntryId != null)
                                        IconButton(
                                          icon: const Icon(
                                            Icons.delete_outline,
                                            size: 18,
                                          ),
                                          onPressed: () => _deleteTimeEntry(
                                            entry.redmineTimeEntryId!,
                                          ),
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(
                                            minWidth: 32,
                                            minHeight: 32,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                        ],
                      ],
                    ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "ai",
                    title: "AI Insights",
                    expanded: _expandAi,
                    onExpandedChanged: (value) =>
                        setState(() => _expandAi = value),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        if (_aiError != null)
                          Text(
                            _aiError!,
                            style: TextStyle(color: theme.colorScheme.error),
                          ),
                        Row(
                          children: <Widget>[
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: _aiLoading ? null : _aiSummarize,
                                icon: _aiLoading && _aiSummary == null
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.summarize, size: 18),
                                label: const Text("Summarize"),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _aiLoading ? null : _aiCategorize,
                                icon: _aiLoading && _aiCategory == null
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.label, size: 18),
                                label: const Text("Categorize"),
                              ),
                            ),
                          ],
                        ),
                        if (_aiSummary != null) ...<Widget>[
                          const SizedBox(height: 12),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerLow,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: theme.colorScheme.outlineVariant
                                    .withValues(alpha: 0.3),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Row(
                                  children: <Widget>[
                                    Icon(
                                      Icons.auto_awesome,
                                      size: 16,
                                      color: theme.colorScheme.primary,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      "Summary",
                                      style: theme.textTheme.labelLarge?.copyWith(
                                        color: theme.colorScheme.primary,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _aiSummary!.summary,
                                  style: theme.textTheme.bodyMedium,
                                ),
                                if (_aiSummary!.keyPoints.isNotEmpty) ...<Widget>[
                                  const SizedBox(height: 8),
                                  Text(
                                    "Key Points",
                                    style: theme.textTheme.labelMedium?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  ..._aiSummary!.keyPoints.map(
                                    (p) => Padding(
                                      padding: const EdgeInsets.only(
                                        left: 12,
                                        top: 2,
                                      ),
                                      child: Text(
                                        "• $p",
                                        style: theme.textTheme.bodySmall,
                                      ),
                                    ),
                                  ),
                                ],
                                if (_aiSummary!.actionItems.isNotEmpty) ...<Widget>[
                                  const SizedBox(height: 8),
                                  Text(
                                    "Action Items",
                                    style: theme.textTheme.labelMedium?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  ..._aiSummary!.actionItems.map(
                                    (a) => Padding(
                                      padding: const EdgeInsets.only(
                                        left: 12,
                                        top: 2,
                                      ),
                                      child: Text(
                                        "□ $a",
                                        style: theme.textTheme.bodySmall,
                                      ),
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 8),
                                Text(
                                  "Confidence: ${(_aiSummary!.confidence * 100).toInt()}% • ${_aiSummary!.modelUsed}",
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        if (_aiCategory != null) ...<Widget>[
                          const SizedBox(height: 12),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerLow,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: theme.colorScheme.outlineVariant
                                    .withValues(alpha: 0.3),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Row(
                                  children: <Widget>[
                                    Icon(
                                      Icons.label_outline,
                                      size: 16,
                                      color: theme.colorScheme.secondary,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      "Categories",
                                      style: theme.textTheme.labelLarge?.copyWith(
                                        color: theme.colorScheme.secondary,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                if (_aiCategory!.suggestedPriority != null)
                                  Text(
                                    "Priority: ${_aiCategory!.suggestedPriority!["name"]}",
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                if (_aiCategory!.suggestedCategory != null)
                                  Text(
                                    "Category: ${_aiCategory!.suggestedCategory!["name"]}",
                                    style: theme.textTheme.bodyMedium,
                                  ),
                                if (_aiCategory!.reasoning.isNotEmpty) ...<Widget>[
                                  const SizedBox(height: 6),
                                  Text(
                                    _aiCategory!.reasoning,
                                    style: theme.textTheme.bodySmall,
                                  ),
                                ],
                                const SizedBox(height: 6),
                                Text(
                                  _aiCategory!.modelUsed,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "internal-notes",
                    title: "Internal Notes",
                    expanded: _expandInternalNotes,
                    onExpandedChanged: (value) {
                      setState(() => _expandInternalNotes = value);
                      if (value && _internalNotes.isEmpty) {
                        _loadInternalNotes();
                      }
                    },
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        ElevatedButton.icon(
                          onPressed: () => _showAddNoteDialog(context),
                          icon: const Icon(Icons.add_comment, size: 18),
                          label: const Text("Add Note"),
                        ),
                        if (_internalNotes.isNotEmpty) ...<Widget>[
                          const SizedBox(height: 8),
                          ..._internalNotes.map(
                            (note) => Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Row(
                                    children: <Widget>[
                                      Text(
                                        note.authorName,
                                        style: theme.textTheme.labelSmall
                                            ?.copyWith(
                                              fontWeight: FontWeight.bold,
                                            ),
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        _formatRelative(note.createdAt),
                                        style: theme.textTheme.labelSmall,
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    note.content,
                                    style: theme.textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "allowed",
                    title: "Allowed Statuses",
                    expanded: _expandAllowed,
                    onExpandedChanged: (value) =>
                        setState(() => _expandAllowed = value),
                    child: _issue!.allowedStatuses.isEmpty
                        ? const Text("No transition data from server.")
                        : Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: _issue!.allowedStatuses
                                .map(
                                  (s) => Chip(
                                    label: Text(s.name),
                                    visualDensity: VisualDensity.compact,
                                    side: BorderSide(
                                      color: theme.colorScheme.outlineVariant,
                                    ),
                                  ),
                                )
                                .toList(),
                          ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "comment",
                    title: "Add Comment",
                    expanded: _expandComment,
                    onExpandedChanged: (value) =>
                        setState(() => _expandComment = value),
                    child: Column(
                      children: <Widget>[
                        TextField(
                          controller: _comment,
                          decoration: const InputDecoration(
                            labelText: "Comment",
                          ),
                          minLines: 2,
                          maxLines: 4,
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _postComment,
                            child: const Text("Post Comment"),
                          ),
                        ),
                      ],
                    ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "github",
                    title: "GitHub Links",
                    expanded: _expandGithub,
                    onExpandedChanged: (value) =>
                        setState(() => _expandGithub = value),
                    child: Column(
                      children: <Widget>[
                        TextField(
                          controller: _repo,
                          decoration: const InputDecoration(
                            labelText: "Repository (owner/repo)",
                          ),
                        ),
                        TextField(
                          controller: _ghIssue,
                          decoration: const InputDecoration(
                            labelText: "GitHub Issue #",
                          ),
                          keyboardType: TextInputType.number,
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _addGithubLink,
                            child: const Text("Add GitHub Link"),
                          ),
                        ),
                        const SizedBox(height: 8),
                        if (_issue!.githubLinks.isEmpty)
                          const Align(
                            alignment: Alignment.centerLeft,
                            child: Text("No GitHub links."),
                          )
                        else
                          ..._issue!.githubLinks.map(
                            (link) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              onTap: () => _openGithubLink(link),
                              leading: const Icon(Icons.open_in_new),
                              title: Text(
                                _githubLinkDisplayTitle(link),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Text(
                                link.url.trim().isNotEmpty
                                    ? link.url
                                    : link.repositoryFullName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              trailing: IconButton(
                                icon: const Icon(Icons.delete_outline),
                                onPressed: () async {
                                  await widget.actionsRepository
                                      .removeGithubLink(
                                        issueId: widget.issueId,
                                        linkId: link.id,
                                      );
                                  await _load();
                                },
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "attachments",
                    title: "Attachments",
                    expanded: _expandAttachments,
                    onExpandedChanged: (value) {
                      setState(() => _expandAttachments = value);
                      if (value &&
                          !_attachmentHeaders.containsKey("Authorization")) {
                        _loadAttachmentHeaders();
                      }
                    },
                    child: _issue!.attachments.isEmpty
                        ? const Text("No attachments.")
                        : Column(
                            children: _issue!.attachments
                                .map(
                                  (attachment) => ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: <Widget>[
                                        Row(
                                          children: <Widget>[
                                            const Icon(Icons.attach_file),
                                            const SizedBox(width: 6),
                                            Expanded(
                                              child: Text(
                                                attachment.filename,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          "${(attachment.filesize / 1024).toStringAsFixed(1)} KB"
                                          "${attachment.author != null ? " • ${attachment.author}" : ""}",
                                        ),
                                        if (_isImageAttachment(
                                          attachment,
                                        )) ...<Widget>[
                                          const SizedBox(height: 8),
                                          if (!_attachmentHeaders.containsKey(
                                            "Authorization",
                                          ))
                                            Container(
                                              height: 80,
                                              alignment: Alignment.center,
                                              color: theme
                                                  .colorScheme
                                                  .surfaceContainerHighest,
                                              child: const Row(
                                                mainAxisSize: MainAxisSize.min,
                                                children: <Widget>[
                                                  SizedBox(
                                                    width: 16,
                                                    height: 16,
                                                    child:
                                                        CircularProgressIndicator(
                                                          strokeWidth: 2,
                                                        ),
                                                  ),
                                                  SizedBox(width: 8),
                                                  Text(
                                                    "Loading image preview...",
                                                  ),
                                                ],
                                              ),
                                            )
                                          else
                                            ClipRRect(
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                              child: Image.network(
                                                _attachmentUrl(attachment),
                                                key: ValueKey<String>(
                                                  "att-${attachment.redmineAttachmentId}-${_attachmentHeaders["Authorization"]}",
                                                ),
                                                headers: _attachmentHeaders,
                                                height: 180,
                                                width: double.infinity,
                                                fit: BoxFit.cover,
                                                errorBuilder:
                                                    (
                                                      context,
                                                      error,
                                                      stackTrace,
                                                    ) {
                                                      return Container(
                                                        height: 80,
                                                        alignment:
                                                            Alignment.center,
                                                        color: theme
                                                            .colorScheme
                                                            .surfaceContainerHighest,
                                                        child: const Text(
                                                          "Image preview unavailable",
                                                        ),
                                                      );
                                                    },
                                              ),
                                            ),
                                        ],
                                        if (_isTextDocAttachment(
                                          attachment,
                                        )) ...<Widget>[
                                          const SizedBox(height: 8),
                                          FutureBuilder<String?>(
                                            future: widget.actionsRepository
                                                .attachmentTextPreview(
                                                  issueId:
                                                      widget.issueId,
                                                  redmineAttachmentId:
                                                      attachment
                                                          .redmineAttachmentId,
                                                  maxChars: 420,
                                                ),
                                            builder: (context, snapshot) {
                                              if (snapshot.connectionState ==
                                                  ConnectionState.waiting) {
                                                return const SizedBox(
                                                  height: 28,
                                                  child: Align(
                                                    alignment:
                                                        Alignment.centerLeft,
                                                    child: Text(
                                                      "Loading text preview...",
                                                    ),
                                                  ),
                                                );
                                              }
                                              final preview = snapshot.data
                                                  ?.trim();
                                              if (preview == null ||
                                                  preview.isEmpty) {
                                                return const Text(
                                                  "Text preview unavailable",
                                                );
                                              }
                                              return Container(
                                                width: double.infinity,
                                                padding: const EdgeInsets.all(
                                                  10,
                                                ),
                                                decoration: BoxDecoration(
                                                  color: theme
                                                      .colorScheme
                                                      .surfaceContainerHighest,
                                                  borderRadius:
                                                      BorderRadius.circular(8),
                                                  border: Border.all(
                                                    color: theme
                                                        .colorScheme
                                                        .outlineVariant,
                                                  ),
                                                ),
                                                child: Text(
                                                  preview,
                                                  maxLines: 7,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: theme
                                                      .textTheme
                                                      .bodySmall
                                                      ?.copyWith(
                                                        fontFamily: "monospace",
                                                        height: 1.3,
                                                      ),
                                                ),
                                              );
                                            },
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                )
                                .toList(),
                          ),
                  ),
                  _sectionCard(
                    context: context,
                    sectionId: "relations",
                    title: "Relations",
                    expanded: _expandRelations,
                    onExpandedChanged: (value) =>
                        setState(() => _expandRelations = value),
                    child: Column(
                      children: <Widget>[
                        TextField(
                          controller: _relationIssue,
                          decoration: const InputDecoration(
                            labelText: "Related issue #",
                          ),
                          keyboardType: TextInputType.number,
                        ),
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: DropdownButton<String>(
                            value: _relationType,
                            items: const <DropdownMenuItem<String>>[
                              DropdownMenuItem<String>(
                                value: "relates",
                                child: Text("relates"),
                              ),
                              DropdownMenuItem<String>(
                                value: "duplicated",
                                child: Text("duplicated"),
                              ),
                              DropdownMenuItem<String>(
                                value: "blocks",
                                child: Text("blocks"),
                              ),
                              DropdownMenuItem<String>(
                                value: "blocked",
                                child: Text("blocked"),
                              ),
                              DropdownMenuItem<String>(
                                value: "precedes",
                                child: Text("precedes"),
                              ),
                              DropdownMenuItem<String>(
                                value: "follows",
                                child: Text("follows"),
                              ),
                              DropdownMenuItem<String>(
                                value: "duplicates",
                                child: Text("duplicates"),
                              ),
                              DropdownMenuItem<String>(
                                value: "copied_to",
                                child: Text("copied_to"),
                              ),
                              DropdownMenuItem<String>(
                                value: "copied_from",
                                child: Text("copied_from"),
                              ),
                            ],
                            onChanged: (value) {
                              if (value == null) return;
                              setState(() => _relationType = value);
                            },
                          ),
                        ),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _addRelation,
                            child: const Text("Add Relation"),
                          ),
                        ),
                        const SizedBox(height: 8),
                        if (_issue!.relations.isEmpty)
                          const Align(
                            alignment: Alignment.centerLeft,
                            child: Text("No relations."),
                          )
                        else
                          ..._issue!.relations.map(
                            (relation) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                "${relation.relationType} #${relation.targetIssueId}",
                              ),
                              subtitle: relation.delay == null
                                  ? null
                                  : Text("Delay: ${relation.delay}"),
                              trailing: IconButton(
                                icon: const Icon(Icons.delete_outline),
                                onPressed: () async {
                                  await widget.actionsRepository.removeRelation(
                                    issueId: widget.issueId,
                                    relationId: relation.redmineRelationId,
                                  );
                                  await _load();
                                },
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  ],
                ),
              ),
                ],
              ),
            ),
    );
  }
}
