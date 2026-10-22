"""Thin LLM interface so the agent loop can run against Claude or a scripted fake in tests.

The Claude adapter speaks the Anthropic Messages API: a system prompt plus a list of messages, and
tools declared with a JSON Schema in `input_schema`. Claude answers with `tool_use` blocks; we run
the tools and send the results back as `tool_result` blocks.
"""
import json
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Protocol

CHAT_MAX_TOKENS = 4096
DRAFT_MAX_TOKENS = 512
CHAT_TEMPERATURE = 0.0
DRAFT_TEMPERATURE = 0.4


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema, sent to Claude as `input_schema`


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


class ClaudeLLM:
    """Claude behind the LLM protocol.

    `client` is injectable so the tests can drive the adapter without the Anthropic SDK.
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
            import anthropic

            client = anthropic.AsyncAnthropic(api_key=api_key)
        self._client = client
        self._model = model
        self._max_tokens = max_tokens

    def start_chat(self, *, system: str, history: list[tuple[str, str]], tools: list[ToolSpec]) -> Chat:
        return _ClaudeChat(
            self._client, self._model, self._max_tokens,
            system=system, history=history, tools=tools,
        )

    async def complete(self, *, system: str, prompt: str) -> str:
        """One-shot completion with no tools, used for the overdue reminder draft."""
        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=DRAFT_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(b.text for b in resp.content if b.type == "text").strip()


class _ClaudeChat:
    def __init__(self, client, model, max_tokens, *, system, history, tools):
        self._client = client
        self._model = model
        self._max_tokens = max_tokens
        self._system = system
        self._messages: list[dict] = []
        for user_msg, reply in history:
            self._messages.append({"role": "user", "content": user_msg})
            self._messages.append({"role": "assistant", "content": reply})
        self._tools = [
            {"name": t.name, "description": t.description, "input_schema": t.parameters}
            for t in tools
        ]

    async def send(self, content: str | list[ToolResult]) -> LLMTurn:
        if isinstance(content, str):
            self._messages.append({"role": "user", "content": content})
        else:
            # Every tool_use id from the previous turn needs a tool_result, in the same order.
            self._messages.append({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": r.id,
                        "content": json.dumps(r.result, default=str),
                    }
                    for r in content
                ],
            })

        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            system=self._system,
            messages=list(self._messages),
            tools=self._tools,
        )
        # Keep the assistant turn verbatim: the tool_use ids inside it must match the next tool_result.
        self._messages.append({"role": "assistant", "content": resp.content})

        calls: list[ToolCall] = []
        texts: list[str] = []
        for block in resp.content:
            if block.type == "tool_use":
                calls.append(ToolCall(name=block.name, args=dict(block.input or {}), id=block.id))
            elif block.type == "text":
                texts.append(block.text)
        return LLMTurn(text="".join(texts).strip() or None, calls=calls)


@lru_cache
def get_llm() -> LLM:
    from app.config import get_settings

    s = get_settings()
    return ClaudeLLM(api_key=s.anthropic_api_key, model=s.llm_model)
