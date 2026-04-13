# Quick Reference Card - Streamline Debugging Tools

## 🔑 Setup (One-time)

```bash
# Set your API token
export REST_API_TOKEN="your_token_here"

# Choose environment (default: staging)
export STREAMLINE_ENV="staging"  # or "production"
```

## 📦 Ansible Playbook

```bash
cd debugging

# Basic: Fetch last 10 MBU logs
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml

# Fetch ERROR logs from production
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "streamline_env=production log_level=ERROR"

# Fetch exception logs (20 records)
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "trace_type=exception log_count=20"

# With inline token
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "api_token=your_token_here"
```

## 🚀 Quick Run Script (Auto-loads Token)

```bash
# From project root (token auto-loaded from .env)
./run-playbook.sh                          # staging + fetch-logs
./run-playbook.sh staging fetch-logs       # explicit env + playbook
./run-playbook.sh staging fetch-business-health
./run-playbook.sh production fetch-logs
```

## 🐚 Bash Script (Quick Alternative)

```bash
cd debugging

# Fetch MBU logs
./scripts/trace-models.sh -m mbu_logs

# Fetch ERROR logs
./scripts/trace-models.sh -m mbu_logs -l ERROR

# Fetch exception logs
./scripts/trace-models.sh -m mbu_logs -T exception

# Trace all models
./scripts/trace-models.sh -a

# From production
./scripts/trace-models.sh -m mbu_logs -e production

# Table format
./scripts/trace-models.sh -m mbu_logs -f table
```

## 🧹 Cleanup Logs

```bash
cd debugging

# Automatic cleanup (via playbook - removes files >7 days old)
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml

# Manual cleanup - dry run
./scripts/cleanup-logs.sh --dry-run

# Manual cleanup - delete files >7 days old
./scripts/cleanup-logs.sh

# Delete files >14 days old
./scripts/cleanup-logs.sh --days 14

# Force delete without confirmation
./scripts/cleanup-logs.sh --force
```

## 📊 View Results

```bash
cd debugging/logs

# List all log files
ls -lh

# Pretty print with jq
cat mbu_logs_*.json | jq .

# Extract specific fields
cat mbu_logs_*.json | jq '.data.records[] | fromjson | {id, log_level, backtrace}'

# Count errors
cat mbu_logs_errors_*.json | jq '.data.count'
```

## 🎯 Common Scenarios

| Scenario | Command |
|----------|---------|
| Recent errors | `ansible-playbook ... --extra-vars "log_level=ERROR"` |
| API exceptions | `ansible-playbook ... --extra-vars "trace_type=exception"` |
| Production debug | `ansible-playbook ... --extra-vars "streamline_env=production"` |
| Quick check | `./scripts/trace-models.sh -m mbu_logs` |
| All models overview | `./scripts/trace-models.sh -a` |
| Custom count | `ansible-playbook ... --extra-vars "log_count=50"` |

## 📁 Output Location

All logs saved to: `debugging/logs/`

```
logs/
├── mbu_logs_<timestamp>.json
├── mbu_logs_errors_<timestamp>.json
├── mbu_logs_exceptions_<timestamp>.json
└── trace_<model>_<timestamp>.json
```

## ⚠️ Security

- ✅ Use `export REST_API_TOKEN="..."` 
- ✅ Use Ansible Vault for production
- ❌ Never commit tokens to git

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Token not set" | `export REST_API_TOKEN="..."` |
| "jq not found" | `brew install jq` |
| "Ansible not found" | `brew install ansible` |
| Empty results | Check token and environment |

## 📚 Full Documentation

- Main README: `debugging/README.md`
- Ansible guide: `debugging/ansible-playbooks/README.md`
- API reference: `docs/API_REFERENCE.md`
- Error tracing: `docs/ERROR_TRACING.md`
