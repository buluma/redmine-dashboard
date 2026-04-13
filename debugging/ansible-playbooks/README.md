# Ansible Playbooks for Streamline Debugging

This directory contains Ansible playbooks for fetching logs, tracing models, and monitoring business health via the Streamline REST API.

## 📋 Available Playbooks

### 1. fetch-logs.yml

**Purpose:** Fetches last 10 logs from priority models and traces them via the Streamline API.

**Features:**
- ✅ Fetches recent logs from all priority models (configurable)
- ✅ Filters by log level (ERROR, DEBUG, INFO)
- ✅ Filters by trace type (exception, log)
- ✅ Traces 3 priority models (mbu_logs, server_side_rules_log, traces)
- ✅ Gets record counts for all models
- ✅ Saves results to JSON files with timestamps
- ✅ Displays formatted summaries
- ✅ Supports multiple environments (staging, production)
- ✅ Automatic cleanup of old logs (7+ days)

---

### 2. fetch-business-health.yml

**Purpose:** Monitors business-facing models and retrieves today's records for health checks.

**Features:**
- ✅ Fetches record counts for 8 business models
- ✅ Filters records by today's date (`created_at` parameter)
- ✅ Checks for ERROR status records in key models
- ✅ Saves results to JSON files with timestamps
- ✅ Displays formatted health summaries
- ✅ Supports staging and production environments
- ✅ No inventory needed (uses localhost)

**Business Models Monitored:**
| Model | Description |
|-------|-------------|
| projects | Main projects (27,690 records) |
| ran_projects | RAN projects (25 records) |
| ran_field_jobs | RAN field jobs (9 records) |
| security_tickets | Security tickets (87 records) |
| battery_theft | Battery theft incidents (3,774 records) |
| site_assets | Site assets (46,359 records) |
| vandalism_quotations | Vandalism quotations (35 records) |
| registration_serial_numbers | Registration serial numbers (522 records) |

---

## 🚀 Quick Start

### Prerequisites

1. **Ansible installed:**
   ```bash
   brew install ansible  # macOS
   sudo apt install ansible  # Ubuntu/Debian
   ```

2. **REST API Token:** Get your token from Streamline platform

### Basic Usage

```bash
# From project root
cd debugging

# Run with environment variable for token
export REST_API_TOKEN="your_token_here"
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml
```

## ⚙️ Configuration Options

### Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `streamline_env` | `staging` | Environment (staging/production) |
| `api_token` | `$REST_API_TOKEN` | REST API authentication token |
| `log_count` | `10` | Number of logs to fetch |
| `log_level` | `''` (all) | Filter by level: ERROR, DEBUG, INFO |
| `trace_type` | `''` (all) | Filter by type: exception, log |

### Examples

#### 1. Fetch Last 10 Logs from All Priority Models (Default)

```bash
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml
```

#### 2. Fetch ERROR Logs from Production

```bash
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "streamline_env=production log_level=ERROR"
```

#### 3. Fetch Exception Logs (20 records)

```bash
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "trace_type=exception log_count=20"
```

#### 4. Debug with Custom Token

```bash
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "api_token=your_token_here"
```

#### 5. Production Environment Debug

```bash
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-logs.yml \
  --extra-vars "streamline_env=production log_level=ERROR log_count=50"
```

---

## ⚙️ fetch-business-health.yml Configuration

### Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `streamline_env` | `staging` | Environment (staging/production) |
| `api_token` | `$REST_API_TOKEN` | REST API authentication token |
| `log_count` | `10` | Number of records to fetch per model |

### Examples

#### 1. Run Business Health Check (Default)

```bash
cd debugging
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "api_token=your_token_here"
```

#### 2. Fetch More Records Per Model

```bash
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "api_token=your_token_here log_count=20"
```

#### 3. Run Against Production

```bash
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "streamline_env=production api_token=your_token"
```

#### 4. Filter by Custom Token

```bash
ansible-playbook -i localhost, ansible-playbooks/fetch-business-health.yml \
  --extra-vars "api_token=your_token_here"
```

## 📊 What the Playbook Does

### Task Breakdown

1. **Validate Configuration**
   - Checks API token is set
   - Displays current configuration

2. **Fetch Primary Logs**
   - Gets last N logs from all priority models (mbu_logs, server_side_rules_log, traces)
   - Applies filters (log_level, trace_type) if specified
   - Saves to `logs/<model>_<timestamp>.json`

3. **Trace Models**
   - Gets record counts for all traced models
   - Fetches recent records from each model
   - Saves to `logs/trace_<model>_<timestamp>.json`

4. **Error Analysis**
   - Fetches ERROR level logs from all priority models
   - Saves to `logs/<model>_errors_<timestamp>.json`

5. **Exception Tracing**
   - Fetches exception logs from all priority models
   - Saves to `logs/<model>_exceptions_<timestamp>.json`

6. **Cleanup Old Logs**
   - Finds log files older than 7 days
   - Removes old files to save disk space

7. **Summary**
   - Displays formatted summaries
   - Lists all created files

## 📁 Output Files

All output files are saved to `debugging/logs/` directory:

