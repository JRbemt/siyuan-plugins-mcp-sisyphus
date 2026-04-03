---
name: siyuan-plugin-pub
description: Publish a SiYuan plugin release by bumping versions, updating changelog and bilingual READMEs, preparing the release commit, and running git tag/push commands such as `git tag vX.Y.Z`, `git push origin main`, and `git push origin vX.Y.Z`.
---

# SiYuan Plugin Pub

Use this skill when the user wants to publish a SiYuan plugin version, especially a small release that needs version sync, release notes, README timeline updates, commit wording, and git tag/push steps.

## Release Workflow

1. Confirm the target version, usually `vX.Y.Z`.
2. Update version fields in:
   - `plugin.json`
   - `package.json`
3. Add a new top entry to `CHANGELOG.md`.
4. Sync the release summary into:
   - `README.md`
   - `README_zh_CN.md`
5. Review the diff and make sure version numbers and release wording are consistent.
6. Prepare a release commit message that matches the repo's style.
7. After the commit is created, run the release tag and push commands.

## Default Commit Style

If the repo already uses Chinese summary commits, prefer:

```bash
git add plugin.json package.json CHANGELOG.md README.md README_zh_CN.md
git commit -m "feat：优化 MCP tool 行为一致性并发布 vX.Y.Z"
```

If the current release is more documentation-oriented, adjust the middle phrase but keep the `并发布 vX.Y.Z` ending.

## Default Release Commands

Replace `vX.Y.Z` with the real version:

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

For the current release, if the target version is `v0.1.10`, use:

```bash
git tag v0.1.10
git push origin main
git push origin v0.1.10
```

## Writing Guidance

- `CHANGELOG.md` should focus on user-visible release value, not raw file-by-file edits.
- `README.md` and `README_zh_CN.md` should keep the same release meaning, not literal word-for-word translation.
- For small releases, prefer 2-3 concise bullets in the changelog.
- If the release mainly improves behavior consistency and stability, describe it as:
  - tool behavior consistency
  - permission/path/help refinements
  - docs and test coverage refresh

## Safe Publish Checklist

Before tagging, verify:

- `plugin.json` and `package.json` have the same version
- `CHANGELOG.md` has the new version at the top
- `README.md` and `README_zh_CN.md` both mention the new version in the timeline
- `git diff` matches the intended release scope
- the commit has already been created before running `git tag`

## Output Shape

When using this skill, the response should usually include:

1. A short release summary
2. A recommended commit message
3. The exact git commands to run next

Keep the result compact and directly executable.
