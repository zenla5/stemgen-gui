"""Unit tests for the model-proposal bot (issue #266).

The HF API and `gh` CLI are mocked - no network access in these tests.
"""

import datetime as dt
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import model_proposal_bot as mpb
from model_proposal_bot import (
    AllowlistProject,
    Candidate,
    GhClient,
    HfModel,
    Thresholds,
    UpstreamMeta,
)


def make_model(
    repo_id="owner/model",
    downloads=0,
    all_time=None,
    likes=0,
    license="mit",
    last_modified=None,
    sha="abc123",
    pipeline_tag=None,
    children_model_count=0,
    spaces=None,
):
    return SimpleNamespace(
        id=repo_id,
        downloads=downloads,
        downloads_all_time=all_time,
        likes=likes,
        last_modified=last_modified,
        sha=sha,
        pipeline_tag=pipeline_tag,
        children_model_count=children_model_count,
        spaces=spaces or [],
        card_data={"license": license},
    )


def make_candidate(
    repo_id="owner/model",
    downloads=0,
    all_time=None,
    likes=0,
    license="mit",
    last_modified=None,
    upstream=None,
):
    hf = HfModel(
        repo_id=repo_id,
        downloads_30d=downloads,
        downloads_all_time=all_time,
        likes=likes,
        license=license,
        last_modified=last_modified,
        sha="abc123",
    )
    return Candidate(hf=hf, upstream=upstream)


class FakeHfApi:
    """Minimal HfApi stand-in; returns canned models and records calls."""

    def __init__(self, task_models=None, infos=None, expand_infos=None):
        self.task_models = list(task_models or [])
        self.infos = dict(infos or {})
        self.expand_infos = dict(expand_infos or {})
        self.calls = []

    def list_models(self, **kwargs):
        self.calls.append(("list_models", kwargs))
        return iter(self.task_models)

    def model_info(self, repo_id, **kwargs):
        self.calls.append(("model_info", repo_id, kwargs))
        if kwargs.get("expand"):
            return self.expand_infos.get(repo_id)
        return self.infos.get(repo_id)


class FakeGh:
    """Minimal GhClient stand-in; records calls."""

    def __init__(self, open_issues=None, upstream=None):
        self.open_issues = list(open_issues or [])
        self._upstream = upstream
        self.calls = []
        self.labels = []
        self.urls = []

    def ensure_label(self, repo, label):
        self.labels.append(label)

    def list_open_issues(self, repo, label):
        return self.open_issues

    def create_issue(self, repo, title, body, label):
        self.calls.append(("create_issue", title))
        url = f"https://github.com/{repo}/issues/{len(self.urls) + 1}"
        self.urls.append(url)
        return url

    def close_issue(self, repo, number, comment=None):
        self.calls.append(("close_issue", number, comment))

    def upstream_meta(self, github_repo):
        return self._upstream


NOW = mpb.utcnow()


class TestLoadAllowlist:
    def test_loads_projects(self):
        allowlist = mpb.load_allowlist(mpb.DEFAULT_ALLOWLIST)
        assert len(allowlist) == 5
        names = {p.name for p in allowlist}
        assert names == {
            "Demucs", "BS-RoFormer", "MDX-Net", "Open-Unmix", "UVR",
        }

    def test_demucs_has_hf_repos(self):
        allowlist = mpb.load_allowlist(mpb.DEFAULT_ALLOWLIST)
        demucs = next(p for p in allowlist if p.name == "Demucs")
        assert "adefossez/HTDemucs" in demucs.hf_repos


class TestClassifyLicense:
    @pytest.mark.parametrize(
        "value",
        [
            "MIT", "apache-2.0", "bsd-3-clause", "gpl-3.0", "lgpl-2.1",
            "CC-BY-4.0", "CC-BY-SA-4.0", "cc0", "mpl-2.0", "isc",
        ],
    )
    def test_usable_licenses(self, value):
        assert mpb.classify_license(value) == "usable"

    @pytest.mark.parametrize(
        "value",
        [
            "cc-by-nc-4.0", "CC-BY-NC-SA-4.0", "non-commercial",
            "noncommercial only", "Creative Commons Attribution Noncommercial",
        ],
    )
    def test_non_commercial_licenses(self, value):
        assert mpb.classify_license(value) == "non_commercial"

    @pytest.mark.parametrize("value", ["proprietary", "All Rights Reserved"])
    def test_proprietary_licenses(self, value):
        assert mpb.classify_license(value) == "proprietary"

    def test_missing_license_is_unknown(self):
        assert mpb.classify_license(None) == "unknown"
        assert mpb.classify_license("") == "unknown"

    def test_unrecognized_license_is_unknown(self):
        assert mpb.classify_license("some-custom-terms") == "unknown"


