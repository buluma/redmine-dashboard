import "package:flutter/material.dart";

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
                return ListTile(
                  title: Text("#${issue.redmineIssueId} ${issue.subject}"),
                  subtitle: Text(
                    "${issue.statusName} • ${issue.priority ?? "-"} • GH ${issue.githubLinks.length}",
                  ),
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Widget build(BuildContext context) {
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
                          Text(_issue!.subject, style: Theme.of(context).textTheme.titleLarge),
                          Text("${_issue!.statusName} • ${_issue!.priority ?? "-"}"),
                          const SizedBox(height: 12),
                          Text(_issue!.description ?? "(No description)"),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _comment,
                            decoration: const InputDecoration(labelText: "Comment"),
                          ),
                          const SizedBox(height: 8),
                          ElevatedButton(
                            onPressed: _postComment,
                            child: const Text("Post Comment"),
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _repo,
                            decoration: const InputDecoration(labelText: "Repository (owner/repo)"),
                          ),
                          TextField(
                            controller: _ghIssue,
                            decoration: const InputDecoration(labelText: "GitHub Issue #"),
                          ),
                          const SizedBox(height: 8),
                          ElevatedButton(
                            onPressed: _addGithubLink,
                            child: const Text("Add GitHub Link"),
                          ),
                          const SizedBox(height: 16),
                          Text("GitHub Links", style: Theme.of(context).textTheme.titleMedium),
                          ..._issue!.githubLinks.map(
                            (link) => ListTile(
                              title: Text(link.title ?? link.url),
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
    );
  }
}
