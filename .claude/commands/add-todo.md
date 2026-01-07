# Add Todo to GitHub Project

Add a task from clipboard content to the GitHub Project as a todo item.

## Arguments

- `$ARGUMENTS` - Optional: Direct task description. If not provided, will read from clipboard.

## Instructions

1. Get the task content:

```bash
# If arguments provided, use them; otherwise read from clipboard
if [ -n "$ARGUMENTS" ]; then
  TASK_CONTENT="$ARGUMENTS"
else
  TASK_CONTENT=$(pbpaste)
fi
echo "Task content: $TASK_CONTENT"
```

2. Search for similar existing items in the GitHub Project:

```bash
# List all items in the project and search for similar ones
gh project item-list 1 --owner CodeFox-Repo --format json | jq -r '.items[] | "\(.id): \(.title)"'
```

3. Analyze the existing items:
   - Check if any existing item has similar content (>70% semantic similarity)
   - Look for items with overlapping keywords or intent
   - Consider items that might be duplicates or could be merged

4. If similar items found:
   - Present the similar items to the user
   - Ask the user using AskUserQuestion tool:
     - "Create as new item" - Add as a separate todo
     - "Merge with existing" - Update the existing item to include this task
     - "Skip" - Don't add this item
   - If user chooses to merge, update the existing item's description to combine both tasks

5. Create the new item (if not merging or skipping):

```bash
# Create a draft issue in the project
gh project item-create 1 --owner CodeFox-Repo --title "<task title>" --format json
```

6. Set the initial status to "Todo":

```bash
# Get the item ID from the previous command output
# Get the Status field ID
STATUS_FIELD_ID=$(gh project field-list 1 --owner CodeFox-Repo --format json | jq -r '.fields[] | select(.name == "Status") | .id')
TODO_OPTION_ID=$(gh project field-list 1 --owner CodeFox-Repo --format json | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name == "Todo") | .id')

# Update the item's status
gh project item-edit --project-id PVT_kwDODCfkrM4BMEO5 --id <item-id> --field-id $STATUS_FIELD_ID --single-select-option-id $TODO_OPTION_ID
```

7. Optionally set priority if mentioned in the task:
   - If task contains "urgent", "asap", "critical" -> High priority
   - If task contains "when possible", "low priority" -> Low priority
   - Otherwise -> Medium priority

```bash
PRIORITY_FIELD_ID=$(gh project field-list 1 --owner CodeFox-Repo --format json | jq -r '.fields[] | select(.name == "Priority") | .id')
# Get appropriate option ID based on priority level
gh project item-edit --project-id PVT_kwDODCfkrM4BMEO5 --id <item-id> --field-id $PRIORITY_FIELD_ID --single-select-option-id <priority-option-id>
```

8. Report the result:
   - Show the created/updated item details
   - Provide the project URL for reference: https://github.com/orgs/CodeFox-Repo/projects/1

## Notes

- The project ID is `PVT_kwDODCfkrM4BMEO5`
- The project number is `1`
- The owner is `CodeFox-Repo`
- Always check for duplicates before creating new items
- Parse the clipboard content intelligently to extract a clean title
- If the clipboard contains multiple lines, use the first line as title and rest as description context