class TestIsRecent:
    def test_missing_date_counts_as_recent(self):
        assert mpb.is_recent(None, NOW, 365) is True

    def test_recent_date(self):
        assert mpb.is_recent(NOW - dt.timedelta(days=10), NOW, 365) is True

    def test_old_date(self):
        assert mpb.is_recent(NOW - dt.timedelta(days=400), NOW, 365) is False

    def test_naive_datetime_is_handled(self):
        naive = NOW.replace(tzinfo=None) - dt.timedelta(days=5)
        assert mpb.is_recent(naive, NOW, 365) is True


class TestGateReasons:
    def test_passing_candidate_has_no_reasons(self):
        candidate = make_candidate(downloads=1000, all_time=5000, likes=50)
        assert mpb.gate_reasons(candidate, Thresholds(), NOW) == []

    def test_downloads_30d_below_floor(self):
        candidate = make_candidate(downloads=10, all_time=5000, likes=50)
        reasons = mpb.gate_reasons(candidate, Thresholds(), NOW)
        assert any("downloads_30d" in r for r in reasons)

    def test_all_time_below_floor(self):
        candidate = make_candidate(downloads=1000, all_time=50, likes=50)
        reasons = mpb.gate_reasons(candidate, Thresholds(), NOW)
        assert any("downloads_all_time" in r for r in reasons)

    def test_missing_all_time_does_not_fail_gate(self):
        candidate = make_candidate(downloads=1000, all_time=None, likes=50)
        assert mpb.gate_reasons(candidate, Thresholds(), NOW) == []

    def test_likes_below_floor(self):
        candidate = make_candidate(downloads=1000, all_time=5000, likes=1)
        reasons = mpb.gate_reasons(candidate, Thresholds(), NOW)
        assert any("likes" in r for r in reasons)

    def test_non_commercial_license_gated(self):
        candidate = make_candidate(
            downloads=1000, all_time=5000, likes=50, license="cc-by-nc-4.0"
        )
        reasons = mpb.gate_reasons(candidate, Thresholds(), NOW)
        assert any("non_commercial" in r for r in reasons)

    def test_unknown_license_gated(self):
        candidate = make_candidate(
            downloads=1000, all_time=5000, likes=50, license=None
        )
        reasons = mpb.gate_reasons(candidate, Thresholds(), NOW)
        assert any("unknown" in r for r in reasons)

    def test_unmaintained_model_gated(self):
        candidate = make_candidate(
            downloads=1000,
            all_time=5000,
            likes=50,
            last_modified=NOW - dt.timedelta(days=400),
        )
        reasons = mpb.gate_reasons(candidate, Thresholds(), NOW)
        assert any("last activity" in r for r in reasons)

    def test_ecosystem_signal_used_when_enabled(self):
        thresholds = Thresholds(min_upstream_stars=100)
        candidate = make_candidate(
            downloads=1000, all_time=5000, likes=50,
            upstream=UpstreamMeta(github_repo="a/b", stars=150),
        )
        assert mpb.gate_reasons(candidate, thresholds, NOW) == []

    def test_ecosystem_signal_fails_without_stars(self):
        thresholds = Thresholds(min_upstream_stars=100)
        candidate = make_candidate(
            downloads=1000, all_time=5000, likes=50,
            upstream=UpstreamMeta(github_repo="a/b", stars=5),
        )
        reasons = mpb.gate_reasons(candidate, thresholds, NOW)
        assert any("ecosystem signal" in r for r in reasons)


class TestKnownCatalog:
    def test_known_ids_and_repos(self):
        ids, repos = mpb.known_catalog()
        assert {"bs_roformer", "htdemucs", "htdemucs_ft", "demucs"} <= ids
        assert "adefossez/htdemucs" in repos