```
logs/
├── mbu_logs_20260411_143022.json                    # P1: mbu_logs
├── mbu_logs_errors_20260411_143022.json            # P1: ERROR logs
├── mbu_logs_exceptions_20260411_143022.json        # P1: Exception logs
├── server_side_rules_log_20260411_143022.json      # P2: server_side_rules_log
├── server_side_rules_log_errors_20260411_143022.json
├── server_side_rules_log_exceptions_20260411_143022.json
├── traces_20260411_143022.json                     # P3: traces
├── traces_errors_20260411_143022.json
├── traces_exceptions_20260411_143022.json
├── trace_mbu_logs_20260411_143022.json             # Trace data
├── trace_server_side_rules_log_20260411_143022.json
└── trace_traces_20260411_143022.json
```

## 🔍 Viewing Results

### Using jq

```bash
# Pretty print all logs
cat logs/mbu_logs_20260411_143022.json | jq .

# Extract record details
cat logs/mbu_logs_20260411_143022.json | jq '.data.records[] | fromjson'

# Get specific fields
cat logs/mbu_logs_20260411_143022.json | \
  jq '.data.records[] | fromjson | {id, log_level, trace_type, created_at}'

# Count errors
cat logs/mbu_logs_errors_20260411_143022.json | jq '.data.count'

# Search for specific error
cat logs/mbu_logs_errors_20260411_143022.json | \
  jq '.data.records[] | fromjson | select(.backtrace | contains("API"))'
```

### Using Python

```python
import json

# Load and parse logs
with open('logs/mbu_logs_20260411_143022.json') as f:
    data = json.load(f)

# Parse individual records
for record in data['data']['records']:
    parsed = json.loads(record)
    print(f"ID: {parsed['id']}, Level: {parsed['log_level']}")
    print(f"Backtrace: {parsed.get('backtrace', 'N/A')}")
```

## 🔐 Security Best Practices

### ✅ DO:
- Use environment variables for tokens
- Use Ansible Vault for sensitive data
- Add `.env` files to `.gitignore`
- Rotate tokens regularly

### ❌ DON'T:
- Hardcode tokens in playbooks
- Commit `.env` files to git
- Share tokens in plain text
- Use production tokens in development

### Using Ansible Vault

```bash
# Create vault file
ansible-vault create inventory/vault.yml

# Edit vault
ansible-vault edit inventory/vault.yml

# Add to vault:
# api_token: "your_secret_token"

# Run with vault password file
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-mbu-logs.yml \
  --vault-password-file ~/.ansible_vault_password

# Or prompt for vault password
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-mbu-logs.yml \
  --ask-vault-pass
```

## 🛠️ Troubleshooting

### Error: "API token is not set"

**Cause:** Token not provided

**Solution:**
```bash
# Set environment variable
export REST_API_TOKEN="your_token_here"

# Or pass as extra var
ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-mbu-logs.yml \
  --extra-vars "api_token=your_token_here"
```

### Error: "Connection refused" or "404"

**Cause:** Wrong environment or URL

**Solution:**
- Verify `streamline_env` is correct (staging/production)
- Check internet connection
- Verify API endpoint is accessible

### Error: "No records found"

**Cause:** Model has no records or wrong filters

**Solution:**
- Try without filters first
- Check if model alias is correct
- Verify environment has data

### Error: "Ansible not found"

**Cause:** Ansible not installed

**Solution:**
```bash
# macOS
brew install ansible

# Ubuntu/Debian
sudo apt install ansible

# Using pip
pip install ansible
```

### Error: JSON parsing fails

**Cause:** Invalid response or missing jq

**Solution:**
- Install jq: `brew install jq` or `sudo apt install jq`
- Check API response manually with curl

## 🔄 Automation

### Cron Job for Regular Log Collection

```bash
# Edit crontab
crontab -e

# Add entry (every hour)
0 * * * * cd /path/to/debugging && ansible-playbook -i inventory/hosts.ini \
  ansible-playbooks/fetch-mbu-logs.yml \
  --extra-vars "log_level=ERROR" > /dev/null 2>&1
```

### GitHub Actions Workflow

```yaml
name: Debug Log Collection
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  fetch-logs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Ansible
        run: pip install ansible
      
      - name: Fetch MBU Logs
        env:
          REST_API_TOKEN: ${{ secrets.REST_API_TOKEN }}
        run: |
          cd debugging
          ansible-playbook -i inventory/hosts.ini ansible-playbooks/fetch-mbu-logs.yml \
            --extra-vars "log_level=ERROR log_count=50"
      
      - name: Upload Logs
        uses: actions/upload-artifact@v3
        with:
          name: mbu-logs
          path: debugging/logs/
```

## 📚 Related Documentation

- [Main Debugging README](../README.md)
- [Streamline API Reference](../../docs/API_REFERENCE.md)
- [Error Tracing Guide](../../docs/ERROR_TRACING.md)
- [REST Test API Quickstart](../../rest_test/QUICKSTART.md)

## 🤝 Contributing

When modifying playbooks:
1. Test with staging environment first
2. Update this README if adding new features
3. Follow existing patterns and conventions
4. Never commit credentials
5. Ensure backward compatibility
