"""The Claude adapter, driven with a fake Anthropic client (no network, no API key)."""
import json

import pytest

from app.agent.llm import (
    CHAT_MAX_TOKENS, DRAFT_MAX_TOKENS, ClaudeLLM, ToolResult, ToolSpec,
)
from app.agent.tools import TOOL_SPECS


class FakeBlock:
    def __init__(self, type: str, **fields):
        self.type = type
        for k, v in fields.items():
            setattr(self, k, v)


class FakeResponse:
    def __init__(self, content):
        self.content = content


class FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self._responses:
            raise AssertionError("the model was called more times than the script expected")
        return self._responses.pop(0)


class FakeClient:
    def __init__(self, responses):
        self.messages = FakeMessages(responses)


def text(t: str) -> FakeBlock:
    return FakeBlock("text", text=t)


def tool_use(tool_id: str, name: str, args: dict) -> FakeBlock:
    return FakeBlock("tool_use", id=tool_id, name=name, input=args)


def llm(client) -> ClaudeLLM:
    return ClaudeLLM(api_key="unused", model="claude-sonnet-5-5", client=client)


async def test_request_shape():
    client = FakeClient([FakeResponse([text("hi")])])
    chat = llm(client).start_chat(
        system="SYSTEM",
        history=[],
        tools=[ToolSpec("find_contact", "Find a contact", {"type": "object", "properties": {}})],
    )
    await chat.send("hello")

    call = client.messages.calls[0]
    assert call["model"] == "claude-sonnet-5-5"
    assert call["system"] == "SYSTEM"
    assert call["max_tokens"] == CHAT_MAX_TOKENS
    assert call["messages"] == [{"role": "user", "content": "hello"}]
    # Anthropic takes the JSON schema under `input_schema`, not `parameters`.
    assert call["tools"] == [{
        "name": "find_contact",
        "description": "Find a contact",
        "input_schema": {"type": "object", "properties": {}},
    }]


async def test_history_is_seeded_as_user_assistant_pairs():
    client = FakeClient([FakeResponse([text("hi")])])
    chat = llm(client).start_chat(
        system="SYSTEM", history=[("earlier", "earlier reply")], tools=[],
    )
    await chat.send("now")
    assert client.messages.calls[0]["messages"] == [
        {"role": "user", "content": "earlier"},
        {"role": "assistant", "content": "earlier reply"},
        {"role": "user", "content": "now"},
    ]


async def test_tool_call_is_parsed():
    client = FakeClient([FakeResponse([text("Looking that up."), tool_use("toolu_1", "find_contact",
                                                                        {"query": "Sarah"})])])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("who is my editor?")

    assert turn.text == "Looking that up."
    assert len(turn.calls) == 1
    call = turn.calls[0]
    assert (call.name, call.args, call.id) == ("find_contact", {"query": "Sarah"}, "toolu_1")


async def test_tool_results_go_back_as_tool_result_blocks():
    client = FakeClient([
        FakeResponse([tool_use("toolu_1", "find_contact", {"query": "Sarah"})]),
        FakeResponse([text("Sarah is your editor.")]),
    ])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("who is my editor?")
    turn2 = await chat.send([ToolResult(name="find_contact", result={"count": 1}, id=turn.calls[0].id)])

    assert turn2.calls == []
    assert turn2.text == "Sarah is your editor."

    messages = client.messages.calls[1]["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant", "user"]
    block = messages[2]["content"][0]
    assert block["type"] == "tool_result"
    assert block["tool_use_id"] == "toolu_1"  # must match the tool_use id
    assert json.loads(block["content"]) == {"count": 1}


async def test_several_tool_results_keep_their_ids():
    client = FakeClient([
        FakeResponse([tool_use("toolu_1", "find_contact", {"query": "a"}),
                      tool_use("toolu_2", "find_contact", {"query": "b"})]),
        FakeResponse([text("done")]),
    ])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("two lookups")
    await chat.send([ToolResult(name="find_contact", result={"n": 1}, id=turn.calls[0].id),
                     ToolResult(name="find_contact", result={"n": 2}, id=turn.calls[1].id)])

    blocks = client.messages.calls[1]["messages"][2]["content"]
    assert [b["tool_use_id"] for b in blocks] == ["toolu_1", "toolu_2"]
    assert [json.loads(b["content"]) for b in blocks] == [{"n": 1}, {"n": 2}]


async def test_tool_error_is_passed_back_as_a_result():
    client = FakeClient([
        FakeResponse([tool_use("toolu_1", "send_invoice", {"amount": "0"})]),
        FakeResponse([text("The amount must be greater than zero.")]),
    ])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("send it")
    await chat.send([ToolResult(name="send_invoice", result={"error": "Amount must be greater than zero."},
                                id=turn.calls[0].id)])
    assert "greater than zero" in client.messages.calls[1]["messages"][2]["content"][0]["content"]


async def test_complete_joins_text_blocks():
    client = FakeClient([FakeResponse([text("  a "), text("b  ")])])
    out = await llm(client).complete(system="SYSTEM", prompt="PROMPT")
    assert out == "a b"
    call = client.messages.calls[0]
    assert call["messages"] == [{"role": "user", "content": "PROMPT"}]
    assert call["max_tokens"] == DRAFT_MAX_TOKENS
    assert "tools" not in call  # a one-shot draft has no tools


async def test_no_text_and_no_calls_is_an_empty_turn():
    client = FakeClient([FakeResponse([])])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("hello")
    assert turn.text is None and turn.calls == []


def test_real_tool_specs_are_valid_anthropic_schemas():
    for spec in TOOL_SPECS:
        assert spec.parameters["type"] == "object"
        assert isinstance(spec.parameters["properties"], dict)
        assert isinstance(spec.parameters["required"], list)
        assert spec.parameters["additionalProperties"] is False
        assert spec.description


async def test_the_real_sdk_accepts_our_request_shape():
    """Serialize through the Anthropic SDK itself, so a schema mistake fails here and not in production."""
    anthropic = pytest.importorskip("anthropic")
    httpx2 = pytest.importorskip("httpx2")

    captured: dict = {}

    def handler(request):
        captured["body"] = json.loads(request.content)
        captured["headers"] = dict(request.headers)
        return httpx2.Response(200, json={
            "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
            "content": [{"type": "text", "text": "ok"}],
            "stop_reason": "end_turn", "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 2},
        })

    tools = [{"name": s.name, "description": s.description, "input_schema": s.parameters} for s in TOOL_SPECS]
    client = anthropic.AsyncAnthropic(
        api_key="sk-test", http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
    )

    await client.messages.create(
        model="claude-sonnet-5-5", max_tokens=1024, system="SYS",
        messages=[{"role": "user", "content": "hi"}], tools=tools,
    )
    body = captured["body"]
    assert captured["headers"]["anthropic-version"] == "2023-06-01"
    assert len(body["tools"]) == len(TOOL_SPECS)
    assert body["tools"][0]["input_schema"]["type"] == "object"

    # The tool_use -> tool_result round trip must serialize too.
    await client.messages.create(
        model="claude-sonnet-5-5", max_tokens=1024, system="SYS",
        messages=[
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": [
                {"type": "tool_use", "id": "toolu_1", "name": "find_contact", "input": {"query": "x"}}]},
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "toolu_1", "content": '{"count": 1}'}]},
        ],
        tools=tools,
    )
    assert [m["role"] for m in captured["body"]["messages"]] == ["user", "assistant", "user"]
