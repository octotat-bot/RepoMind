"""Reranking and answer analysis."""

from __future__ import annotations

from ai.answer import analyse, extract_cited_numbers
from ai.reranker import Candidate, query_terms, rerank
from ai.retrieval import RetrievedChunk


def make_candidate(path: str, content: str, score: float, symbols=None) -> Candidate:
    return Candidate(
        chunk_id=f"id-{path}-{score}",
        file_path=path,
        content=content,
        language="python",
        start_line=1,
        end_line=20,
        symbols=symbols or [],
        vector_score=score,
    )


def test_query_terms_drop_stopwords_and_split_identifiers() -> None:
    terms = query_terms("Where is the verifyToken function defined?")
    assert "verifytoken" in terms
    # camelCase is expanded so it can match "verify" / "token" separately
    assert "verify" in terms
    assert "token" in terms
    assert "the" not in terms
    assert "function" not in terms


def test_symbol_match_outranks_a_stronger_vector_score() -> None:
    """An exact identifier match is evidence embeddings under-weight."""
    candidates = [
        make_candidate("utils/misc.py", "def helper():\n    return 1", 0.62),
        make_candidate(
            "auth/tokens.py",
            "def verify_token(token):\n    return decode(token)",
            0.58,
            symbols=["verify_token"],
        ),
    ]
    ranked = rerank(candidates, "where is verify_token defined", top_k=2)
    assert ranked[0].file_path == "auth/tokens.py"


def test_diversity_lets_a_lower_scoring_file_through() -> None:
    """One large file must not crowd out the rest of the repository."""
    candidates = [
        make_candidate("big.py", f"def handler_{index}(): pass", 0.9 - index * 0.01)
        for index in range(6)
    ] + [make_candidate("other.py", "def handler(): pass", 0.5)]

    ranked = rerank(candidates, "handler", top_k=4, max_per_file=2)
    from collections import Counter

    counts = Counter(candidate.file_path for candidate in ranked)
    # other.py scores below all six big.py chunks and would never survive a
    # naive top-4, so its presence is the whole point of the diversity pass.
    assert "other.py" in counts
    # The cap is soft: big.py backfills the remaining slots rather than
    # returning fewer than top_k, but it no longer takes every slot.
    assert counts["big.py"] < 4
    assert len(ranked) == 4


def test_diversity_backfills_when_short() -> None:
    """If capping leaves fewer than top_k, overflow refills the list."""
    candidates = [
        make_candidate("only.py", f"def f{index}(): pass", 0.9 - index * 0.01)
        for index in range(5)
    ]
    ranked = rerank(candidates, "f", top_k=4, max_per_file=2)
    assert len(ranked) == 4


def test_rerank_handles_empty_input() -> None:
    assert rerank([], "anything", top_k=6) == []


def make_chunk(rank: int, path: str, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=f"chunk-{rank}",
        file_path=path,
        content="def example():\n    return True",
        language="python",
        start_line=10,
        end_line=20,
        symbols=["example"],
        score=score,
        vector_score=score,
        rank=rank,
    )


def test_citation_marker_parsing() -> None:
    assert extract_cited_numbers("See [1] and [2][3].") == {1, 2, 3}
    assert extract_cited_numbers("Combined [1, 4] form.") == {1, 4}
    assert extract_cited_numbers("No citations here.") == set()


def test_analysis_links_citations_to_chunks() -> None:
    chunks = [make_chunk(1, "a.py", 0.8), make_chunk(2, "b.py", 0.7), make_chunk(3, "c.py", 0.6)]
    analysis = analyse("The handler lives in [1] and is called from [3].", chunks)

    assert [citation.number for citation in analysis.citations] == [1, 3]
    assert [citation.file_path for citation in analysis.citations] == ["a.py", "c.py"]
    # Retrieved but uncited files surface as "related" rather than being dropped.
    assert analysis.related_files == ["b.py"]


def test_citations_to_missing_blocks_are_ignored() -> None:
    """A model that hallucinates [9] must not produce a broken citation."""
    analysis = analyse("According to [9] this is true.", [make_chunk(1, "a.py", 0.8)])
    assert analysis.citations == []


def test_confidence_reflects_evidence() -> None:
    strong = analyse("Defined in [1] and [2].", [make_chunk(1, "a.py", 0.85), make_chunk(2, "b.py", 0.82)])
    weak = analyse("I could not find relevant code.", [make_chunk(1, "a.py", 0.2)])

    assert strong.confidence > weak.confidence
    assert 0.0 <= weak.confidence <= 1.0
    assert 0.0 <= strong.confidence <= 1.0


def test_no_context_yields_zero_confidence() -> None:
    analysis = analyse("Anything at all.", [])
    assert analysis.confidence == 0.0
    assert analysis.citations == []
    assert "No indexed chunks" in analysis.reasoning


def test_reasoning_describes_the_retrieval() -> None:
    analysis = analyse("From [1].", [make_chunk(1, "auth.py", 0.9)])
    assert "auth.py" in analysis.reasoning
    assert "retrieved" in analysis.reasoning.lower()


# ── Citation parsing across model quirks ─────────────────────────────────────


def test_citation_forms_models_actually_emit() -> None:
    """Different hosted models bracket citations differently."""
    from ai.answer import extract_cited_numbers

    assert extract_cited_numbers("As shown in [1] and [3].") == {1, 3}
    assert extract_cited_numbers("See [1, 2].") == {1, 2}
    assert extract_cited_numbers("Both [2][4] agree.") == {2, 4}
    # gpt-oss-120b answers with fullwidth brackets.
    assert extract_cited_numbers("According to 【1】 the session prepares it.") == {1}
    assert extract_cited_numbers("Mixed 【2】 and [5].") == {2, 5}


def test_prose_is_not_mistaken_for_a_citation() -> None:
    from ai.answer import extract_cited_numbers

    assert extract_cited_numbers("No sources here.") == set()
    assert extract_cited_numbers("An array like arr[i] is not a citation.") == set()
