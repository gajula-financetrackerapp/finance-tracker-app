#!/bin/sh
# Wait out a rate-limit block, then fill the locales, nearest audience first.
#
# Google blocks the address for a while once it has been flooded. Rather than
# watching for it to relent, keep trying, and spend the first minutes back on
# what most people will see: the Home page cards in the Indian languages, then
# the rest of those languages, then everything else.
#
# Usage: sh scripts/retry-locale-fill.sh [wait-seconds] [attempts-per-phase]

cd "$(dirname "$0")/.." || exit 1

WAIT=${1:-900}
ATTEMPTS=${2:-24}

# The 22 languages of the Eighth Schedule, which is the audience for this app.
INDIAN='hi bn te mr ta ur gu kn or ml pa as mai sa ne sd doi kok mni ks sat brx'

CARDS='home.howItWorks,home.howItWorksPitch,home.howItWorksSub,home.howItWorksCta,home.premiumPitch,home.premiumPitchSub,home.premiumUpgrade,home.rewardsHub,home.rewardsBalanceLabel,home.rewardsRedeem,home.rewardsReferral,home.rewardsReferralShort,home.rewardsReferralSub,home.rewardsInvite,home.rewardsTasks,home.rewardsTasksDone,home.rewardsEarnNow,home.rewardsShareFailed'

# Keep trying one phase until it comes through, or until we run out of patience.
phase() {
  label=$1
  shift
  i=1
  while [ "$i" -le "$ATTEMPTS" ]; do
    echo "=== $label (attempt $i of $ATTEMPTS) ==="
    if python3 scripts/fill_locale_translations.py --workers=4 "$@"; then
      echo "=== $label: done ==="
      return 0
    fi
    echo "=== $label: still blocked, waiting ${WAIT}s ==="
    sleep "$WAIT"
    i=$((i + 1))
  done
  echo "=== $label: gave up after $ATTEMPTS attempts ==="
  return 1
}

# shellcheck disable=SC2086 # the language lists are deliberately word-split
phase "Home page cards, Indian languages" --only="$CARDS" $INDIAN || exit 1
# shellcheck disable=SC2086
phase "everything else, Indian languages" $INDIAN || exit 1
phase "the remaining languages" || exit 1

echo "=== all phases finished; check with: npm run i18n:check ==="
