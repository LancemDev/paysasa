"""The Gemini adapter, driven with a fake GenAI client (no network, no API key)."""
import json

import pytest

from app.agent.llm import (
    CHAT_MAX_TOKENS, CHAT_TEMPERATURE, DRAFT_MAX_TOKENS, DRAFT_TEMPERATURE,
    GeminiLLM, ToolResult, ToolSpec,
)
from app.agent.tools import TOOL_SPECS


class FakeFunctionCall:
    def __init__(self, name: str, args: dict, id: str | None = None):
        self.name = name
        self.args = args
        self.id = id


class FakePart:
    def __init__(self, text: str | None = None, function_call: FakeFunctionCall | None = None):
        self.text = text
        self.function_call = function_call


class FakeContent:
    def __init__(self, role: str, parts: list):
        self.role = role
        self.parts = parts


class FakeCandidate:
    def __init__(self, content):
        self.content = content


class FakeResponse:
    def __init__(self, parts):
        self.candidates = [FakeCandidate(FakeContent("model", parts))]


class FakeModels:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    async def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": list(contents), "config": config})
        if not self._responses:
            raise AssertionError("the model was called more times than the script expected")
        return self._responses.pop(0)


class FakeAio:
    def __init__(self, responses):
        self.models = FakeModels(responses)


class FakeClient:
    def __init__(self, responses):
        self.aio = FakeAio(responses)


def text(t: str) -> FakePart:
    return FakePart(text=t)


def function_call(call_id: str, name: str, args: dict) -> FakePart:
    return FakePart(function_call=FakeFunctionCall(name, args, call_id))


def llm(client) -> GeminiLLM:
    return GeminiLLM(api_key="unused", model="gemini-flash-latest", client=client)


async def test_request_shape():
    client = FakeClient([FakeResponse([text("hi")])])
    chat = llm(client).start_chat(
        system="SYSTEM",
        history=[],
        tools=[ToolSpec("find_contact", "Find a contact", {"type": "object", "properties": {}})],
    )
    await chat.send("hello")

    call = client.aio.models.calls[0]
    assert call["model"] == "gemini-flash-latest"
    assert call["config"].system_instruction == "SYSTEM"
    assert call["config"].max_output_tokens == CHAT_MAX_TOKENS
    assert call["config"].temperature == CHAT_TEMPERATURE
    assert len(call["contents"]) == 1
    assert call["contents"][0].role == "user"
    assert call["contents"][0].parts[0].text == "hello"
    # Gemini takes the JSON schema under `parameters_json_schema`, not `parameters`.
    declarations = call["config"].tools[0].function_declarations
    assert len(declarations) == 1
    assert declarations[0].name == "find_contact"
    assert declarations[0].description == "Find a contact"
    assert declarations[0].parameters_json_schema == {"type": "object", "properties": {}}


async def test_history_is_seeded_as_user_model_pairs():
    client = FakeClient([FakeResponse([text("hi")])])
    chat = llm(client).start_chat(
        system="SYSTEM", history=[("earlier", "earlier reply")], tools=[],
    )
    await chat.send("now")
    contents = client.aio.models.calls[0]["contents"]
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert [c.parts[0].text for c in contents] == ["earlier", "earlier reply", "now"]


async def test_no_tools_sends_no_tools():
    client = FakeClient([FakeResponse([text("hi")])])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    await chat.send("hello")
    assert client.aio.models.calls[0]["config"].tools is None


async def test_tool_call_is_parsed():
    client = FakeClient([FakeResponse([text("Looking that up."), function_call("call_1", "find_contact",
                                                                               {"query": "Sarah"})])])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("who is my editor?")

    assert turn.text == "Looking that up."
    assert len(turn.calls) == 1
    call = turn.calls[0]
    assert (call.name, call.args, call.id) == ("find_contact", {"query": "Sarah"}, "call_1")


async def test_tool_results_go_back_as_function_response_parts():
    client = FakeClient([
        FakeResponse([function_call("call_1", "find_contact", {"query": "Sarah"})]),
        FakeResponse([text("Sarah is your editor.")]),
    ])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("who is my editor?")
    turn2 = await chat.send([ToolResult(name="find_contact", result={"count": 1}, id=turn.calls[0].id)])

    assert turn2.calls == []
    assert turn2.text == "Sarah is your editor."

    contents = client.aio.models.calls[1]["contents"]
    assert [c.role for c in contents] == ["user", "model", "user"]
    part = contents[2].parts[0]
    assert part.function_response.name == "find_contact"
    assert part.function_response.id == "call_1"  # must match the function_call id
    assert part.function_response.response == {"count": 1}


async def test_several_tool_results_keep_their_ids():
    client = FakeClient([
        FakeResponse([function_call("call_1", "find_contact", {"query": "a"}),
                      function_call("call_2", "find_contact", {"query": "b"})]),
        FakeResponse([text("done")]),
    ])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("two lookups")
    await chat.send([ToolResult(name="find_contact", result={"n": 1}, id=turn.calls[0].id),
                     ToolResult(name="find_contact", result={"n": 2}, id=turn.calls[1].id)])

    parts = client.aio.models.calls[1]["contents"][2].parts
    assert [p.function_response.id for p in parts] == ["call_1", "call_2"]
    assert [p.function_response.response for p in parts] == [{"n": 1}, {"n": 2}]


