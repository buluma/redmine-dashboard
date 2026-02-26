import "package:flutter/material.dart";
import "package:flutter_markdown/flutter_markdown.dart";
import "package:markdown/markdown.dart" as md;
import "package:url_launcher/url_launcher.dart";

import "models.dart";
import "repositories.dart";

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

    // Convert patterns like: "link":https://example.com
    out = out.replaceAllMapped(
      RegExp(r'"?link"?\s*:\s*(https?:\/\/[^\s)"\]]+)'),
      (m) => "[link](${m.group(1)})",
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
                                      title: Text(
                                        link.title ?? link.url,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      subtitle: Text(link.repositoryFullName),
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
                                            leading: const Icon(Icons.attach_file),
                                            title: Text(
                                              attachment.filename,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            subtitle: Text(
                                              "${(attachment.filesize / 1024).toStringAsFixed(1)} KB"
                                              "${attachment.author != null ? " • ${attachment.author}" : ""}",
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
                                      DropdownMenuItem<String>(value: "blocks", child: Text("blocks")),
                                      DropdownMenuItem<String>(value: "precedes", child: Text("precedes")),
                                      DropdownMenuItem<String>(value: "follows", child: Text("follows")),
                                      DropdownMenuItem<String>(value: "duplicates", child: Text("duplicates")),
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
