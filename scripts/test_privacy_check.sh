#!/usr/bin/env bash
# Tests for scripts/privacy-check.py.
# Run from repo root: bash scripts/test_privacy_check.sh
set -u

SCRIPT="$(cd "$(dirname "$0")" && pwd)/privacy-check.py"
PASS=0
FAIL=0

check() {
  local name="$1" expected_rc="$2" actual_rc="$3"
  if [[ "$expected_rc" == "$actual_rc" ]]; then
    echo "ok   - $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL - $name (expected rc=$expected_rc, got rc=$actual_rc)"
    FAIL=$((FAIL + 1))
  fi
}

# Test 1: clean tree → rc 0
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
echo "hello world" > "$TMPDIR/a.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "clean tree exits 0" 0 $?

# Test 2: leak tree (email) → rc 1
echo "contact shailendra.singh@unifyapps.com" > "$TMPDIR/leak.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "leak (email) exits 1" 1 $?
rm "$TMPDIR/leak.txt"

# Test 3: leak tree (workspace URL) → rc 1
echo "https://unifyapps.slack.com/archives/C123" > "$TMPDIR/leak2.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "leak (workspace URL) exits 1" 1 $?
rm "$TMPDIR/leak2.txt"

# Test 4: leak tree (real user ID) → rc 1
echo "user: U07B1ASMEFJ" > "$TMPDIR/leak3.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "leak (real user ID) exits 1" 1 $?
rm "$TMPDIR/leak3.txt"

# Test 5: documented placeholder IDs are NOT leaks
for id in U01EXAMPLE99 U02EXAMPLE11 U01ALICE000 U01BOB00000; do
  echo "placeholder: $id" > "$TMPDIR/p.txt"
done
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "placeholder IDs allowed" 0 $?
rm "$TMPDIR/p.txt"

# Test 6: author-name carve-out
echo '"author": {"name": "Shailendra Singh"}' > "$TMPDIR/ok.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "Shailendra Singh (author) allowed" 0 $?
rm "$TMPDIR/ok.txt"

# Test 7: colleague name leak → rc 1
echo "hey Abhinav, thanks" > "$TMPDIR/leak4.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "colleague name leak exits 1" 1 $?
rm "$TMPDIR/leak4.txt"

# Test 8: customer channel leak → rc 1
echo "#keka_dev_pm" > "$TMPDIR/leak5.txt"
python3 "$SCRIPT" --root "$TMPDIR" >/dev/null 2>&1
check "customer channel leak exits 1" 1 $?
rm "$TMPDIR/leak5.txt"

# Test 9: --list-patterns works
python3 "$SCRIPT" --list-patterns >/dev/null 2>&1
check "--list-patterns succeeds" 0 $?

echo ""
echo "Passed: $PASS   Failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
