#!/usr/bin/env python3
"""Proposal bot for community-adopted stem-separation models (issue #266).

Discovers stem-separation models on the Hugging Face Hub plus a maintained
allowlist of vetted upstream projects, applies a composite adoption gate
(downloads, likes, license, maintenance), and files ONE well-formed proposal
issue per new candidate via the `gh` CLI. The bot proposes only - it never
adds a model to the app.

The script is dependency-light so it can run inside GitHub Actions without the
repo's local virtualenv: it only needs `huggingface_hub` (for HF discovery)
plus the preinstalled `gh` CLI and Python stdlib.

Run locally:
    python model_proposal_bot.py --repo zenla5/stemgen-gui --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

DEFAULT_ALLOWLIST = Path(__file__).resolve().parent / "model_allowlist.json"
MODEL_PROPOSAL_LABEL = "model-proposal"
PIPELINE_TAG = "audio-source-separation"
STATUS_MARKER = "<!-- model-proposal-status: awaiting-triage -->"

# Known catalog - mirrors the app's hardcoded catalog used as the dedupe source
# of truth: src-tauri/src/commands/models.rs `get_available_models` (model ids)
# and python/stemgen_sidecar.py `DEMUCS_PRETRAINED_NAME` -> demucs.hf repo names
# (HF repos the demucs family loads from, namespace `adefossez`).
KNOWN_MODEL_IDS = {"bs_roformer", "htdemucs", "htdemucs_ft", "demucs"}
KNOWN_HF_REPOS = {
    "adefossez/HTDemucs",
    "adefossez/HTDemucs-ft",
    "adefossez/HTDemucs-6s",
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


@dataclass
class Thresholds:
    min_downloads_30d: int = 100
    min_downloads_alltime: int = 500
    min_likes: int = 5
    max_maintenance_days: int = 365
    min_upstream_stars: int = 0
    min_used_by: int = 0


@dataclass
class HfModel:
    repo_id: str
    downloads_30d: int = 0
    downloads_all_time: Optional[int] = None
    likes: int = 0
    license: Optional[str] = None
    last_modified: Optional[datetime] = None
    sha: Optional[str] = None
    pipeline_tag: Optional[str] = None
    used_by: int = 0
    source: str = "hf-task"

    @classmethod
    def from_model_info(cls, info) -> "HfModel":
        card = getattr(info, "card_data", None)
        license_value = None
        if card is not None and isinstance(card, dict):
            license_value = card.get("license")
        elif card is not None:
            try:
                license_value = card.get("license")
            except Exception:
                license_value = None
        used_by = 0
        if getattr(info, "children_model_count", None):
            used_by += int(info.children_model_count)
        if getattr(info, "spaces", None):
            used_by += len(info.spaces)
        return cls(
            repo_id=info.id,
            downloads_30d=int(getattr(info, "downloads", 0) or 0),
            downloads_all_time=getattr(info, "downloads_all_time", None),
            likes=int(getattr(info, "likes", 0) or 0),
            license=license_value,
            last_modified=getattr(info, "last_modified", None),
            sha=getattr(info, "sha", None),
            pipeline_tag=getattr(info, "pipeline_tag", None),
            used_by=used_by,
        )


@dataclass
class UpstreamMeta:
    github_repo: str
    stars: int = 0
    pushed_at: Optional[datetime] = None
    archived: bool = False


@dataclass
class Candidate:
    hf: HfModel
    upstream: Optional[UpstreamMeta] = None
    source_project: Optional[str] = None

    @property
    def repo_id(self) -> str:
        return self.hf.repo_id

    @property
    def display_name(self) -> str:
        return self.repo_id.split("/")[-1]

    @property
    def last_activity(self) -> Optional[datetime]:
        activity = self.hf.last_modified
        if self.upstream is not None and self.upstream.pushed_at is not None:
            if activity is None or self.upstream.pushed_at > activity:
                activity = self.upstream.pushed_at
        return activity


@dataclass
class AllowlistProject:
    name: str
    github: Optional[str] = None
    hf_repos: List[str] = field(default_factory=list)
    # Maps an HF weight repo to the app-catalog model id it already backs
    # (e.g. "anvuew/BS-RoFormer" -> "bs_roformer"). Such repos are treated as
    # already adopted and are never proposed by the bot.
    catalog_ids: Dict[str, str] = field(default_factory=dict)
    notes: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "AllowlistProject":
        return cls(
            name=data["name"],
            github=data.get("github"),
            hf_repos=list(data.get("hf_repos", [])),
            catalog_ids=dict(data.get("catalog_ids", {})),
            notes=data.get("notes"),
        )


@dataclass
class GhClient:
    run_cmd: Optional[Callable[[Sequence[str]], str]] = None

    def _run(self, args: Sequence[str]) -> str:
        if self.run_cmd is not None:
            return self.run_cmd(args)
        proc = subprocess.run(
            list(args), check=True, capture_output=True, text=True
        )
        return proc.stdout.strip()

    def ensure_label(self, repo: str, label: str) -> None:
        try:
            self._run(
                [
                    "gh", "label", "create", label, "--repo", repo,
                    "--description", "Open proposals from the model-proposal bot",
                    "--color", "c2e0c6",
                ]
            )
        except Exception:
            pass

    def list_open_issues(self, repo: str, label: str) -> List[dict]:
        try:
            out = self._run(
                [
                    "gh", "issue", "list", "--repo", repo, "--state", "open",
                    "--label", label, "--json", "number,title,body,createdAt",
                ]
            )
            return json.loads(out)
        except Exception:
            return []

    def create_issue(self, repo: str, title: str, body: str, label: str) -> str:
        return self._run(
            [
                "gh", "issue", "create", "--repo", repo, "--title", title,
                "--body", body, "--label", label,
            ]
        )

    def close_issue(self, repo: str, number: int, comment: Optional[str] = None) -> str:
        args = ["gh", "issue", "close", "--repo", repo, str(number)]
        if comment:
            args += ["--comment", comment]
        return self._run(args)

    def upstream_meta(self, github_repo: str) -> Optional[UpstreamMeta]:
        try:
            out = self._run(
                [
                    "gh", "api", f"repos/{github_repo}",
                    "--jq",
                    "{stars:.stargazers_count,pushed:.pushed_at,archived:.archived}",
                ]
            )
            data = json.loads(out)
            return UpstreamMeta(
                github_repo=github_repo,
                stars=int(data.get("stars", 0) or 0),
                pushed_at=parse_dt(data.get("pushed")),
                archived=bool(data.get("archived", False)),
            )
        except Exception:
            return None


def load_allowlist(path: Path) -> List[AllowlistProject]:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return [AllowlistProject.from_dict(item) for item in data.get("projects", [])]


def fetch_task_models(api, tag: str = PIPELINE_TAG, limit: int = 200) -> List[HfModel]:
    """List HF models for the separation task, tolerating API version drift.

    huggingface_hub 1.x exposes the task filter as `pipeline_tag=` / `filter=`
    while older 0.x releases used `task=`. Try each in turn and use the first
    that returns results.
    """
    kwargs_list = [
        {"pipeline_tag": tag},
        {"task": tag},
        {"filter": tag},
    ]
    for kwargs in kwargs_list:
        try:
            models = list(api.list_models(**kwargs, limit=limit))
            if models:
                return [HfModel.from_model_info(m) for m in models]
        except TypeError:
            continue
        except Exception:
            continue
    return []


def fetch_hf_model(api, repo_id: str) -> Optional[HfModel]:
    """Fetch full model info, enriching all-time downloads when available."""
    try:
        info = api.model_info(repo_id)
    except Exception:
        return None
    if info is None:
        return None
    model = HfModel.from_model_info(info)
    if model.downloads_all_time is None:
        try:
            enriched = api.model_info(repo_id, expand=["downloadsAllTime"])
            model.downloads_all_time = getattr(enriched, "downloads_all_time", None)
        except Exception:
            pass
    return model


def classify_license(license_value: Optional[str]) -> str:
    """Return usable | non_commercial | proprietary | unknown."""
    if not license_value:
        return "unknown"
    lic = str(license_value).strip().lower()
    nc_tokens = (
        "non-commercial", "noncommercial", "non commercial", "cc-by-nc",
        "cc-nc", "creative commons attribution noncommercial", "by-nc",
    )
    if any(token in lic for token in nc_tokens):
        return "non_commercial"
    proprietary_tokens = (
        "proprietary", "all rights reserved", "commercial only",
        "commercial-only", "unlicensed",
    )
    if any(token in lic for token in proprietary_tokens):
        return "proprietary"
    usable_tokens = (
        "mit", "apache", "bsd", "gpl", "lgpl", "agpl", "mpl", "isc", "cc0",
        "cc-by", "cc-by-sa", "wtfpl", "unlicense", "openrail", "fair",
        "public domain", "odc",
    )
    if any(token in lic for token in usable_tokens):
        return "usable"
    return "unknown"


def is_recent(value: Optional[datetime], now: datetime, max_days: int) -> bool:
    if value is None:
        return True
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return (now - value).days <= max_days


def ecosystem_signal(candidate: Candidate, thresholds: Thresholds) -> bool:
    stars_ok = thresholds.min_upstream_stars <= 0 or (
        candidate.upstream is not None
        and candidate.upstream.stars >= thresholds.min_upstream_stars
    )
    used_by_ok = thresholds.min_used_by <= 0 or (
        candidate.hf.used_by >= thresholds.min_used_by
    )
    return stars_ok and used_by_ok


def gate_reasons(candidate: Candidate, thresholds: Thresholds, now: datetime) -> List[str]:
    reasons: List[str] = []
    if candidate.hf.downloads_30d < thresholds.min_downloads_30d:
        reasons.append(
            f"downloads_30d ({candidate.hf.downloads_30d}) below floor "
            f"({thresholds.min_downloads_30d})"
        )
    if (
        candidate.hf.downloads_all_time is not None
        and candidate.hf.downloads_all_time < thresholds.min_downloads_alltime
    ):
        reasons.append(
            f"downloads_all_time ({candidate.hf.downloads_all_time}) below floor "
            f"({thresholds.min_downloads_alltime})"
        )
    if candidate.hf.likes < thresholds.min_likes:
        reasons.append(
            f"likes ({candidate.hf.likes}) below floor ({thresholds.min_likes})"
        )
    license_status = classify_license(candidate.hf.license)
    if license_status != "usable":
        reasons.append(f"license '{candidate.hf.license}' is {license_status}")
    if not is_recent(candidate.last_activity, now, thresholds.max_maintenance_days):
        reasons.append(
            f"last activity older than {thresholds.max_maintenance_days} days"
        )
    if not ecosystem_signal(candidate, thresholds):
        reasons.append("ecosystem signal (stars/used-by) below floor")
    return reasons


def discover(
    api,
    gh: GhClient,
    allowlist: List[AllowlistProject],
    thresholds: Thresholds,
    now: datetime,
) -> Dict[str, Candidate]:
    candidates: Dict[str, Candidate] = {}
    for model in fetch_task_models(api):
        candidates[model.repo_id] = Candidate(hf=model)
    for project in allowlist:
        upstream = (
            gh.upstream_meta(project.github) if project.github else None
        )
        for repo_id in project.hf_repos:
            model = fetch_hf_model(api, repo_id)
            if model is None:
                continue
            candidate = candidates.get(repo_id, Candidate(hf=model))
            candidate.hf = model
            candidate.source_project = project.name
            if candidate.upstream is None:
                candidate.upstream = upstream
            candidates[repo_id] = candidate
    return candidates


def known_catalog() -> Tuple[set, set]:
    return set(KNOWN_MODEL_IDS), {r.lower() for r in KNOWN_HF_REPOS}


def _norm_name(name: str) -> str:
    """Normalize a model/repo name so hyphens and underscores are equivalent.

    The app catalog uses snake_case model ids (e.g. `bs_roformer`) while HF
    repo names use hyphens (e.g. `BS-RoFormer`). Treating them as equal stops
    the bot from re-proposing a model whose architecture is already adopted.
    """
    return name.lower().replace("-", "_")


def adopted_catalog(allowlist: List[AllowlistProject]) -> Tuple[set, set]:
    """Repos already backed by a catalog model id, plus those catalog ids.

    Returns (adopted_repos, extra_model_ids): repos that must never be proposed
    (option C), and the normalized model ids they map to so any repo sharing the
    same architecture is likewise skipped (option B).
    """
    adopted_repos: set = set()
    extra_ids: set = set()
    for project in allowlist:
        for repo_id, model_id in (project.catalog_ids or {}).items():
            adopted_repos.add(repo_id.lower())
            extra_ids.add(_norm_name(model_id))
    return adopted_repos, extra_ids


def open_proposal_keys(open_issues: List[dict]) -> set:
    keys = set()
    for issue in open_issues:
        text = f"{issue.get('title', '')} {issue.get('body', '')}".lower()
        for part in re.split(r"[\s()\[\],;:/]+", text):
            if part:
                keys.add(_norm_name(part))
    return keys


def dedupe(
    candidates: Dict[str, Candidate],
    known_ids: set,
    known_repos: set,
    open_issues: List[dict],
    adopted_repos: Optional[set] = None,
) -> List[Candidate]:
    open_keys = open_proposal_keys(open_issues)
    known_id_keys = {_norm_name(i) for i in known_ids}
    adopted_repos = adopted_repos or set()
    results: List[Candidate] = []
    for repo_id, candidate in candidates.items():
        name = _norm_name(repo_id.split("/")[-1])
        if name in known_id_keys or repo_id.lower() in known_repos:
            continue
        if repo_id.lower() in adopted_repos:
            continue
        if repo_id.lower() in open_keys or name in open_keys:
            continue
        results.append(candidate)
    return results


def build_issue_title(candidate: Candidate) -> str:
    return f"[Model Proposal] {candidate.display_name} ({candidate.repo_id})"


def build_issue_body(candidate: Candidate) -> str:
    hf = candidate.hf
    source_url = f"https://huggingface.co/{hf.repo_id}"
    upstream_line = (
        candidate.upstream.github_repo if candidate.upstream else "n/a"
    )
    all_time = hf.downloads_all_time if hf.downloads_all_time is not None else "n/a"
    modified = (
        hf.last_modified.isoformat() if hf.last_modified else "n/a"
    )
    revision = hf.sha or "n/a"
    license_text = hf.license or "unknown"
    return f"""## Model proposal: {candidate.display_name}