async def test_tool_error_is_passed_back_as_a_result():
    client = FakeClient([
        FakeResponse([function_call("call_1", "send_invoice", {"amount": "0"})]),
        FakeResponse([text("The amount must be greater than zero.")]),
    ])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("send it")
    await chat.send([ToolResult(name="send_invoice", result={"error": "Amount must be greater than zero."},
                                id=turn.calls[0].id)])
    part = client.aio.models.calls[1]["contents"][2].parts[0]
    assert "greater than zero" in part.function_response.response["error"]


async def test_model_turn_is_kept_verbatim_for_thought_signatures():
    client = FakeClient([
        FakeResponse([function_call("call_1", "find_contact", {"query": "Sarah"})]),
        FakeResponse([text("done")]),
    ])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("who is my editor?")
    await chat.send([ToolResult(name="find_contact", result={"count": 1}, id=turn.calls[0].id)])

    # The exact object the SDK returned goes back into the contents, not a rebuilt one.
    model_turn = client.aio.models.calls[1]["contents"][1]
    assert model_turn.role == "model"
    assert model_turn.parts[0].function_call.id == "call_1"


async def test_complete_joins_text_parts():
    client = FakeClient([FakeResponse([text("  a "), text("b  ")])])
    out = await llm(client).complete(system="SYSTEM", prompt="PROMPT")
    assert out == "a b"
    call = client.aio.models.calls[0]
    assert call["contents"][0].parts[0].text == "PROMPT"
    assert call["config"].max_output_tokens == DRAFT_MAX_TOKENS
    assert call["config"].temperature == DRAFT_TEMPERATURE
    assert call["config"].tools is None  # a one-shot draft has no tools


async def test_no_text_and_no_calls_is_an_empty_turn():
    client = FakeClient([FakeResponse([])])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("hello")
    assert turn.text is None and turn.calls == []


async def test_blocked_response_is_an_empty_turn():
    client = FakeClient([type("Resp", (), {"candidates": []})()])
    chat = llm(client).start_chat(system="SYSTEM", history=[], tools=[])
    turn = await chat.send("hello")
    assert turn.text is None and turn.calls == []


def test_real_tool_specs_are_valid_gemini_schemas():
    for spec in TOOL_SPECS:
        assert spec.parameters["type"] == "object"
        assert isinstance(spec.parameters["properties"], dict)
        assert isinstance(spec.parameters["required"], list)
        assert spec.parameters["additionalProperties"] is False
        assert spec.description


async def test_the_real_sdk_accepts_our_request_shape():
    """Serialize through the GenAI SDK itself, so a schema mistake fails here and not in production."""
    genai = pytest.importorskip("google.genai")
    httpx = pytest.importorskip("httpx")
    from google.genai import types

    captured: dict = {}

    def handler(request):
        captured["body"] = json.loads(request.content)
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, json={
            "candidates": [{
                "content": {"role": "model", "parts": [{"text": "ok"}]},
                "finishReason": "STOP",
                "index": 0,
            }],
        })

    tools = [types.Tool(function_declarations=[
        types.FunctionDeclaration(name=s.name, description=s.description, parameters_json_schema=s.parameters)
        for s in TOOL_SPECS
    ])]
    client = genai.Client(
        api_key="test-key",
        http_options=types.HttpOptions(httpx_async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler))),
    )

    await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=[types.Content(role="user", parts=[types.Part(text="hi")])],
        config=types.GenerateContentConfig(system_instruction="SYS", max_output_tokens=1024, tools=tools),
    )
    body = captured["body"]
    assert "x-goog-api-key" in {k.lower() for k in captured["headers"]}
    # The SDK passes parameters_json_schema through to the API unchanged.
    declarations = body["tools"][0]["functionDeclarations"]
    assert len(declarations) == len(TOOL_SPECS)
    assert declarations[0]["parameters_json_schema"]["type"] == "object"
    assert body["systemInstruction"]["parts"][0]["text"] == "SYS"

    # The function_call -> function_response round trip must serialize too.
    await client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=[
            types.Content(role="user", parts=[types.Part(text="hi")]),
            types.Content(role="model", parts=[
                types.Part(function_call=types.FunctionCall(id="call_1", name="find_contact",
                                                            args={"query": "x"}))]),
            types.Content(role="user", parts=[
                types.Part(function_response=types.FunctionResponse(id="call_1", name="find_contact",
                                                                    response={"count": 1}))]),
        ],
        config=types.GenerateContentConfig(system_instruction="SYS", max_output_tokens=1024, tools=tools),
    )
    assert [c["role"] for c in captured["body"]["contents"]] == ["user", "model", "user"]
