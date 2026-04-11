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
    final match = RegExp(r"(?:^|\s)language-([A-Za-z0-9_+\-]+)(?:\s|$)").firstMatch(className);
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
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Pair with NRCC")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: <Widget>[
            TextField(
              controller: _baseUrl,
              decoration: const InputDecoration(labelText: "Redmine Base URL"),
            ),
            TextField(
              controller: _apiKey,
              decoration: const InputDecoration(labelText: "Redmine API Key"),
            ),
            TextField(
              controller: _deviceName,
              decoration: const InputDecoration(labelText: "Device Name"),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
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
              child: Text(_loading ? "Pairing..." : "Pair"),
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ],
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
  List<Issue> _issues = <Issue>[];
  bool _loading = false;
  String? _error;

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final issues = await widget.issuesRepository.listIssues(
        search: _search.text.trim().isEmpty ? null : _search.text.trim(),
        searchMode: _searchMode,
      );
      setState(() => _issues = issues);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text("My Issues"),
        actions: <Widget>[
          IconButton(
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
            tooltip: "Logout",
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: TextField(
                    controller: _search,
                    decoration: const InputDecoration(labelText: "Search"),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _loading ? null : _load,
                  child: const Text("Load"),
                ),
                const SizedBox(width: 8),
                DropdownButton<String>(
                  value: _searchMode,
                  items: const <DropdownMenuItem<String>>[
                    DropdownMenuItem<String>(value: "local", child: Text("Local")),
                    DropdownMenuItem<String>(value: "hybrid", child: Text("Hybrid")),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() => _searchMode = value);
                    _load();
                  },
                ),
              ],
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (_loading) const LinearProgressIndicator(),
          Expanded(
            child: ListView.builder(
              itemCount: _issues.length,
              itemBuilder: (context, index) {
                final issue = _issues[index];
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    title: Text(
                      "#${issue.redmineIssueId} ${issue.subject}",
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: <Widget>[
                          Chip(
                            label: Text(issue.statusName),
                            visualDensity: VisualDensity.compact,
                            side: BorderSide(color: theme.colorScheme.outlineVariant),
                          ),
                          Chip(
                            label: Text(issue.priority ?? "No priority"),
                            visualDensity: VisualDensity.compact,
                            side: BorderSide(color: theme.colorScheme.outlineVariant),
                          ),
                          Chip(
                            label: Text("GH ${issue.githubLinks.length}"),
                            visualDensity: VisualDensity.compact,
                            side: BorderSide(color: theme.colorScheme.outlineVariant),
                          ),
                        ],
                      ),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => IssueDetailScreen(
                            issueId: issue.redmineIssueId,
                            issuesRepository: widget.issuesRepository,
                            actionsRepository: widget.actionsRepository,
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class IssueDetailScreen extends StatefulWidget {
  final int issueId;
  final IssuesRepository issuesRepository;
  final IssueActionsRepository actionsRepository;

  const IssueDetailScreen({
    super.key,
    required this.issueId,
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
  bool _expandAllowed = false;
  bool _expandComment = false;
  bool _expandGithub = false;
  bool _expandAttachments = false;
  bool _expandRelations = false;

  String _normalizeIssueDescription(String? input) {
    if (input == null || input.trim().isEmpty) {
      return "(No description)";
    }

    var out = input;

    // Strip Redmine TOC/notextile macros that do not map to flutter_markdown.
    out = out
        .replaceAll(RegExp(r"^\s*\{\{>?toc(?:\([^)]*\))?\}\}\s*$", multiLine: true), "")
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
        final title = (m.group(1) ?? "Details").trim().isEmpty ? "Details" : (m.group(1) ?? "Details").trim();
        final body = (m.group(2) ?? "").trim();
        if (body.isEmpty) return "> **$title**";
        final quoted = body.split("\n").map((line) => line.trim().isEmpty ? ">" : "> $line").join("\n");
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
        .replaceAllMapped(RegExp(r"(^|[^\w`])@([^\n@]+?)@(?=[^\w`]|$)"), (m) => "${m.group(1)}`${m.group(2)}`")
        .replaceAllMapped(RegExp(r"!((?:https?:\/\/|\/)[^\s!]+)!"), (m) => "![](${m.group(1)})");

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
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        key: ValueKey<String>("$sectionId:$expanded"),
        tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        initiallyExpanded: expanded,
        onExpansionChanged: onExpandedChanged,
        title: Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        children: <Widget>[
          child,
        ],
      ),
    );
  }

  Future<void> _openMarkdownLink(String? href) async {
    if (href == null || href.trim().isEmpty) return;
    final uri = Uri.tryParse(href.trim());
    if (uri == null) return;
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Could not open link: $href")),
      );
    }
  }

  bool _isImageAttachment(IssueAttachment attachment) {
    final type = (attachment.contentType ?? "").toLowerCase();
    if (type.startsWith("image/")) return true;
    final file = attachment.filename.toLowerCase();
    return file.endsWith(".png")
        || file.endsWith(".jpg")
        || file.endsWith(".jpeg")
        || file.endsWith(".gif")
        || file.endsWith(".webp")
        || file.endsWith(".bmp");
  }

  bool _isTextDocAttachment(IssueAttachment attachment) {
    final type = (attachment.contentType ?? "").toLowerCase();
    if (type.startsWith("text/")) return true;
    return type == "application/json"
        || type == "application/xml"
        || type == "application/yaml"
        || type == "application/x-yaml"
        || type == "application/javascript";
  }

  String _attachmentUrl(IssueAttachment attachment) {
    return widget.actionsRepository.attachmentPreviewUrl(
      redmineIssueId: widget.issueId,
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
      if (parsed != null && (parsed.scheme == "http" || parsed.scheme == "https")) {
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
        SnackBar(content: Text("Could not open GitHub link: ${uri.toString()}")),
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
      blockquotePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      blockquoteDecoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        border: Border(
          left: BorderSide(color: theme.colorScheme.primary, width: 3),
        ),
      ),
      tableHead: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      tableBody: textTheme.bodyMedium,
      tableBorder: TableBorder.all(color: theme.colorScheme.outlineVariant),
      tableCellsPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
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
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _postComment() async {
    if (_comment.text.trim().isEmpty) return;
    await widget.actionsRepository.postComment(
      redmineIssueId: widget.issueId,
      comment: _comment.text.trim(),
    );
    _comment.clear();
    await _load();
  }

  Future<void> _addGithubLink() async {
    if (_repo.text.trim().isEmpty) return;
    await widget.actionsRepository.addGithubLink(
      redmineIssueId: widget.issueId,
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
      redmineIssueId: widget.issueId,
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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text("Issue #${widget.issueId}")),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
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
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: <Widget>[
                              OutlinedButton.icon(
                                onPressed: () {
                                  setState(() {
                                    _expandOverview = true;
                                    _expandDescription = true;
                                    _expandAllowed = true;
                                    _expandComment = true;
                                    _expandGithub = true;
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
                                    _expandAllowed = false;
                                    _expandComment = false;
                                    _expandGithub = false;
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
                          _sectionCard(
                            context: context,
                            sectionId: "overview",
                            title: "Overview",
                            expanded: _expandOverview,
                            onExpandedChanged: (value) => setState(() => _expandOverview = value),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(_issue!.subject, style: theme.textTheme.headlineSmall),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: <Widget>[
                                    Chip(
                                      label: Text(_issue!.statusName),
                                      backgroundColor: theme.colorScheme.primaryContainer,
                                    ),
                                    Chip(
                                      label: Text(_issue!.priority ?? "No priority"),
                                      side: BorderSide(color: theme.colorScheme.outlineVariant),
                                    ),
                                    if (_issue!.children.isNotEmpty)
                                      Chip(
                                        label: Text("Children ${_issue!.children.length}"),
                                        side: BorderSide(color: theme.colorScheme.outlineVariant),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          _sectionCard(
                            context: context,
                            sectionId: "description",
                            title: "Description",
                            expanded: _expandDescription,
                            onExpandedChanged: (value) => setState(() => _expandDescription = value),
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
                            sectionId: "allowed",
                            title: "Allowed Statuses",
                            expanded: _expandAllowed,
                            onExpandedChanged: (value) => setState(() => _expandAllowed = value),
                            child: _issue!.allowedStatuses.isEmpty
                                ? const Text("No transition data from server.")
                                : Wrap(
                                    spacing: 6,
                                    runSpacing: 6,
                                    children: _issue!.allowedStatuses
                                        .map((s) => Chip(
                                              label: Text(s.name),
                                              visualDensity: VisualDensity.compact,
                                              side: BorderSide(color: theme.colorScheme.outlineVariant),
                                            ))
                                        .toList(),
                                  ),
                          ),
                          _sectionCard(
                            context: context,
                            sectionId: "comment",
                            title: "Add Comment",
                            expanded: _expandComment,
                            onExpandedChanged: (value) => setState(() => _expandComment = value),
                            child: Column(
                              children: <Widget>[
                                TextField(
                                  controller: _comment,
                                  decoration: const InputDecoration(labelText: "Comment"),
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
                            onExpandedChanged: (value) => setState(() => _expandGithub = value),
                            child: Column(
                              children: <Widget>[
                                TextField(
                                  controller: _repo,
                                  decoration: const InputDecoration(labelText: "Repository (owner/repo)"),
                                ),
                                TextField(
                                  controller: _ghIssue,
                                  decoration: const InputDecoration(labelText: "GitHub Issue #"),
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
                                        link.url.trim().isNotEmpty ? link.url : link.repositoryFullName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      trailing: IconButton(
                                        icon: const Icon(Icons.delete_outline),
                                        onPressed: () async {
                                          await widget.actionsRepository.removeGithubLink(
                                            redmineIssueId: widget.issueId,
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
                            onExpandedChanged: (value) => setState(() => _expandAttachments = value),
                            child: _issue!.attachments.isEmpty
                                ? const Text("No attachments.")
                                : Column(
                                    children: _issue!.attachments
                                        .map(
                                          (attachment) => ListTile(
                                            contentPadding: EdgeInsets.zero,
                                            title: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
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
                                                if (_isImageAttachment(attachment)) ...<Widget>[
                                                  const SizedBox(height: 8),
                                                  ClipRRect(
                                                    borderRadius: BorderRadius.circular(8),
                                                    child: Image.network(
                                                      _attachmentUrl(attachment),
                                                      headers: _attachmentHeaders,
                                                      height: 180,
                                                      width: double.infinity,
                                                      fit: BoxFit.cover,
                                                      errorBuilder: (context, error, stackTrace) {
                                                        return Container(
                                                          height: 80,
                                                          alignment: Alignment.center,
                                                          color: theme.colorScheme.surfaceContainerHighest,
                                                          child: const Text("Image preview unavailable"),
                                                        );
                                                      },
                                                    ),
                                                  ),
                                                ],
                                                if (_isTextDocAttachment(attachment)) ...<Widget>[
                                                  const SizedBox(height: 8),
                                                  FutureBuilder<String?>(
                                                    future: widget.actionsRepository.attachmentTextPreview(
                                                      redmineIssueId: widget.issueId,
                                                      redmineAttachmentId: attachment.redmineAttachmentId,
                                                      maxChars: 420,
                                                    ),
                                                    builder: (context, snapshot) {
                                                      if (snapshot.connectionState == ConnectionState.waiting) {
                                                        return const SizedBox(
                                                          height: 28,
                                                          child: Align(
                                                            alignment: Alignment.centerLeft,
                                                            child: Text("Loading text preview..."),
                                                          ),
                                                        );
                                                      }
                                                      final preview = snapshot.data?.trim();
                                                      if (preview == null || preview.isEmpty) {
                                                        return const Text("Text preview unavailable");
                                                      }
                                                      return Container(
                                                        width: double.infinity,
                                                        padding: const EdgeInsets.all(10),
                                                        decoration: BoxDecoration(
                                                          color: theme.colorScheme.surfaceContainerHighest,
                                                          borderRadius: BorderRadius.circular(8),
                                                          border: Border.all(color: theme.colorScheme.outlineVariant),
                                                        ),
                                                        child: Text(
                                                          preview,
                                                          maxLines: 7,
                                                          overflow: TextOverflow.ellipsis,
                                                          style: theme.textTheme.bodySmall?.copyWith(
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
                            onExpandedChanged: (value) => setState(() => _expandRelations = value),
                            child: Column(
                              children: <Widget>[
                                TextField(
                                  controller: _relationIssue,
                                  decoration: const InputDecoration(labelText: "Related issue #"),
                                  keyboardType: TextInputType.number,
                                ),
                                const SizedBox(height: 8),
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: DropdownButton<String>(
                                    value: _relationType,
                                    items: const <DropdownMenuItem<String>>[
                                      DropdownMenuItem<String>(value: "relates", child: Text("relates")),
                                      DropdownMenuItem<String>(value: "duplicated", child: Text("duplicated")),
                                      DropdownMenuItem<String>(value: "blocks", child: Text("blocks")),
                                      DropdownMenuItem<String>(value: "blocked", child: Text("blocked")),
                                      DropdownMenuItem<String>(value: "precedes", child: Text("precedes")),
                                      DropdownMenuItem<String>(value: "follows", child: Text("follows")),
                                      DropdownMenuItem<String>(value: "duplicates", child: Text("duplicates")),
                                      DropdownMenuItem<String>(value: "copied_to", child: Text("copied_to")),
                                      DropdownMenuItem<String>(value: "copied_from", child: Text("copied_from")),
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
                                      title: Text("${relation.relationType} #${relation.targetIssueId}"),
                                      subtitle: relation.delay == null ? null : Text("Delay: ${relation.delay}"),
                                      trailing: IconButton(
                                        icon: const Icon(Icons.delete_outline),
                                        onPressed: () async {
                                          await widget.actionsRepository.removeRelation(
                                            redmineIssueId: widget.issueId,
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
    );
  }
}