class TestDedupe:
    def test_skips_known_model_id(self):
        candidates = {
            "owner/htdemucs": make_candidate("owner/htdemucs"),
            "owner/newmodel": make_candidate("owner/newmodel"),
        }
        ids, repos = mpb.known_catalog()
        result = mpb.dedupe(candidates, ids, repos, [])
        assert [c.repo_id for c in result] == ["owner/newmodel"]

    def test_skips_known_hf_repo_case_insensitive(self):
        candidates = {
            "ADEFOSSEZ/HTDemucs": make_candidate("ADEFOSSEZ/HTDemucs"),
        }
        ids, repos = mpb.known_catalog()
        assert mpb.dedupe(candidates, ids, repos, []) == []

    def test_skips_covered_by_open_issue(self):
        candidates = {
            "owner/model-a": make_candidate("owner/model-a"),
            "owner/model-b": make_candidate("owner/model-b"),
        }
        open_issues = [
            {"number": 1, "title": "[Model Proposal] model-a (owner/model-a)",
             "body": "", "createdAt": "2026-09-01T00:00:00Z"}
        ]
        ids, repos = mpb.known_catalog()
        result = mpb.dedupe(candidates, ids, repos, open_issues)
        assert [c.repo_id for c in result] == ["owner/model-b"]

    def test_keeps_new_candidate(self):
        candidates = {"owner/model-c": make_candidate("owner/model-c")}
        ids, repos = mpb.known_catalog()
        result = mpb.dedupe(candidates, ids, repos, [])
        assert [c.repo_id for c in result] == ["owner/model-c"]


class TestTemplate:
    def test_title_includes_repo_id(self):
        candidate = make_candidate("owner/model-a")
        title = mpb.build_issue_title(candidate)
        assert title == "[Model Proposal] model-a (owner/model-a)"

    def test_body_contains_required_signals(self):
        candidate = make_candidate(
            "owner/model-a", downloads=1000, all_time=5000, likes=42,
            license="MIT", last_modified=NOW,
            upstream=UpstreamMeta(github_repo="owner/upstream", stars=10),
        )
        body = mpb.build_issue_body(candidate)
        assert "owner/model-a" in body
        assert "https://huggingface.co/owner/model-a" in body
        assert "1000" in body
        assert "5000" in body
        assert "42" in body
        assert "MIT" in body
        assert "abc123" in body
        assert "owner/upstream" in body

    def test_body_contains_maintainer_checklist(self):
        body = mpb.build_issue_body(make_candidate("owner/model-a"))
        for item in [
            "**Load path**", "**CPU/GPU/device support**",
            "**Cloud-provider wiring**", "**Size**", "**License review**",
            "**Tests**",
        ]:
            assert item in body

    def test_body_has_status_marker(self):
        body = mpb.build_issue_body(make_candidate("owner/model-a"))
        assert mpb.STATUS_MARKER in body

    def test_missing_optional_values_render_as_na(self):
        body = mpb.build_issue_body(make_candidate("owner/model-a"))
        assert "n/a" in body


class TestFetchTaskModels:
    def test_uses_pipeline_tag_first(self):
        model = make_model("owner/a", downloads=10)
        api = FakeHfApi(task_models=[model])
        result = mpb.fetch_task_models(api)
        assert result[0].repo_id == "owner/a"
        assert api.calls[0][1].get("pipeline_tag") == mpb.PIPELINE_TAG

    def test_falls_back_on_older_api(self):
        model = make_model("owner/a")

        class OldApi:
            def __init__(self):
                self.calls = []

            def list_models(self, **kwargs):
                self.calls.append(kwargs)
                if "pipeline_tag" in kwargs:
                    raise TypeError("pipeline_tag unsupported in old versions")
                return iter([model])

        api = OldApi()
        result = mpb.fetch_task_models(api)
        assert result[0].repo_id == "owner/a"
        assert api.calls[0].get("pipeline_tag") == mpb.PIPELINE_TAG
        assert "task" in api.calls[1]

    def test_empty_when_no_results(self):
        api = FakeHfApi(task_models=[])
        assert mpb.fetch_task_models(api) == []


class TestFetchHfModel:
    def test_enriches_all_time_downloads(self):
        info = make_model("owner/a", downloads=100, all_time=None)
        expanded = make_model("owner/a", downloads=100, all_time=5000)
        api = FakeHfApi(infos={"owner/a": info}, expand_infos={"owner/a": expanded})
        result = mpb.fetch_hf_model(api, "owner/a")
        assert result.downloads_all_time == 5000

    def test_returns_none_when_missing(self):
        api = FakeHfApi(infos={})
        assert mpb.fetch_hf_model(api, "owner/missing") is None


