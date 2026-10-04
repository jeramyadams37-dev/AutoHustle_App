#!/bin/bash

# AutoHustle Live Interceptor - PRODUCTION

LOG_FILE="/data/data/com.termux/files/home/AutoHustle/daily_gigs.txt"
PACKAGES=("com.doordash.driverapp" "com.instacart.shopper" "com.walmart.sparkdriver")
PROCESSED_IDS=()

# Load the proven environment key path
set -a
source /data/data/com.termux/files/home/harmony_project_claude_integration/.env
set +a

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "[!] CRITICAL ERROR: API Key missing. Halting AutoHustle."
    exit 1
fi

echo "========================================"
echo "    AUTOHUSTLE LIVE DISPATCHER"
echo "========================================"
echo "[*] Key verified. Listening for active offers..."

while true; do
    NOTIFS=$(termux-notification-list 2>/dev/null)
    
    if [[ -n "$NOTIFS" && "$NOTIFS" != "[]" ]]; then
        for PKG in "${PACKAGES[@]}"; do
            while IFS="|" read -r ID TITLE CONTENT; do
                if [[ -n "$ID" ]]; then
                    if [[ ! " ${PROCESSED_IDS[*]} " =~ " ${ID} " ]]; then
                        
                        # Only proceed if the notification contains a dollar sign
                        if [[ "$TITLE$CONTENT" == *"\$"* ]]; then
                            TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
                            
                            PAYLOAD=$(jq -n --arg msg "$TITLE - $CONTENT" '{
                              "model": "claude-3-haiku-20240307",
                              "max_tokens": 150,
                              "system": "Analyze this gig delivery offer. Return ONLY valid JSON with no markdown formatting: {\"verdict\": \"ACCEPT\" or \"REJECT\", \"pay\": 0.00, \"miles\": 0.0}. Rules: Target minimum is $1.50 per mile. Flag high item counts on Instacart.",
                              "messages": [{"role": "user", "content": $msg}]
                            }')

                            RESPONSE=$(curl -s -X POST "https://api.anthropic.com/v1/messages" \
                              -H "x-api-key: $ANTHROPIC_API_KEY" \
                              -H "anthropic-version: 2023-06-01" \
                              -H "content-type: application/json" \
                              -d "$PAYLOAD")

                            VERDICT=$(echo "$RESPONSE" | jq -r '.content[0].text | fromjson | .verdict' 2>/dev/null)
                            PAY_EST=$(echo "$RESPONSE" | jq -r '.content[0].text | fromjson | .pay' 2>/dev/null)
                            MILES_EST=$(echo "$RESPONSE" | jq -r '.content[0].text | fromjson | .miles' 2>/dev/null)

                            if [[ "$VERDICT" == "ACCEPT" ]]; then
                                echo "[$TIMESTAMP] ACCEPTED: \$$PAY_EST for $MILES_EST mi"
                                termux-vibrate -d 1000 
                                echo "[$TIMESTAMP] *** ACCEPTED *** | $PKG | \$$PAY_EST / $MILES_EST mi" >> "$LOG_FILE"
                            elif [[ "$VERDICT" == "REJECT" ]]; then
                                echo "[$TIMESTAMP] REJECTED: $TITLE - $CONTENT"
                                echo "[$TIMESTAMP] REJECTED | $PKG | $TITLE - $CONTENT" >> "$LOG_FILE"
                            fi
                        fi
                        
                        PROCESSED_IDS+=("$ID")
                        if [ ${#PROCESSED_IDS[@]} -gt 50 ]; then
                            PROCESSED_IDS=("${PROCESSED_IDS[@]:1}")
                        fi
                    fi
                fi
            done < <(echo "$NOTIFS" | jq -r ".[] | select(.packageName==\"$PKG\") | \"\(.id)|\(.title)|\(.content)\"" 2>/dev/null)
        done
    fi
    sleep 2
done
