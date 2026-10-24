"""Small, dependency-free response hardening for the API."""
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_SENSITIVE_PREFIXES = ("/api/", "/dev/")


class SecurityHeadersMiddleware:
    """Add browser protections to every response.

    The API returns personal and financial data, so authenticated responses are
    also marked `no-store`: a shared browser or proxy must not cache them.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        request_headers = Headers(scope=scope)
        forwarded_proto = request_headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
        is_https = scope.get("scheme") == "https" or forwarded_proto == "https"

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "no-referrer")
                headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
                headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
                if path.startswith(_SENSITIVE_PREFIXES):
                    headers.setdefault("Cache-Control", "no-store")
                if is_https:
                    headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
            await send(message)

        await self.app(scope, receive, send_with_headers)
