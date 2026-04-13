# Debugging Tools for Streamline Vodacom SA Battery

This directory contains debugging tools for fetching MBU logs and tracing models via the Streamline REST API.

## 📁 Directory Structure

```
debugging/
├── README.md                     # This file
├── ansible.cfg                   # Ansible configuration
├── ansible-playbooks/
│   ├── fetch-logs.yml            # Log fetching playbook
│   ├── fetch-business-health.yml # Business health check playbook
│   └── README.md                 # Ansible playbook usage guide
├── inventory/
│   └── hosts.ini                 # Ansible inventory for environments
├── scripts/
│   └── trace-models.sh           # Bash script for model tracing
└── logs/                         # Output directory for fetched logs
    └── (generated files)
```

## 📊 Supabase Integration

Fetched logs can be imported into Supabase for persistent storage, querying, and troubleshooting.

### Schema

Three tables are available in Supabase:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `mbu_logs` | Main application logs | id, backtrace, log_level, trace_type, trace_id, created_at |
| `server_side_rules_log` | Scheduled job execution | id, script_name, status, duration, is_error, error_descr, cpu_usage, ram_usage |
| `traces` | General application traces | id, backtrace, log_level, trace_type, resource_type, resource_id |

All tables include `environment` (staging/production) and `ingested_at` for tracking.

### Import Logs into Supabase

```bash
# Import all fetched logs from debugging/logs/
node scripts/import-streamline-logs.js

# Preview without writing
node scripts/import-streamline-logs.js --dry-run

# Import from specific environment
node scripts/import-streamline-logs.js --env production

# Limit records per file
node scripts/import-streamline-logs.js --limit 50

# Import a single file
node scripts/import-streamline-logs.js --file debugging/logs/mbu_logs_20260413_085359.json
```

### Querying Imported Logs

Use Supabase Studio (SQL Editor) or Prisma Client to query:

```sql
-- Find recent errors across all tables
SELECT 'mbu_logs' as source, id, backtrace, created_at FROM mbu_logs WHERE log_level = 'ERROR' ORDER BY created_at DESC LIMIT 10
UNION ALL
SELECT 'traces', id, backtrace, created_at FROM traces WHERE log_level = 'ERROR' ORDER BY created_at DESC LIMIT 10;

-- Find failed scheduled jobs
SELECT script_name, status, duration, error_descr, created_at
FROM server_side_rules_log
WHERE is_error = true
ORDER BY created_at DESC;

-- Count logs by level (last 24h)
SELECT log_level, COUNT(*) FROM mbu_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY log_level;
```

## 🚀 Quick Start

### Prerequisites

1. **Ansible** (for running playbooks):
   ```bash
   brew install ansible  # macOS
   sudo apt install ansible  # Ubuntu/Debian
   ```

2. **REST API Token**: Get your token from the Streamline platform

3. **curl** and **jq** (for bash scripts):
   ```bash
   brew install curl jq  # macOS
   sudo apt install curl jq  # Ubuntu/Debian
   ```

### Setup

1. **Set your API token** (choose one method):

   ```bash
   # Option 1: Using .env file (recommended)
   cp debugging/.env.example debugging/.env  # if exists
   # Edit debugging/.env and add your token:
   # REST_API_TOKEN="your_token_here"

   # Source the .env file
   source debugging/.env
   export REST_API_TOKEN

   # Option 2: Environment variable
   export REST_API_TOKEN="your_token_here"

   # Option 3: Pass as extra var to Ansible
   ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
     --extra-vars "api_token=your_token_here"
   ```

2. **Choose environment**:

   ```bash
   # Default is staging, override if needed
   export STREAMLINE_ENV="production"  # or "staging"
   ```

## 📖 Available Tools

### 1. Ansible Playbook (Recommended)

Full-featured playbook with comprehensive log fetching and model tracing.

**Basic Usage:**
```bash
cd debugging
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml
```

