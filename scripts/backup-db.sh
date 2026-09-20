#!/usr/bin/env bash
# MongoDB 자동 백업. cron에서 주기적으로 실행하고, 최근 BACKUP_KEEP개만 남기고 오래된 건 지운다.
# 복원은 scripts/restore-db.sh 참고.
set -euo pipefail

DB="${BACKUP_DB:-qa_platform}"
DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${BACKUP_KEEP:-48}"

mkdir -p "$DIR"
FILE="$DIR/${DB}-$(date +%Y%m%d-%H%M%S).archive.gz"

mongodump --quiet --db "$DB" --archive="$FILE" --gzip
ls -1t "$DIR"/"${DB}"-*.archive.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "$(date '+%F %T') 백업 완료: $FILE ($(du -h "$FILE" | cut -f1))"
