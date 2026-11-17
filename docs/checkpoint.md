# File-level checkpoints and recovery

Run this utility from the llmkit directory (or via `llmkit-checkpoint` when linked with npm/npx) before editing files you might need to restore. It saves the exact bytes of explicitly selected working files and verifies their integrity before restoring. Git history, the index and the source project remain untouched.

```text
npm run checkpoint -- create --project "../my-app" --snapshot "../my-app-before" --file "src/users.js" --file "draft.txt" --dry-run
npm run checkpoint -- create --project "../my-app" --snapshot "../my-app-before" --file "src/users.js" --file "draft.txt"
npm run checkpoint -- verify --snapshot "../my-app-before"
npm run checkpoint -- recover --snapshot "../my-app-before" --output "../my-app-recovered"
```

Each destination must be a **new** directory whose parent already exists. Snapshots must live outside the source project, and recovered outputs must live outside both the source project and the snapshot. Pass `--json` for machine-readable output. `--dry-run` inspects the selected files and prints the plan without writing.

The manifest records the source project path, relative file paths, byte sizes and SHA-256 digests. Verification checks the manifest and every payload file before recovery begins. Integrity errors exit with status `1`; usage or rejected path errors exit with `2`. Hashes detect corruption and unexpected modifications; they do not authenticate snapshot provenance.

Untracked files, binary bytes and original line endings are preserved verbatim when selected. Directories, wildcards, escaping paths, symbolic/hard links, Windows junctions, Git metadata and recognizable credential payloads are refused. Data is capped at 128 MiB across selected files and 4 MiB for the manifest. Store backups in a private location: backups are unencrypted and only checked against known credential patterns.

This tool captures **working tree bytes**, not a separate copy of the Git index, commit history, permissions or timestamps. If staged edits already exist, inspect the index before and after making changes and avoid modifying staged state mid-task. To roll back, compare the recovered folder against your current files and reapply only what you need. Existing files are never overwritten.