**Advanced Usage:**
```bash
# Fetch from production
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "streamline_env=production"

# Fetch 20 ERROR logs only
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "log_count=20 log_level=ERROR"

# Fetch exception logs
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "trace_type=exception"

# Custom API token
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "api_token=your_token_here"
```

**What it does:**
- ✅ Fetches last 10 MBU logs (configurable)
- ✅ Filters by log level (ERROR, DEBUG, INFO)
- ✅ Filters by trace type (exception, log)
- ✅ Traces multiple models (battery_theft, projects, sites, etc.)
- ✅ Gets record counts for all models
- ✅ Saves results to `logs/` directory with timestamps
- ✅ Displays formatted summaries

### 2. Business Health Check Playbook

**Purpose:** Monitors business-facing models and retrieves today's records.

**Basic Usage:**
```bash
cd debugging
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "api_token=your_token_here"
```

**Advanced Usage:**
```bash
# Fetch from production
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "streamline_env=production"

# Change record limit
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "log_count=20"

# Custom API token
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "api_token=your_token_here"
```

**What it does:**
- ✅ Fetches record counts for 9 business models
- ✅ Filters records by today's date (`created_at` parameter)
- ✅ Checks for ERROR status records
- ✅ Saves results to `logs/` directory with timestamps
- ✅ Displays formatted health summaries

**Monitored Models:**
- projects (27,690 records)
- sites (40,300 records)
- site_assets (46,359 records)
- battery_theft (3,774 records)
- security_tickets (87 records)
- ran_projects (25 records)
- ran_field_jobs (9 records)
- vandalism_quotations (35 records)
- registration_serial_numbers (522 records)

### 3. Bash Script (Quick Debugging)

Lightweight alternative for quick debugging without Ansible.

**Basic Usage:**
```bash
cd debugging

# Fetch last 10 MBU logs
./scripts/trace-models.sh -m mbu_logs

# Fetch ERROR logs
./scripts/trace-models.sh -m mbu_logs -l ERROR

# Fetch exception logs
./scripts/trace-models.sh -m mbu_logs -T exception

# Trace all models
./scripts/trace-models.sh -a

# Fetch from production
./scripts/trace-models.sh -m mbu_logs -e production

# Custom count and format
./scripts/trace-models.sh -m mbu_logs -n 20 -f table
```

**Options:**
```
-e, --environment ENV     Environment (staging|production)
-t, --token TOKEN         REST API token
-m, --model MODEL         Model alias to trace
-n, --count COUNT         Number of records to fetch [default: 10]
-l, --log-level LEVEL     Filter by log level (ERROR|DEBUG|INFO)
-T, --trace-type TYPE     Filter by trace type (exception|log)
-f, --format FORMAT       Output format (json|table) [default: json]
-a, --all-models          Trace all known models
-h, --help                Show help
```

## 🧹 Log Cleanup

The playbook automatically cleans up log files older than 7 days. You can also manually manage logs.

### Automatic Cleanup (Ansible Playbook)

Every time you run the playbook, it automatically:
- ✅ Finds log files older than 7 days
- ✅ Displays count of files to be deleted
- ✅ Removes old files to save disk space

### Manual Cleanup (Bash Script)

```bash
cd debugging

# Preview files that would be deleted (dry run)
./scripts/cleanup-logs.sh --dry-run

# Delete files older than 7 days (default)
./scripts/cleanup-logs.sh

# Delete files older than 14 days
./scripts/cleanup-logs.sh --days 14

# Force delete without confirmation
./scripts/cleanup-logs.sh --force

# Verbose output
./scripts/cleanup-logs.sh --verbose
```

### Manual File Management

```bash
cd debugging/logs

# List all log files
ls -lh *.json

# List files older than 7 days
find . -name "*.json" -mtime +7 -ls

# Delete all log files
rm -f *.json

# Delete specific model logs
rm -f trace_battery_theft_*.json

# Check disk usage
du -sh .
```

## 📊 Available Models

These models can be traced via the API (ordered by priority):

