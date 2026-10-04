#!/bin/bash

LOG_FILE="/data/data/com.termux/files/home/AutoHustle/raw_gigs_debug.txt"
PACKAGES=("com.doordash.driverapp" "com.instacart.shopper" "com.walmart.sparkdriver")
PROCESSED_IDS=()

echo "========================================"
echo "    AUTOHUSTLE RAW DATA LOGGER"
echo "========================================"
echo "[*] Capturing all gig app notifications..."
echo "[*] Data is being saved to: raw_gigs_debug.txt"

while true; do
    NOTIFS=$(termux-notification-list 2>/dev/null)
    
    if [[ -n "$NOTIFS" && "$NOTIFS" != "[]" ]]; then
        for PKG in "${PACKAGES[@]}"; do
            while IFS="|" read -r ID TITLE CONTENT; do
                if [[ -n "$ID" ]]; then
                    if [[ ! " ${PROCESSED_IDS[*]} " =~ " ${ID} " ]]; then
                        
                        TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
                        
                        # Log absolutely everything from the 3 apps
                        echo "[$TIMESTAMP] $PKG | TITLE: $TITLE | CONTENT: $CONTENT" >> "$LOG_FILE"
                        echo "[!] Captured: $PKG - $TITLE"
                        
                        PROCESSED_IDS+=("$ID")
                        if [ ${#PROCESSED_IDS[@]} -gt 100 ]; then
                            PROCESSED_IDS=("${PROCESSED_IDS[@]:1}")
                        fi
                    fi
                fi
            done < <(echo "$NOTIFS" | jq -r ".[] | select(.packageName==\"$PKG\") | \"\(.id)|\(.title)|\(.content)\"" 2>/dev/null)
        done
    fi
    sleep 2
done
