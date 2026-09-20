#!/usr/bin/env bash
# 백업 파일로 DB를 되돌린다. 기존 컬렉션은 지우고 백업 시점의 내용으로 덮어쓴다.
# 사용법: bash scripts/restore-db.sh ~/backups/qa_platform-20260920-150000.archive.gz
#   (안 넘기면 가장 최근 백업을 쓴다)
set -euo pipefail

DB="${BACKUP_DB:-qa_platform}"
DIR="${BACKUP_DIR:-$HOME/backups}"
FILE="${1:-$(ls -1t "$DIR"/"${DB}"-*.archive.gz 2>/dev/null | head -n 1)}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "복원할 백업 파일을 찾을 수 없습니다: ${FILE:-없음}" >&2
  exit 1
fi

echo "복원 대상: $FILE"
mongorestore --drop --archive="$FILE" --gzip --nsInclude "${DB}.*"
echo "복원 완료"
