#!/usr/bin/env bash
# Gera a chave de assinatura do app Android (rode NO SEU COMPUTADOR, nunca no GitHub).
# Requer Java (keytool). Uso:  bash scripts/gerar-chave.sh
set -e
command -v keytool >/dev/null || { echo "Instale o Java (JDK 17 ou 21) e rode de novo."; exit 1; }
OUT="$HOME/frente-de-ferro-chave"; mkdir -p "$OUT"; KS="$OUT/frente-de-ferro.keystore"
[ -f "$KS" ] && { echo "Já existe uma chave em $KS. Não vou sobrescrever."; exit 1; }
ALIAS="frente-de-ferro"
read -r -s -p "Crie uma senha forte (mín. 8 caracteres): " PASS; echo
[ ${#PASS} -ge 8 ] || { echo "Senha curta demais."; exit 1; }
keytool -genkeypair -v -keystore "$KS" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" -dname "CN=Frente de Ferro, O=Frente de Ferro, C=BR"
base64 -w0 "$KS" 2>/dev/null > "$OUT/keystore.base64.txt" || base64 -i "$KS" | tr -d '\n' > "$OUT/keystore.base64.txt"
cat <<MSG

PRONTO. Chave criada em: $KS
>>> FAÇA CÓPIA desse arquivo e da senha (Drive + pendrive). Sem eles não há como atualizar o app na loja. <<<

Agora cadastre 4 segredos em:
  github.com/bbrunno18/frente-de-ferro → Settings → Secrets and variables → Actions → New repository secret

  ANDROID_KEYSTORE_BASE64    = (conteúdo do arquivo $OUT/keystore.base64.txt)
  ANDROID_KEYSTORE_PASSWORD  = a senha que você acabou de criar
  ANDROID_KEY_ALIAS          = $ALIAS
  ANDROID_KEY_PASSWORD       = a mesma senha

Depois: Actions → Apps → Run workflow. O AAB assinado aparece na Release.
MSG
