#!/bin/bash
#================================================================
# LOCAL command-line assistant — cx.sh
#
#   ./cx.sh            # interactive menu
#   ./cx.sh 20         # run an option directly
#   ./cx.sh 33 "route:list"   # …with a second parameter
#
# ⚠ Runs on your LOCAL machine only — never copy this to the server.
#   Its counterpart on the server is deploy.sh (pull + migrate + caches).
#
# Requires a vars.sh next to it defining REMOTE, PROJECT, APP_SSH, etc.
# See vars.sh.example. vars.sh is gitignored because it holds host and
# account details.
#
# Version 1.0
# - routine deploy, what's-live, migration status and cache options
# - diagnose: health check, log tail, recent errors, artisan, config, disk
# - maintenance mode on/off, log truncation (confirmed)
# - first-time server setup (clone + .env + key) as option 10
#================================================================
clear

if [ ! -f ./vars.sh ]; then
  echo "vars.sh not found next to cx.sh — copy vars.sh.example to vars.sh and fill it in."
  exit 1
fi
source ./vars.sh

# Defaults for settings a vars.sh may leave unset.
REMOTE_APP="${REMOTE_APP:-www/$PROJECT}"     # app root on the server, relative to ~
APP_URL="${APP_URL:-https://$PROJECT}"       # what option 30 health-checks
LOG_OUTPUT="${LOG_OUTPUT:-./log/remote.out}"
REPO_URL="${REPO_URL:-$(git remote get-url origin 2>/dev/null)}"

# This script drives the server from outside. Run on the server it would
# try to ssh to itself.
if [ "$(hostname -s 2>/dev/null)" = "${REMOTE_HOST%%.*}" ]; then
  echo "⚠ This looks like $REMOTE_HOST — cx.sh is the LOCAL script. Use deploy.sh here."
  exit 1
fi

#---------------------------------------------------------------
# Helpers
#---------------------------------------------------------------

# Append a line to the history log, creating it if needed.
log_history() {
  mkdir -p ./log
  touch ./log/history.log
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M')" "$1" > tmpfile
  cat ./log/history.log >> tmpfile && mv tmpfile ./log/history.log
}

# Run a command on the server, in the app directory.
remote() {
  $APP_SSH "$REMOTE" "cd ~/$REMOTE_APP && $*"
}

# Same, with a terminal attached — for anything interactive or long-running.
remote_tty() {
  $APP_SSH -t "$REMOTE" "cd ~/$REMOTE_APP && $*"
}

# Ask for PARAM2 only when the chosen option needs it.
need_param() {
  if [ -z "$PARAM2" ]; then
    read -r -p "$1: " PARAM2
  fi
}

banner() {
  echo ===========================================================
  echo "$1"
  echo ===========================================================
}

# Gate for anything that drops the site or is hard to undo.
confirm() {
  echo "⚠ $1"
  read -r -p "Type 'yes' to continue: " reply
  [ "$reply" = "yes" ] || { echo "Skipped $SELECTION."; exit 0; }
}

echo =============================================================
echo "Hi $USER@$HOSTNAME — acting on $PROJECT ($REMOTE)"
echo What do you want to do?
echo -------------------------------------------------------------
echo "ROUTINE — day to day"
echo "20 : DEPLOY: pull + migrate + caches + verify on $PROJECT"
echo "22 : WHAT'S LIVE: compare the server's HEAD with local"
echo "23 : MIGRATIONS: status (what is pending on the server)"
echo "24 : CACHES: refresh config/routes/views"
echo "25 : CACHES: clear everything (when a cached value looks stale)"
echo "26 : COMPOSER: install production dependencies"
echo ----------------------------------------------
echo DIAGNOSE
echo "30 : HEALTH: $APP_URL — homepage, assets and /up"
echo "31 : LOGS: tail the Laravel log"
echo "32 : LOGS: last errors with stack traces"
echo "33 : ARTISAN: run a command (e.g. 'route:list')"
echo "34 : CONFIG: key settings on the server (secrets hidden)"
echo "35 : DISK: what is using the account quota"
echo "36 : LOGS: file sizes, and what is growing"
echo ----------------------------------------------
echo MAINTENANCE
echo "72 : MAINTENANCE MODE: on  [site goes down]"
echo "73 : MAINTENANCE MODE: off"
echo "74 : LOGS: truncate the Laravel log  [discards log history]"
echo ----------------------------------------------
echo "ACCESS & SETUP"
echo "00 : CONNECT: to $REMOTE"
echo "05 : MONITOR: remote top"
echo "10 : FIRST-TIME SETUP: clone the repo, create .env, generate key"
echo "qq : Exit [Quit]"
echo Enter [Selection] to continue
echo =============================================================
# Command line selection
if [ -n "$1" ]; then
  SELECTION=$1
