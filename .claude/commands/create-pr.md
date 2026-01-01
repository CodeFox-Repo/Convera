# Create Pull Request

Create a new branch from the current changes and open a pull request.

## Instructions

1. First, check the current git status and get the diff against main branch:

```bash
git status
git diff main --stat
git log main..HEAD --oneline 2>/dev/null || echo "On main branch"
```

2. Determine the current branch situation:
   - If on `main` branch with uncommitted changes: create a new feature branch
   - If on a feature branch: use the current branch

3. If on main branch, create a new branch with a descriptive name based on the changes:

```bash
# Generate branch name from the changes (use kebab-case, max 50 chars)
git checkout -b <branch-name>
```

4. Stage and commit all changes if there are uncommitted changes:

```bash
git add -A
git commit -m "<descriptive commit message>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

5. Push the branch to remote:

```bash
git push -u origin <branch-name>
```

6. Create the pull request using gh CLI:

```bash
gh pr create --title "<PR title>" --body "$(cat <<'EOF'
## Summary
<bullet points describing the changes>

## Changes
<list of modified files/features>

## Test Plan
- [ ] Manual testing completed
- [ ] Build passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

7. Return the PR URL to the user.

## Notes

- Analyze the actual diff to generate meaningful branch names, commit messages, and PR descriptions
- If the user provides a description with the command, incorporate it into the PR
- Never force push or modify git config
- Ask for confirmation before creating the PR if the changes are significant
