"""Per-request user token — set by SSE middleware, read by client."""
import contextvars

user_token_var: contextvars.ContextVar[str] = contextvars.ContextVar("user_token", default="")