The model-proposal bot detected a community-adopted stem-separation model that
passes the adoption gate. This issue tracks maintainer triage; the bot **never**
adds a model to the app itself.

### Model signals

| Field | Value |
| --- | --- |
| Model name | {candidate.display_name} |
| Source URL | {source_url} |
| HF repo | `{hf.repo_id}` |
| Downloads (30-day) | {hf.downloads_30d} |
| Downloads (all-time) | {all_time} |
| Likes | {hf.likes} |
| License | {license_text} |
| Upstream revision | `{revision}` |
| Last modified | {modified} |
| Upstream repo | {upstream_line} |
| Used by (spaces/children) | {hf.used_by} |

### Maintainer adoption checklist

- [ ] **Load path** — verify the model loads through the sidecar (demucs /
      bs-roformer or a new load path) at the upstream revision pinned above.
- [ ] **CPU/GPU/device support** — confirm inference works on CPU, CUDA and MPS
      (or document limitations).
- [ ] **Cloud-provider wiring** — if applicable, wire the model into the
      remote-GPU (fal/replicate) provider configuration.
- [ ] **Size** — record the on-disk model size and its impact on the download
      budget.
- [ ] **License review** — confirm the license is usable for a FOSS DJ tool
      before shipping (non-commercial weights cannot be bundled).
