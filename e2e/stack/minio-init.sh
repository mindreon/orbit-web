#!/bin/sh
# Bucket plus a worker account limited to the task runtime prefixes (08 §4). Same policy as orbit-infra's
# deploy/minio/init.sh; kept here so this suite runs from a standalone checkout.
set -eu
: "${MINIO_ROOT_USER:?}" "${MINIO_ROOT_PASSWORD:?}" "${BUCKET:?}" "${WORKER_KEY:?}" "${WORKER_SECRET:?}"
i=0
until mc alias set orbit "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "minio did not come up" >&2; exit 1; }; sleep 1
done
mc mb --ignore-existing "orbit/$BUCKET"
cat > /tmp/policy.json <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],
  "Resource":["arn:aws:s3:::$BUCKET/checkpoints/*","arn:aws:s3:::$BUCKET/snapshots/*","arn:aws:s3:::$BUCKET/artifacts/*"]},
 {"Effect":"Allow","Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::$BUCKET"],
  "Condition":{"StringLike":{"s3:prefix":["checkpoints/*","snapshots/*","artifacts/*"]}}}]}
JSON
mc admin policy create orbit orbit-worker /tmp/policy.json
mc admin user add orbit "$WORKER_KEY" "$WORKER_SECRET"
mc admin policy attach orbit orbit-worker --user "$WORKER_KEY"