else
  read -n 2 SELECTION
fi
PARAM2="${2:-}"
echo
echo Your selection is : $SELECTION.


case "$SELECTION" in

  #-------------------------------------------------------------
  # ROUTINE
  #-------------------------------------------------------------

  "20" )
  banner "DEPLOY: $PROJECT"
  # The server deploys by pulling from git, so anything not pushed is not
  # deployed. Without this check the deploy "succeeds" on the previous
  # commit and the change appears to have silently done nothing.
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "⚠ Uncommitted local changes — these will NOT deploy:"
    git status --short
    echo
  fi
  UNPUSHED=$(git log --oneline @{u}.. 2>/dev/null)
  if [ -n "$UNPUSHED" ]; then
    echo "⚠ Commits not pushed — these will NOT deploy:"
    echo "$UNPUSHED"
    echo
    read -r -p "Deploy anyway? Type 'yes' to continue: " confirm
    [ "$confirm" = "yes" ] || { echo "Skipped $SELECTION"; exit 0; }
  fi
  echo "Local HEAD : $(git log --oneline -1)"
  echo
  remote_tty "./deploy.sh"
  log_history "Deployed $PROJECT"
  ;;


  "22" )
  banner "WHAT'S LIVE on $PROJECT"
  echo "--- server ---"
  remote "git log --oneline -3 && git status --short"
  echo
  echo "--- local ---"
  git log --oneline -3
  echo
  LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null)
  SERVER_HEAD=$(remote "git rev-parse HEAD" 2>/dev/null | tr -d '\r')
  if [ "$LOCAL_HEAD" = "$SERVER_HEAD" ]; then
    echo "✓ server matches local HEAD"
  else
    echo "✗ server is NOT on your local HEAD"
    echo "  local : $LOCAL_HEAD"
    echo "  server: $SERVER_HEAD"
  fi
  ;;


  "23" )
  banner "MIGRATIONS: status on $PROJECT"
  remote "php artisan migrate:status"
  ;;


  "24" )
  banner "CACHES: refresh on $PROJECT"
  remote "php artisan optimize"
  log_history "Refreshed caches on $PROJECT"
  ;;


  "25" )
  banner "CACHES: clear everything on $PROJECT"
  # The counterpart to 24. A stale config cache is why an .env change can
  # appear to have been ignored. Run 24 after this to rebuild.
  remote "php artisan optimize:clear"
  log_history "Cleared all caches on $PROJECT"
  ;;


  "26" )
  banner "COMPOSER: install production dependencies"
  # deploy.sh does this itself whenever composer.lock moves. This is for
  # the case where it warned that composer was not on PATH, or where a
  # dependency needs reinstalling without a deploy.
  remote_tty "composer install --no-dev --optimize-autoloader --no-interaction"
  log_history "Installed composer dependencies on $PROJECT"
  ;;


  #-------------------------------------------------------------
  # DIAGNOSE
  #-------------------------------------------------------------

  "30" )
  banner "HEALTH: $APP_URL"
  # Checked from here rather than on the server so it exercises the real
  # path in: DNS, TLS and the web server, not just PHP.
  for path in / /css/style.css /js/tetris.js /ads.txt /up; do
    printf '%-16s ' "$path"
    curl -sS -o /dev/null -w '%{http_code}  %{time_total}s\n' --max-time 25 "$APP_URL$path" \
      || echo "✗ no response"
  done
  ;;


  "31" )
  banner "LOGS: tail on $PROJECT (Ctrl-C to stop)"
  remote_tty "tail -n 40 -f storage/logs/laravel.log"
  ;;


  "32" )
  banner "LOGS: recent errors on $PROJECT"
  # Stack traces are noise; the ERROR lines and the exception message
  # immediately after them are what identifies the fault.
  remote "grep -nE '\.(ERROR|CRITICAL|ALERT|EMERGENCY):' storage/logs/laravel.log | tail -n 25" \
    || echo "No matching lines (or no log file yet)."
  ;;


  "33" )
  banner "ARTISAN on $PROJECT"
  need_param "artisan command (without the word 'artisan')"
  case "$PARAM2" in
    tinker*) echo "⚠ tinker needs an interactive PHP CLI; on shared hosting SSH php is often cgi-fcgi and will die." ;;
  esac
  remote_tty "php artisan $PARAM2"
  log_history "Ran artisan $PARAM2 on $PROJECT"
  ;;


  "34" )
  banner "CONFIG on $PROJECT"
  # Values are deliberately not printed for anything that looks like a
  # secret — this runs in a terminal that scrolls back.
  echo "--- environment ---"
  remote "grep -E '^(APP_ENV|APP_DEBUG|APP_URL|SESSION_DRIVER|CACHE_STORE|QUEUE_CONNECTION|DB_CONNECTION|LOG_LEVEL)=' .env | sort"
  echo
  echo "--- keys present (values hidden) ---"
  remote "grep -oE '^[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*=' .env | tr -d '=' | sort | sed 's/^/  /'"
  ;;


  "35" )
  banner "DISK: quota and the biggest directories"
  remote "du -sh . 2>/dev/null; echo; echo 'largest directories:'; du -sh */ 2>/dev/null | sort -rh | head -12"
  ;;


  "36" )
  banner "LOGS: sizes on $PROJECT"
  remote "ls -lh storage/logs/ 2>/dev/null | tail -n +2; echo; echo 'total:'; du -sh storage/logs 2>/dev/null"
  ;;


  #-------------------------------------------------------------
  # MAINTENANCE
  #-------------------------------------------------------------

  "72" )
  banner "MAINTENANCE MODE: ON"
  confirm "$APP_URL will start returning 503 to everyone until you run 73."
  # --retry sets Retry-After so crawlers come back rather than de-indexing.
  remote_tty "php artisan down --retry=60"
  log_history "Maintenance mode ON for $PROJECT"
  ;;


  "73" )
  banner "MAINTENANCE MODE: OFF"
  remote_tty "php artisan up"
  log_history "Maintenance mode OFF for $PROJECT"
  ;;


  "74" )
  banner "LOGS: truncate the Laravel log"
  confirm "This discards the Laravel log on $PROJECT. Run 36 first if you want to know how big it is, and 32 if you have not read the recent errors."
  # Truncated in place rather than deleted: removing the file loses the
  # permissions the web user needs to recreate it.
  remote "test -f storage/logs/laravel.log && : > storage/logs/laravel.log && echo 'laravel.log truncated.' || echo 'No laravel.log to truncate.'"
  log_history "Truncated the Laravel log on $PROJECT"
  ;;


  #-------------------------------------------------------------
  # ACCESS & SETUP
  #-------------------------------------------------------------

  "00" )
  banner "CONNECT: to $REMOTE"
  $APP_SSH $REMOTE
  log_history "Connect to remote"
  ;;


  "05" )
  banner "MONITOR: Remote Top"
  $APP_SSH -t $REMOTE 'top'
  ;;


  "10" )
  banner "FIRST-TIME SETUP: $REMOTE_APP on $REMOTE"
  # Clones the repo into the app root, creates .env from the example and
  # generates APP_KEY. After this, point the web server's document root at
  # ~/$REMOTE_APP/public_html and run option 20 for the first deploy.
  [ -n "$REPO_URL" ] || { echo "✗ REPO_URL is not set and no git origin found."; exit 1; }
  $APP_SSH "$REMOTE" "test -e ~/$REMOTE_APP/artisan" 2>/dev/null \
    && { echo "✗ ~/$REMOTE_APP already holds a Laravel app. Use option 20 to deploy."; exit 1; }
  confirm "This clones $REPO_URL into ~/$REMOTE_APP on $REMOTE."
  $APP_SSH -t "$REMOTE" "mkdir -p ~/$(dirname "$REMOTE_APP") && git clone $REPO_URL ~/$REMOTE_APP"
  remote "cp -n .env.example .env && sed -i.bak -e 's/^APP_ENV=.*/APP_ENV=production/' -e 's/^APP_DEBUG=.*/APP_DEBUG=false/' -e 's|^APP_URL=.*|APP_URL=$APP_URL|' .env && rm -f .env.bak"
  remote_tty "composer install --no-dev --optimize-autoloader --no-interaction && php artisan key:generate --force && touch database/database.sqlite && chmod +x deploy.sh"
  echo
  echo "Next: point the document root at ~/$REMOTE_APP/public_html, then run ./cx.sh 20."
  log_history "First-time setup of $PROJECT on $REMOTE"
  ;;


  "qq" )
  echo Quit
  exit 0
  ;;


   * )
   echo
   echo "Not a recognized option."
  ;;

esac
