"""Token estimate and history trimming."""
from app.services.ai_budget import (
    COMPACT_TOOL_RESULT_CHARS,
    estimate_tokens,
    fit_history,
    messages_tokens,
)


def test_greek_costs_more_tokens_per_character_than_english():
    assert estimate_tokens("a" * 100) == 25
    assert estimate_tokens("α" * 100) == 50


def _user(text):
    return {"role": "user", "content": text}


def _assistant(text):
    return {"role": "assistant", "content": text}


def test_history_that_fits_is_untouched():
    history = [_user("hi"), _assistant("hello"), _user("again")]
    kept, dropped = fit_history(history, 10_000)
    assert kept == history
    assert dropped == 0


def test_oldest_turns_are_dropped_first_and_the_latest_is_kept():
    big = "x" * 4000
    history = [_user(big), _assistant("a"), _user(big), _assistant("b"), _user("latest")]
    kept, dropped = fit_history(history, 1500)

    assert dropped >= 1
    assert kept[-1] == _user("latest")
    assert messages_tokens(kept) <= 1500 or len(kept) == 1


def test_the_latest_turn_is_kept_even_if_it_alone_exceeds_the_budget():
    kept, dropped = fit_history([_user("old"), _user("y" * 10_000)], 10)
    assert len(kept) == 1 and dropped == 1


def test_old_tool_results_are_compacted_before_turns_are_dropped():
    long_result = "r" * 5000
    turn = [
        _user("q"),
        {"role": "assistant", "content": None, "tool_calls": [{"id": "1"}]},
        {"role": "tool", "tool_call_id": "1", "content": long_result},
        _assistant("answer"),
    ]
    history = [*turn, *turn, *turn, _user("now")]
    kept, _ = fit_history(history, 1_000_000)

    tool_contents = [m["content"] for m in kept if m["role"] == "tool"]
    assert len(tool_contents[0]) < len(long_result)
    assert tool_contents[0].startswith("r" * COMPACT_TOOL_RESULT_CHARS)
    assert tool_contents[-1] == long_result  # recent turns stay intact


def test_list_content_is_counted_without_crashing():
    msg = {"role": "system", "content": [{"type": "text", "text": "hello"}]}
    assert messages_tokens([msg]) > 4
