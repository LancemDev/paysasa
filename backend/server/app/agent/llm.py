"""Thin LLM interface so the agent loop can run against Gemini or a scripted fake in tests.

The Gemini adapter speaks the Google GenAI API: a system instruction plus a list of contents, and
tools declared as function declarations from a JSON Schema. Gemini answers with `function_call`
parts; we run the tools and send the results back as `function_response` parts.
"""
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Protocol

from google import genai
from google.genai import types

CHAT_MAX_TOKENS = 4096
DRAFT_MAX_TOKENS = 512
CHAT_TEMPERATURE = 0.0
DRAFT_TEMPERATURE = 0.4


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema, sent to Gemini as `parameters_json_schema`


@dataclass
class ToolCall:
    name: str
    args: dict[str, Any]
    id: str | None = None


@dataclass
class ToolResult:
    name: str
    result: dict[str, Any]
    id: str | None = None


@dataclass
class LLMTurn:
    text: str | None
    calls: list[ToolCall] = field(default_factory=list)


class Chat(Protocol):
    async def send(self, content: str | list[ToolResult]) -> LLMTurn: ...


class LLM(Protocol):
    def start_chat(self, *, system: str, history: list[tuple[str, str]], tools: list[ToolSpec]) -> Chat: ...

    async def complete(self, *, system: str, prompt: str) -> str: ...


class GeminiLLM:
    """Gemini behind the LLM protocol.

    `client` is injectable so the tests can drive the adapter without the GenAI SDK client.
    """

    def __init__(
        self,
        api_key: str = "",
        model: str = "",
        *,
        max_tokens: int = CHAT_MAX_TOKENS,
        client: Any = None,
    ):
        if client is None:
            client = genai.Client(api_key=api_key)
        self._client = client
        self._model = model
        self._max_tokens = max_tokens

    def start_chat(self, *, system: str, history: list[tuple[str, str]], tools: list[ToolSpec]) -> Chat:
        return _GeminiChat(
            self._client, self._model, self._max_tokens,
            system=system, history=history, tools=tools,
        )

    async def complete(self, *, system: str, prompt: str) -> str:
        """One-shot completion with no tools, used for the overdue reminder draft."""
        resp = await self._client.aio.models.generate_content(
            model=self._model,
            contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=DRAFT_MAX_TOKENS,
                temperature=DRAFT_TEMPERATURE,
            ),
        )
        return "".join(_part_texts(resp)).strip()


def _part_texts(resp: Any) -> list[str]:
    texts: list[str] = []
    if not getattr(resp, "candidates", None):
        return texts
    content = resp.candidates[0].content
    for part in getattr(content, "parts", None) or []:
        if getattr(part, "text", None):
            texts.append(part.text)
    return texts


class _GeminiChat:
    def __init__(self, client, model, max_tokens, *, system, history, tools):
        self._client = client
        self._model = model
        self._max_tokens = max_tokens
        self._system = system
        self._contents: list[types.Content] = []
        for user_msg, reply in history:
            self._contents.append(types.Content(role="user", parts=[types.Part(text=user_msg)]))
            self._contents.append(types.Content(role="model", parts=[types.Part(text=reply)]))
        self._tools = None
        if tools:
            declarations = [
                types.FunctionDeclaration(name=t.name, description=t.description, parameters_json_schema=t.parameters)
                for t in tools
            ]
            self._tools = [types.Tool(function_declarations=declarations)]

    def _config(self) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            system_instruction=self._system,
            max_output_tokens=self._max_tokens,
            temperature=CHAT_TEMPERATURE,
            tools=self._tools,
        )

    async def send(self, content: str | list[ToolResult]) -> LLMTurn:
        if isinstance(content, str):
            self._contents.append(types.Content(role="user", parts=[types.Part(text=content)]))
        else:
            # Every function_call id from the previous turn needs a function_response, in the same order.
            self._contents.append(types.Content(
                role="user",
                parts=[
                    types.Part(function_response=types.FunctionResponse(
                        name=r.name, id=r.id, response=r.result,
                    ))
                    for r in content
                ],
            ))

        resp = await self._client.aio.models.generate_content(
            model=self._model,
            contents=list(self._contents),
            config=self._config(),
        )
        # Keep the model turn verbatim: function_call ids and thought signatures inside it
        # must match the next function_response.
        candidate = resp.candidates[0] if getattr(resp, "candidates", None) else None
        reply_content = candidate.content if candidate else None
        if reply_content is not None:
            self._contents.append(reply_content)

        calls: list[ToolCall] = []
        texts: list[str] = []
        for part in (getattr(reply_content, "parts", None) or []):
            fc = getattr(part, "function_call", None)
            if fc is not None:
                calls.append(ToolCall(name=fc.name, args=dict(fc.args or {}), id=getattr(fc, "id", None)))
            elif getattr(part, "text", None):
                texts.append(part.text)
        return LLMTurn(text="".join(texts).strip() or None, calls=calls)


@lru_cache
def get_llm() -> LLM:
    from app.config import get_settings

    s = get_settings()
    return GeminiLLM(api_key=s.gemini_api_key, model=s.llm_model)