class TestDiscover:
    def test_combines_task_and_allowlist(self):
        task_model = make_model("owner/task", downloads=100)
        allow_model = make_model("owner/allow", downloads=200, all_time=900)
        api = FakeHfApi(
            task_models=[task_model],
            infos={"owner/allow": allow_model},
            expand_infos={"owner/allow": allow_model},
        )
        upstream = UpstreamMeta(github_repo="org/upstream", stars=50)
        gh = FakeGh(upstream=upstream)
        allowlist = [
            AllowlistProject(name="Proj", github="org/upstream",
                             hf_repos=["owner/allow"])
        ]
        result = mpb.discover(api, gh, allowlist, Thresholds(), NOW)
        assert "owner/task" in result
        assert "owner/allow" in result
        assert result["owner/allow"].source_project == "Proj"
        assert result["owner/allow"].upstream.stars == 50

    def test_allowlist_overrides_task_candidate(self):
        model = make_model("owner/same", downloads=100)
        allow_model = make_model("owner/same", downloads=999, all_time=900)
        api = FakeHfApi(
            task_models=[model],
            infos={"owner/same": allow_model},
            expand_infos={"owner/same": allow_model},
        )
        gh = FakeGh(upstream=UpstreamMeta(github_repo="org/u", stars=50))
        allowlist = [AllowlistProject(name="P", github="org/u",
                                      hf_repos=["owner/same"])]
        result = mpb.discover(api, gh, allowlist, Thresholds(), NOW)
        assert result["owner/same"].hf.downloads_30d == 999


class TestCloseStaleProposals:
    def test_closes_stale_awaiting_triage(self):
        stale = NOW - dt.timedelta(days=120)
        gh = FakeGh(open_issues=[
            {"number": 1, "title": "t", "createdAt": stale.isoformat(),
             "body": mpb.STATUS_MARKER},
        ])
        closed = mpb.close_stale_proposals(gh, "a/b", "model-proposal", 90, NOW)
        assert closed == [1]
        assert gh.calls[0][0] == "close_issue"

    def test_skips_without_status_marker(self):
        stale = NOW - dt.timedelta(days=120)
        gh = FakeGh(open_issues=[
            {"number": 2, "title": "t", "createdAt": stale.isoformat(),
             "body": "no marker"},
        ])
        closed = mpb.close_stale_proposals(gh, "a/b", "model-proposal", 90, NOW)
        assert closed == []
        assert gh.calls == []

    def test_skips_recent_proposal(self):
        gh = FakeGh(open_issues=[
            {"number": 3, "title": "t", "createdAt": NOW.isoformat(),
             "body": mpb.STATUS_MARKER},
        ])
        closed = mpb.close_stale_proposals(gh, "a/b", "model-proposal", 90, NOW)
        assert closed == []

    def test_dry_run_reports_without_closing(self):
        stale = NOW - dt.timedelta(days=200)
        gh = FakeGh(open_issues=[
            {"number": 4, "title": "t", "createdAt": stale.isoformat(),
             "body": mpb.STATUS_MARKER},
        ])
        closed = mpb.close_stale_proposals(gh, "a/b", "model-proposal", 90, NOW,
                                           dry_run=True)
        assert closed == [4]
        assert gh.calls == []


class TestMainDryRun:
    def test_dry_run_files_nothing(self, monkeypatch, capsys):
        model = make_model(
            "owner/model-a", downloads=1000, all_time=5000, likes=50,
            last_modified=NOW,
        )
        api = FakeHfApi(task_models=[model])
        gh = FakeGh()

        monkeypatch.setattr(mpb, "GhClient", lambda: gh)
        monkeypatch.setattr("huggingface_hub.HfApi", lambda: api)

        code = mpb.main([
            "--repo", "owner/repo", "--dry-run", "--allowlist",
            str(mpb.DEFAULT_ALLOWLIST),
        ])
        assert code == 0
        assert gh.calls == []
        out = capsys.readouterr().out
        assert "(dry-run) would file: [Model Proposal] model-a (owner/model-a)" in out

    def test_gate_blocks_below_threshold_candidate(self, monkeypatch, capsys):
        model = make_model("owner/low", downloads=1, likes=0)
        api = FakeHfApi(task_models=[model])
        gh = FakeGh()
        monkeypatch.setattr(mpb, "GhClient", lambda: gh)
        monkeypatch.setattr("huggingface_hub.HfApi", lambda: api)
        mpb.main([
            "--repo", "owner/repo", "--dry-run", "--allowlist",
            str(mpb.DEFAULT_ALLOWLIST),
        ])
        out = capsys.readouterr().out
        assert "would file" not in out
