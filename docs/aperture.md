# Tailscale Aperture Integration

Converge can use Tailscale Aperture as a private LLM gateway, enabling access to powerful language models without exposing API keys to the public internet.

## Overview

[Tailscale Aperture](https://tailscale.com/docs/aperture) is a private LLM gateway that lets you route LLM requests through your Tailscale network. It provides OpenAI-compatible endpoints that your services can use directly.

## Configuration

Set the following environment variables:

```bash
# Provider selection
LLM_PROVIDER=aperture

# Tailscale Aperture endpoint (use the Tailscale IP of your Aperture server)
APERTURE_BASE_URL=http://100.108.133.39

# Optional: API key (usually not needed for internal Tailscale access)
APERTURE_API_KEY=none

# Model to use (default: google/gemma-4-26b-a4b-it:free)
APERTURE_CHAT_MODEL=qwen/qwen3-coder:free
```

## Available Models

Query your Aperture instance for available models:

```bash
curl http://100.108.133.39/v1/models
```

Example models available through Aperture:
- `google/gemma-4-26b-a4b-it:free`
- `qwen/qwen3-coder:free`
- `meta-llama/llama-3.3-70b-instruct:free`
- `nvidia/nemotron-3-nano-9b-v2:free`

## Usage

Once configured, Converge will automatically use Aperture for:

1. **AI Chat** (`/api/chat`) - General chat with system context
2. **Issue Summaries** (`/api/ai/summarize`) - AI-generated issue summaries
3. **Bulk Summarization** (`/api/ai/summarize-stale`) - Batch stale issue analysis
4. **Slack Issue Creation** (`/api/slack/create-issue`) - Parse Slack → create Redmine issues
5. **Streaming Chat** (`/api/ai/stream`) - Real-time streaming responses
6. **Embeddings** (`generateEmbeddings`) - Semantic search support

## Fallback Behavior

If Aperture is unavailable, Converge automatically falls back to Ollama (local) for:
- Chat completions
- Embeddings generation

## Testing

Test your Aperture connection:

```bash
# List models
curl http://100.108.133.39/v1/models

# Chat completion
curl http://100.108.133.39/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-4-26b-a4b-it:free",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Security Benefits

1. **Private Network** - All LLM traffic stays within your Tailscale network
2. **No Public API Keys** - No need to expose OpenAI/Anthropic keys
3. **Rate Limit Sharing** - Share rate limits across your organization
4. **Audit Trail** - All requests logged through Tailscale

## Troubleshooting

- **Connection refused**: Verify Tailscale connection and Aperture server is running
- **Rate limited**: Try a different model or add your own OpenRouter key
- **Model not found**: Check available models with `/v1/models` endpoint
