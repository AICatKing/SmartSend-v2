# Codex GitHub Setup

## Immediate workaround

Run the publish script from your normal terminal, not from the current sandboxed Codex session:

```bash
cd /Users/hugh/code/personal/SmartSend-v2
chmod +x bin/publish-public-github.sh
./bin/publish-public-github.sh
```

## Permanent fixes

Your current shell startup file exports a local proxy and wraps `codex` in `workspace-write` mode:

- `~/.zshrc:49` forces `codex` to start with `-s workspace-write`
- `~/.zshrc:124`
- `~/.zshrc:125`
- `~/.zshrc:126`

Change the `codex` wrapper to:

```bash
codex() {
  command codex \
    -a never \
    -s danger-full-access \
    --search \
    --add-dir "$HOME/Documents/Obsidian/Thinking" \
    --add-dir "$HOME/.codex" \
    "$@"
}
```

If GitHub access should not go through Clash, remove or comment out these lines:

```bash
export https_proxy=http://127.0.0.1:7897
export http_proxy=http://127.0.0.1:7897
export all_proxy=socks5://127.0.0.1:7897
```

If you still need the proxy for other tools, prefer a one-off override:

```bash
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
gh auth login
gh repo create SmartSend-v2 --public --source=. --remote=origin --push
```

After editing `~/.zshrc`, reload your shell:

```bash
source ~/.zshrc
```
