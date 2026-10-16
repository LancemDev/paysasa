"""Thin LLM interface so the agent loop can run against Gemini or a scripted fake in tests."""
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Protocol


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema


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
    def __init__(self, api_key: str, model: str):
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model

    def start_chat(self, *, system: str, history: list[tuple[str, str]], tools: list[ToolSpec]) -> Chat:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=0,
            tools=[types.Tool(function_declarations=[
                types.FunctionDeclaration(name=t.name, description=t.description, parameters_json_schema=t.parameters)
                for t in tools
            ])],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        contents = []
        for user_msg, reply in history:
            contents.append(types.Content(role="user", parts=[types.Part(text=user_msg)]))
            contents.append(types.Content(role="model", parts=[types.Part(text=reply)]))
        chat = self._client.aio.chats.create(model=self._model, config=config, history=contents)
        return _GeminiChat(chat)

    async def complete(self, *, system: str, prompt: str) -> str:
        from google.genai import types

        resp = await self._client.aio.models.generate_content(
            model=self._model,
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system, temperature=0.4),
        )
        return (resp.text or "").strip()


class _GeminiChat:
    def __init__(self, chat):
        self._chat = chat

    async def send(self, content: str | list[ToolResult]) -> LLMTurn:
        from google.genai import types

        if isinstance(content, str):
            message: Any = content
        else:
            message = [
                types.Part(function_response=types.FunctionResponse(id=r.id, name=r.name, response=r.result))
                for r in content
            ]
        resp = await self._chat.send_message(message)
        calls: list[ToolCall] = []
        texts: list[str] = []
        candidate = resp.candidates[0] if resp.candidates else None
        for part in (candidate.content.parts if candidate and candidate.content and candidate.content.parts else []):
            if part.function_call:
                fc = part.function_call
                calls.append(ToolCall(id=fc.id, name=fc.name or "", args=dict(fc.args or {})))
            elif part.text and not part.thought:
                texts.append(part.text)
        return LLMTurn(text="".join(texts).strip() or None, calls=calls)


@lru_cache
def get_llm() -> LLM:
    from app.config import get_settings

    s = get_settings()
    return GeminiLLM(api_key=s.gemini_api_key, model=s.llm_model)