| Priority | Model | Description |
|----------|-------|-------------|
| P1 | `mbu_logs` | Main logging model (recommended) - 2.4M records |
| P2 | `server_side_rules_log` | Server-side rule execution logs |
| P3 | `traces` | General logging - 245k records |

## 🔍 Common Use Cases

### 1. Investigate Recent Errors

```bash
# Using Ansible
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "log_level=ERROR"

# Using bash script
./scripts/trace-models.sh -m mbu_logs -l ERROR
```

### 2. Monitor Business Health

```bash
# Check today's records for all business models
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "api_token=your_token_here"

# Check for ERROR status in projects
curl "https://streamline.staging.vodacomsa-battery.nasctech.com/api/v1/custom_objects/rest_test/get_all?token=your_token&model_alias=projects&status=Error&created_at=2026-04-11&limit=5"
```

### 3. Trace API Exceptions

```bash
# Using Ansible
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "trace_type=exception"

# Using bash script
./scripts/trace-models.sh -m mbu_logs -T exception
```

### 3. Monitor All Models

```bash
# Using bash script (quick overview)
./scripts/trace-models.sh -a
```

### 4. Production Debugging

```bash
# Set environment
export STREAMLINE_ENV="production"

# Run playbook
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "log_count=50 log_level=ERROR"
```

## 📝 Output Files

All fetched logs are saved to `debugging/logs/` with timestamps:

```
logs/
├── mbu_logs_20260411_143022.json           # Last 10 MBU logs
├── mbu_logs_errors_20260411_143022.json   # ERROR level logs
├── mbu_logs_exceptions_20260411_143022.json # Exception logs
├── trace_mbu_logs_20260411_143022.json    # MBU logs trace
├── trace_traces_20260411_143022.json      # Traces model
├── trace_battery_theft_20260411_143022.json
├── trace_projects_20260411_143022.json
└── ...
```

**View logs with jq:**
```bash
# Pretty print
cat logs/mbu_logs_20260411_143022.json | jq .

# Extract specific fields
cat logs/mbu_logs_20260411_143022.json | jq '.data.records[] | fromjson | {id, log_level, backtrace}'

# Count errors
cat logs/mbu_logs_errors_20260411_143022.json | jq '.data.count'
```

## 🔐 Security

**Important:** Never commit API tokens to version control!

- ✅ Use environment variables: `export REST_API_TOKEN="..."`
- ✅ Use Ansible Vault for sensitive data
- ✅ Add `.env` files to `.gitignore`
- ❌ Never hardcode tokens in playbooks or scripts

**Using Ansible Vault:**
```bash
# Create vault file
ansible-vault create inventory/vault.yml

# Add token to vault
api_token: "your_secret_token"

# Run playbook with vault
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --vault-password-file ~/.ansible_vault_password
```

## 🛠️ Troubleshooting

### Issue: "API token is not set"
**Solution:** Set the `REST_API_TOKEN` environment variable or pass `--extra-vars "api_token=..."`

### Issue: "Connection refused" or "404"
**Solution:**
- Check environment setting (staging/production)
- Verify URL is accessible
- Check internet connection

### Issue: "jq: command not found"
**Solution:** Install jq: `brew install jq` (macOS) or `sudo apt install jq` (Linux)

### Issue: Empty results
**Solution:**
- Verify API token is correct
- Check if model has records
- Try without filters first

### Issue: Ansible not installed
**Solution:** Install Ansible or use the bash script alternative

## 📚 Additional Resources

- [Streamline API Reference](../docs/API_REFERENCE.md)
- [Error Tracing Guide](../docs/ERROR_TRACING.md)
- [REST Test API Quickstart](../rest_test/QUICKSTART.md)
- [Project Overview](../docs/project-overview.md)

## 🤝 Contributing

When adding new debugging tools:
1. Follow existing patterns
2. Add documentation to this README
3. Test with both staging and production
4. Never hardcode credentials

## 📄 License

Same as project license.
