#!/usr/bin/env bash
#
# push.sh — one command from a local commit to omkreds.dk.
#
#   bash deploy/push.sh            push the current branch to master and deploy
#   bash deploy/push.sh status     say what the server is running, change nothing
#
# It pushes, runs the server's own deploy.sh, and then *verifies* — it asks
# /api/health which commit the running process is on and compares it with what
# was just pushed. "Deployed successfully" from the deploy script only means
# the script reached its last line; the server has sat commits behind before
# without anything saying so.
#
# The remote default branch is master and the local branch is usually main,
# hence HEAD:master rather than a plain push.
set -euo pipefail

HOST=${OMKREDS_HOST:-root@omkreds.dk}
HEALTH=${OMKREDS_HEALTH:-https://omkreds.dk/api/health}
APP_DIR=/opt/structuralcalc/app

cd "$(dirname "$0")/.."

# Three outcomes, and they mean different things: a commit, "ukendt" (the server
# answered but is running a build from before /health reported one), or empty
# (no answer at all).
deployed_commit() {
    local body sha
    body=$(curl -fsS --max-time 10 "$HEALTH" 2>/dev/null) || return 1
    sha=$(printf '%s' "$body" | sed -n 's/.*"commit"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    printf '%s' "${sha:-ukendt}"
}

if [ "${1:-}" = "status" ]; then
    echo "lokalt:  $(git rev-parse --short HEAD)  ($(git rev-parse --abbrev-ref HEAD))"
    echo "origin:  $(git rev-parse --short origin/master 2>/dev/null || echo '?')  (master)"
    running=$(deployed_commit || true)
    case "$running" in
        "")     echo "server:  svarer ikke ($HEALTH)" ;;
        ukendt) echo "server:  kører, men et build fra før /health meldte commit" ;;
        *)      echo "server:  $running" ;;
    esac
    exit 0
fi

# ── Refuse to deploy something that is not in the repository ────────────────
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Working tree har uforpligtede ændringer. Commit dem først —" >&2
    echo "ellers er det ikke til at sige bagefter hvad der står på serveren." >&2
    git status --short >&2
    exit 1
fi

LOCAL=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "==> Deployer $LOCAL fra $BRANCH"

git fetch -q origin
if ! git merge-base --is-ancestor origin/master HEAD; then
    echo "origin/master er ikke en forfader til HEAD — det ville være et force push." >&2
    echo "Rebase eller merge først." >&2
    exit 1
fi

echo "==> Pusher til origin/master"
git push -q origin "HEAD:master"

echo "==> Kører deploy.sh på $HOST"
ssh "$HOST" "bash $APP_DIR/deploy/deploy.sh"

# ── Verify, rather than assume ──────────────────────────────────────────────
echo "==> Kontrollerer hvad serveren faktisk kører"
for attempt in $(seq 1 20); do
    running=$(deployed_commit || true)
    if [ "$running" = "$LOCAL" ]; then
        echo "OK — omkreds.dk kører $running"
        exit 0
    fi
    sleep 3
done

echo "" >&2
echo "Deploy-scriptet kørte færdigt, men /api/health melder '${running:-intet svar}'" >&2
echo "og ikke $LOCAL. Serveren kører altså ikke det der lige blev pushet." >&2
echo "Tjek:  ssh $HOST 'systemctl status structuralcalc --no-pager'" >&2
exit 1
