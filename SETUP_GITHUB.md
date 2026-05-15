# GitHub Setup

The planned repository is:

- Name: `vscode-py-debug-panel`
- Visibility: public

This environment did not have `gh` installed when the extension was created, so the repository could not be created automatically here.

After installing GitHub CLI and authenticating:

```sh
gh auth login
cd /tmp/vscode-py-debug-panel
git init
git add .
git commit -m "Initial Python debug panel extension"
gh repo create vscode-py-debug-panel --public --source=. --remote=origin --push
```

If the repository already exists:

```sh
cd /tmp/vscode-py-debug-panel
git init
git remote add origin git@github.com:<owner>/vscode-py-debug-panel.git
git add .
git commit -m "Initial Python debug panel extension"
git push -u origin main
```
