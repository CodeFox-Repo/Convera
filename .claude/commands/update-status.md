# Update Status in GitHub Project

Update the status of an existing item in the GitHub Project based on context or clipboard content.

## Arguments

- `$ARGUMENTS` - Optional: Task description or keywords to search for. If not provided, will read from clipboard.

## Instructions

1. Get the search content:

```bash
# If arguments provided, use them; otherwise read from clipboard
if [ -n "$ARGUMENTS" ]; then
  SEARCH_CONTENT="$ARGUMENTS"
else
  SEARCH_CONTENT=$(pbpaste)
fi
echo "Search content: $SEARCH_CONTENT"
```

2. List all items in the GitHub Project:

```bash
# List all items with their status
gh project item-list 1 --owner CodeFox-Repo --format json | jq -r '.items[] | "\(.id) | \(.title) | Status: \(.status)"'
```

3. Search for matching items:
   - Look for items with titles containing the search keywords
   - Check item descriptions for semantic matches
   - Consider partial matches and similar intent
   - Rank matches by relevance

4. If no matches found:
   - Inform the user that no matching items were found
   - Suggest creating a new todo item instead
   - Ask the user if they want to list all items to manually select one

5. If multiple matches found:
   - Present all matching items to the user with their current status
   - Ask the user using AskUserQuestion tool to select which item to update

6. Get available status options:

```bash
# Get Status field info
gh project field-list 1 --owner CodeFox-Repo --format json | jq -r '.fields[] | select(.name == "Status") | .options[] | "\(.id): \(.name)"'
```

Available statuses (typical):
- **Todo** - Not started
- **In Progress** - Currently being worked on
- **Done** - Completed
- **Backlog** - Planned for future

7. Determine the new status:
   - If context contains "done", "completed", "finished", "fixed" -> Done
   - If context contains "started", "working on", "in progress" -> In Progress
   - If context contains "backlog", "later", "future" -> Backlog
   - If context contains "todo", "pending", "not started" -> Todo
   - If unclear, ask the user to select the new status

8. Ask the user for confirmation:
   - Show the item to be updated
   - Show the current status
   - Show the proposed new status
   - Ask "Confirm status change?" with options: "Yes", "No", "Select different status"

9. Update the item status:

```bash
# Get the Status field ID and option ID
STATUS_FIELD_ID=$(gh project field-list 1 --owner CodeFox-Repo --format json | jq -r '.fields[] | select(.name == "Status") | .id')
NEW_STATUS_OPTION_ID=$(gh project field-list 1 --owner CodeFox-Repo --format json | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name == "<new-status>") | .id')

# Update the item's status using PVTI_ id
gh project item-edit --project-id PVT_kwDODCfkrM4BMEO5 --id <PVTI_xxx> --field-id $STATUS_FIELD_ID --single-select-option-id $NEW_STATUS_OPTION_ID
```

10. Report the result:
    - Show the updated item details
    - Show the old status -> new status transition
    - Provide the project URL for reference: https://github.com/orgs/CodeFox-Repo/projects/1

## Examples

### Example 1: Mark task as done
```
Input: "model selector done"
Action: Search for items containing "model selector", update status to "Done"
```

### Example 2: Start working on a task
```
Input: "started dark mode feature"
Action: Search for "dark mode" items, update status to "In Progress"
```

### Example 3: Ambiguous input
```
Input: "chat feature"
Action: Find matching items, ask user which one and what status to set
```

## Notes

- The project ID is `PVT_kwDODCfkrM4BMEO5`
- The project number is `1`
- The owner is `CodeFox-Repo`
- **Important ID types**:
  - `PVTI_xxx` - Project item ID, used for setting status/priority fields
  - `DI_xxx` - Draft issue content ID, used for editing title/body
- Always confirm with the user before making status changes
- If the search is ambiguous, list all potential matches and let the user decide
- Support both Chinese and English keywords for status detection
  - 完成/已完成 -> Done
  - 进行中/正在做 -> In Progress
  - 待办/未开始 -> Todo
  - 待定/以后 -> Backlog

