"""Answers explain instead of pasting, and state only what the passages support."""
import pytest

from app.services import answer_check, llm
from app.services.retrieval import RetrievedChunk

BROCHURE = (
    "Debt resolution includes restructuring of tenor and covenants, one-time settlements, "
    "interest rate renegotiation, rescheduling of repayments, cash-flow-linked repayments, "
    "mediation with lenders, stressed asset advisory and turnaround planning."
)
REPORT = "Revenue reached $412 million, up 9% year on year. Headcount was 4,820 at the end of the quarter."
SOURCES = [RetrievedChunk("S1", 0, BROCHURE, 5, 5, 0.9), RetrievedChunk("S2", 1, REPORT, 1, 1, 0.8)]


def _problems(answer, question="What is in it?"):
    return [problem.kind for problem in answer_check.review(answer, SOURCES, question, llm.NOT_FOUND_ANSWER)]


def test_a_pasted_list_is_caught():
    pasted = (
        "Debt resolution includes restructuring of tenor and covenants, one-time settlements, "
        "interest rate renegotiation and more. [S1]"
    )
    assert _problems(pasted) == ["copied"]


def test_an_explanation_in_own_words_passes():
    explained = (
        "When a company struggles to repay, the firm helps it **agree new terms** with lenders, "
        "such as longer repayment periods or a one-off settlement. [S1]"
    )
    assert _problems(explained) == []


def test_a_short_quote_is_allowed():
    assert _problems('It calls this "stressed asset advisory and turnaround planning". [S1]') == []


def test_a_figure_missing_from_the_sources_is_caught():
    assert _problems("Revenue reached $415 million. [S2]") == ["figures"]


def test_figures_match_however_they_are_written():
    assert _problems("Revenue was 412 million dollars, up 9 %, with 4820 staff. [S2]") == []


def test_numbers_from_the_question_list_markers_and_citations_are_not_figures():
    answer = "1. Revenue grew 9%. [S2]\n2. Staff numbered 4,820. [S2][S1]"
    assert _problems(answer, question="Give me 5 points") == []
    assert _problems("Five points: revenue grew 9 percent. [S2]", question="Give me 5 points") == []


def test_an_answer_without_sources_is_caught():
    assert _problems("Revenue grew this year.") == ["uncited"]


def test_not_found_and_empty_answers_are_left_alone():
    assert _problems(llm.NOT_FOUND_ANSWER) == []
    assert _problems("   ") == []


def test_problems_become_instructions():
    text = answer_check.describe(answer_check.review("Revenue was $999 million.", SOURCES))
    assert "999" in text and "[S1]" in text


@pytest.fixture()
def drafts(monkeypatch):
    """Scripted model replies; records each request."""
    sent = []

    def use(*replies):
        queue = list(replies)

        def fake(system, message, long_running=False):
            sent.append(message)
            reply = queue.pop(0)
            if isinstance(reply, BaseException):
                raise reply
            return llm.Answer(reply, "fake", "fake-model")

        monkeypatch.setattr(llm, "generate_text", fake)
        return sent

    return use


def test_a_clean_draft_costs_one_call(drafts):
    sent = drafts("Revenue grew 9% to $412 million. [S2]")
    answer = llm.generate_answer("How did revenue do?", SOURCES)
    assert len(sent) == 1 and answer.revised is False


def test_a_failing_draft_is_rewritten_once(drafts):
    sent = drafts("Revenue reached $500 million. [S2]", "Revenue reached $412 million. [S2]")
    answer = llm.generate_answer("How did revenue do?", SOURCES)
    assert len(sent) == 2
    assert answer.text == "Revenue reached $412 million. [S2]" and answer.revised is True
    assert "500" in sent[1] and "<draft>" in sent[1]


def test_a_rewrite_that_is_no_better_is_not_used(drafts):
    sent = drafts("Revenue reached $500 million. [S2]", "Revenue reached $600 million. [S2]")
    answer = llm.generate_answer("How did revenue do?", SOURCES)
    assert len(sent) == 2 and answer.text == "Revenue reached $500 million. [S2]"


def test_a_failed_rewrite_keeps_the_draft(drafts):
    drafts("Revenue reached $500 million. [S2]", llm.AnswerServiceError("busy"))
    assert llm.generate_answer("How did revenue do?", SOURCES).text == "Revenue reached $500 million. [S2]"


def test_the_model_is_told_to_check_before_writing():
    assert "Check every point you plan to make against the sources" in llm.SYSTEM_INSTRUCTION


def test_labels_and_trailing_zeros_are_not_false_alarms():
    sources = [RetrievedChunk("S1", 0, "The margin was 22.0 percent in the fourth quarter of 2026.", 1, 1, 0.9)]
    answer = "Q4 margin was 22 % in 2026. [S1]"
    assert answer_check.review(answer, sources, "How was Q4?") == []
    assert [p.kind for p in answer_check.review("Q4 margin was 23 %. [S1]", sources)] == ["figures"]
