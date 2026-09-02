# VibeVision PocketBase migrations
#
# This directory is baked into the PocketBase image (see Dockerfile).
# The canonical schema lives in scripts/migrate-pocketbase.mjs — after changing
# it, export the current schema as JS migrations (PocketBase dashboard or
# ./pocketbase admin export) and commit them here so fresh deploys boot with
# the full schema without running the migration script manually.