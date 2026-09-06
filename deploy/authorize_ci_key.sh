#!/usr/bin/env bash
# Giver GitHub Actions adgang til at deploye.
#
# Køres ÉN gang på serveren, efter et git pull:
#     bash /opt/structuralcalc/app/deploy/authorize_ci_key.sh
#
# Nøglen ligger i repoet, fordi den er den offentlige halvdel — den kan ikke
# bruges til at logge ind med. Den private halvdel findes kun to steder:
# Niels' ~/.ssh/omkreds_deploy og GitHub-hemmeligheden DEPLOY_SSH_KEY.
#
# Findes for at slippe for at taste 68 tegn base64 i Hetzners browserkonsol,
# hvor der hverken er indsæt eller dansk tastatur, og hvor én forkert tegn
# giver en nøgle der bare ikke virker, uden at sige hvorfor.
set -euo pipefail

KEY_FILE="$(dirname "$0")/omkreds_deploy.pub"
AUTH="$HOME/.ssh/authorized_keys"

[ -f "$KEY_FILE" ] || { echo "Mangler $KEY_FILE — kør git pull først." >&2; exit 1; }

key=$(cat "$KEY_FILE")
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$AUTH"
chmod 600 "$AUTH"

if grep -qF "$key" "$AUTH"; then
    echo "Nøglen stod der allerede — intet ændret."
else
    printf '%s\n' "$key" >> "$AUTH"
    echo "Nøglen er tilføjet."
fi

echo ""
echo "Autoriserede nøgler nu:"
ssh-keygen -lf "$AUTH" | sed 's/^/  /'
