# Commit Command

Create a focused conventional commit for this repository.

## Usage

```text
/commit
/commit "custom message"
```

Only commit when this command, or another explicit user request to commit, is
part of the current turn.

## What This Command Does

- Reviews the current git status and diffs.
- Runs repository-appropriate validation before committing.
- Stages only the files that belong in the commit.
- Creates a conventional commit message.
- Verifies the commit was created.

## Process

### 1. Inspect Current Changes

Use git to understand exactly what is being committed:

```powershell
git status --short
git diff --stat
git diff
git diff --staged
```

Identify whether the changes are code, tests, config, documentation, or data
placeholders before deciding what validation is required.

### 2. Validate

This is a Python 3.11 project using `pytest` and `ruff`.

For Python code, tests, or project config changes, run:

```powershell
python -m ruff check .
python -m pytest
```

If Ruff reports auto-fixable issues, run:

```powershell
python -m ruff check . --fix
python -m ruff check .
python -m pytest
```

For documentation-only changes, validation may be skipped after confirming no
Python, test, config, or packaging files are part of the commit.

`pytest` excludes live MetaTrader 5 tests by default through `pyproject.toml`.
Do not run `python -m pytest -m mt5` unless the user explicitly asks for it and
the environment has a running, logged-in MT5 terminal.

### 3. Stage Changes

Prefer explicit staging so unrelated working tree changes are not swept into the
commit:

```powershell
git add path/to/file.py path/to/test_file.py
```

Use `git add .` only when every changed file belongs to this commit.

### 4. Create Commit Message

Use Conventional Commits:

```text
type(scope): description

[optional body]

[optional footer]
```

Common types:

- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation-only change
- `style`: formatting-only change
- `refactor`: restructuring without behavior change
- `test`: adding or updating tests
- `chore`: maintenance
- `perf`: performance improvement
- `ci`: CI/CD change
- `build`: packaging or build-system change
- `revert`: revert a previous commit

Useful scopes for this repository:

- `config`: configuration loading or `config/config.yaml`
- `sessions`: trading session calendar and tagging
- `synthetic`: synthetic data generation
- `data`: data loading, cleaning, or storage layout
- `runner`: CLI entry point and orchestration
- `tests`: test-only changes
- `docs`: README, implementation plan, or project notes
- `tooling`: packaging, linting, test config, or developer tooling

Description rules:

- Use imperative mood: "add", not "added".
- Do not capitalize the first word.
- Do not end with a period.
- Keep the subject specific and concise.

Examples:

```text
feat(sessions): add half-day trading calendar support
fix(config): reject broker credentials in yaml
test(synthetic): cover deterministic seeded generation
docs(readme): clarify mt5 setup requirements
```

For a commit body, prefer multiple `-m` arguments:

```powershell
git commit -m "feat(sessions): add holiday calendar support" -m "Tag RTH bars with holiday and half-day awareness."
```

### 5. Never Bypass Hooks

Do not use `--no-verify` or hook-bypass flags. If a hook fails, fix the
underlying issue and rerun the commit.

### 6. Verify

After committing, confirm the new commit:

```powershell
git log -1 --oneline
```

Report the commit hash, message, and validation that ran.

## Scope

This command applies to the current invocation only. It does not grant blanket
permission to commit in future turns.
