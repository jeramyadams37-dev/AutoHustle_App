#!/bin/bash

echo "[1] Loading environment variables..."
set -a
source /data/data/com.termux/files/home/harmony_project_claude_integration/.env
set +a

echo "[2] Building JSON payload..."
PAYLOAD=$(jq -n --arg msg "Offer: New Delivery - $18.50 for 6.2 miles. McDonald's." '{
  "model": "claude-3-haiku-20240307",
  "max_tokens": 150,
  "system": "Analyze this gig delivery offer. Return ONLY valid JSON with no markdown formatting: {\"verdict\": \"ACCEPT\" or \"REJECT\", \"pay\": 0.00, \"miles\": 0.0}. Rules: Target minimum is $1.50 per mile.",
  "messages": [{"role": "user", "content": $msg}]
}')

echo "[3] Payload generated successfully:"
echo "$PAYLOAD"

echo -e "\n[4] Firing request to Claude API (VERBOSE MODE ON)..."
# Removed -s (silent) and added -v (verbose) to see the full network handshake
curl -v -X POST "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$PAYLOAD"
  
echo -e "\n\n[*] Test Fire Complete."
