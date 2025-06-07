#!/bin/bash

# FoxChat Fix and Push Script
# This script helps fix linting issues and re-runs tests when pre-push hook fails

printf '\033[1;36m[foxychat] Fix and Push Helper 🛠️\033[0m\n'
printf '\033[1;33m[INFO] This script is mainly for fixing ESLint errors and test failures.\033[0m\n'
printf '\033[1;33m[INFO] Formatting issues are now auto-fixed by the pre-push hook.\033[0m\n'

cd app

# Function to print colored messages
print_error() {
    printf '\033[1;31m[ERROR] %s\033[0m\n' "$1"
}

print_success() {
    printf '\033[1;32m[SUCCESS] %s\033[0m\n' "$1"
}

print_info() {
    printf '\033[1;33m[INFO] %s\033[0m\n' "$1"
}

# Step 1: Fix formatting
printf '\033[1;34m→ Fixing code formatting with Prettier...\033[0m\n'
if pnpm run format:write; then
    print_success "Code formatting fixed!"
else
    print_error "Failed to fix formatting"
    exit 1
fi

# Step 2: Check if any files were changed by prettier
if git diff --exit-code --quiet; then
    print_info "No formatting changes needed"
else
    print_info "Files were reformatted, staging changes..."
    git add .
fi

# Step 3: Check linting
printf '\033[1;34m→ Checking ESLint...\033[0m\n'
if pnpm run lint; then
    print_success "Linting checks passed!"
else
    print_error "Linting errors found. Please fix them manually and run this script again."
    print_info "Common fixes:"
    print_info "  - Remove unused imports"
    print_info "  - Fix TypeScript type errors"
    print_info "  - Follow ESLint rules"
    exit 1
fi

# Step 4: Run tests
printf '\033[1;34m→ Running tests...\033[0m\n'
if pnpm test; then
    print_success "All tests passed!"
else
    print_error "Tests failed. Please fix them and run this script again."
    exit 1
fi

# Step 5: Commit changes if any
if ! git diff --cached --exit-code --quiet; then
    printf '\033[1;34m→ Committing formatting changes...\033[0m\n'
    git commit -m "style: fix code formatting with prettier"
    print_success "Formatting changes committed!"
fi

# Step 6: Push
printf '\033[1;34m→ Pushing to remote...\033[0m\n'
if git push; then
    print_success "Successfully pushed! 🚀"
else
    print_error "Failed to push. Please check your git status and try again."
    exit 1
fi

print_success "All done! Your code has been formatted, linted, tested, and pushed! ✨" 