- [ ] **Tests** — add/adjust unit and integration coverage and keep the vitest
      coverage thresholds green.

---
_Bot-generated. The bot skips this model while this issue is open; close it to
allow a future re-proposal if the adoption signals change._

{STATUS_MARKER}
"""


def close_stale_proposals(
    gh: GhClient,
    repo: str,
    label: str,
    stale_days: int,
    now: datetime,
    dry_run: bool = False,
) -> List[int]:
    closed: List[int] = []
    for issue in gh.list_open_issues(repo, label):
        body = issue.get("body", "")
        if STATUS_MARKER not in body:
            continue
        created = parse_dt(issue.get("createdAt"))
        if created is None or (now - created).days < stale_days:
            continue
        closed.append(int(issue["number"]))
        if dry_run:
            continue
        comment = (
            f"Closing as stale: no maintainer action within {stale_days} days "
            "of this proposal. The bot will re-propose if the model still "
            "passes the adoption gate."
        )
        gh.close_issue(repo, int(issue["number"]), comment=comment)
    return closed


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="GitHub repo as owner/repo")
    parser.add_argument("--dry-run", action="store_true",
                        help="discover and report without filing any issues")
    parser.add_argument("--allowlist", type=Path, default=DEFAULT_ALLOWLIST)
    parser.add_argument("--label", default=MODEL_PROPOSAL_LABEL)
    parser.add_argument("--max-issues", type=int, default=3)
    parser.add_argument("--sleep", type=float, default=5.0,
                        help="seconds between issue creations (rate limiting)")
    parser.add_argument("--min-downloads-30d", type=int, default=100)
    parser.add_argument("--min-downloads-alltime", type=int, default=500)
    parser.add_argument("--min-likes", type=int, default=5)
    parser.add_argument("--max-maintenance-days", type=int, default=365)
    parser.add_argument("--min-upstream-stars", type=int, default=0)
    parser.add_argument("--min-used-by", type=int, default=0)
    parser.add_argument("--stale-days", type=int, default=90)
    parser.add_argument("--handle-stale", action="store_true")
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    thresholds = Thresholds(
        min_downloads_30d=args.min_downloads_30d,
        min_downloads_alltime=args.min_downloads_alltime,
        min_likes=args.min_likes,
        max_maintenance_days=args.max_maintenance_days,
        min_upstream_stars=args.min_upstream_stars,
        min_used_by=args.min_used_by,
    )
    gh = GhClient()
    now = utcnow()

    if not args.dry_run:
        gh.ensure_label(args.repo, args.label)

    from huggingface_hub import HfApi

    api = HfApi()
    allowlist = load_allowlist(args.allowlist)
    candidates = discover(api, gh, allowlist, thresholds, now)

    passed = {
        repo_id: candidate
        for repo_id, candidate in candidates.items()
        if not gate_reasons(candidate, thresholds, now)
    }
    gated: List[Tuple[Candidate, List[str]]] = []
    for repo_id, candidate in sorted(candidates.items()):
        reasons = gate_reasons(candidate, thresholds, now)
        if reasons:
            gated.append((candidate, reasons))

    known_ids, known_repos = known_catalog()
    adopted_repos, extra_ids = adopted_catalog(allowlist)
    known_ids = known_ids | extra_ids
    open_issues = gh.list_open_issues(args.repo, args.label)
    proposals = dedupe(passed, known_ids, known_repos, open_issues, adopted_repos)

    print(f"[model-bot] repo={args.repo} candidates={len(candidates)} "
          f"proposals={len(proposals)} gated_out={len(gated)}")

    if args.debug:
        for repo_id in sorted(candidates):
            reasons = gate_reasons(candidates[repo_id], thresholds, now)
            print(f"[model-bot] candidate {repo_id}: {'PASS' if not reasons else '; '.join(reasons)}")

    created: List[str] = []
    for index, candidate in enumerate(proposals[: args.max_issues]):
        title = build_issue_title(candidate)
        body = build_issue_body(candidate)
        if args.dry_run:
            print(f"[model-bot] (dry-run) would file: {title}")
            created.append(f"DRY-RUN {title}")
            continue
        if index > 0 and args.sleep > 0:
            time.sleep(args.sleep)
        url = gh.create_issue(args.repo, title, body, args.label)
        print(f"[model-bot] filed {title} -> {url}")
        created.append(url)

    skipped = max(0, len(proposals) - len(created))
    if skipped:
        print(f"[model-bot] rate limit: skipped {skipped} further proposal(s)")

    stale_closed: List[int] = []
    if args.handle_stale:
        stale_closed = close_stale_proposals(
            gh, args.repo, args.label, args.stale_days, now, dry_run=args.dry_run
        )
        for number in stale_closed:
            print(f"[model-bot] {'(dry-run) would close' if args.dry_run else 'closed'} stale proposal #{number}")
    else:
        print("[model-bot] stale handling disabled (pass --handle-stale to enable)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
