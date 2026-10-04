#!/bin/bash
# Master Harmony Auditor
LOG_FILE="/data/data/com.termux/files/home/AutoHustle/daily_gigs.txt"
ARCHIVE_DIR="/data/data/com.termux/files/home/AutoHustle/Archives"
DATE=$(date +"%Y-%m-%d")

echo "[*] Harmony is merging all data sources for $DATE..."

# 1. Run the Mail Auditor before archiving
python3 ~/GhostHarvester/mail_audit.py

# 2. Compile into PDF
mkdir -p "$ARCHIVE_DIR"
if [ -s "$LOG_FILE" ]; then
    enscript -B --margins=36:36:36:36 -f Courier10 -p temp.ps "$LOG_FILE"
    ps2pdf temp.ps "$ARCHIVE_DIR/Harmony_Master_Log_$DATE.pdf"
    rm temp.ps
    > "$LOG_FILE" # Wipe log for tomorrow
    echo "[*] Master Audit PDF Created."
fi
