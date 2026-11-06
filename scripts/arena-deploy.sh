#!/usr/bin/env bash
# Deploy Kuizen Arena (cabang feat/arena) ke produksi kuizen.fun.
#
#   ssh -t vps bash /var/www/kuizen-arena/scripts/arena-deploy.sh
#
# Langkah: migrasi 0075 (idempoten) -> gabung feat/arena (ff-only) ke cabang
# produksi -> tsc -> build -> pm2 restart -> semak HTTP.
# Jika build gagal, kod produksi diundur ke commit asal dan dibina semula
# supaya laman tidak kekal rosak.
set -uo pipefail
PROD=/var/www/questmaster-v2
WT=/var/www/kuizen-arena
cd "$PROD" || exit 1

echo "== 1. Migrasi 0075_arena (idempoten)"
docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  < "$WT/supabase/migrations/0075_arena.sql" || { echo "MIGRASI GAGAL"; exit 1; }

echo "== 2. Gabung feat/arena ke $(git branch --show-current)"
if [ -n "$(git status --porcelain)" ]; then echo "PRODUKSI ada perubahan belum commit; berhenti"; exit 1; fi
ASAL=$(git rev-parse HEAD)
git merge --ff-only feat/arena || { echo "Tidak boleh fast-forward; berhenti"; exit 1; }

echo "== 3. Semak jenis"
if ! npx tsc --noEmit; then
  echo "TSC GAGAL: undur ke $ASAL"; git reset -q --hard "$ASAL"; exit 1
fi

echo "== 4. Build (log: /tmp/arena-prod-build.log)"
if ! npm run build > /tmp/arena-prod-build.log 2>&1; then
  tail -30 /tmp/arena-prod-build.log
  echo "BUILD GAGAL: undur ke $ASAL dan bina semula"
  git reset -q --hard "$ASAL"
  npm run build > /tmp/arena-prod-rebuild.log 2>&1 && pm2 restart questmaster-v2 --update-env
  exit 1
fi

echo "== 5. Mula semula"
pm2 restart questmaster-v2 --update-env
sleep 4
for u in https://kuizen.fun/ https://kuizen.fun/arena https://kuizen.fun/educator/arena; do
  curl -s -o /dev/null -w "%{http_code}  $u\n" "$u"
done
echo "SIAP. Undur jika perlu: cd $PROD && git reset --hard $ASAL && npm run build && pm2 restart questmaster-v2"
