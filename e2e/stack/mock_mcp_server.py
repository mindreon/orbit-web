"""A stdio MCP server with one tool, for the task-configuration E2E (E24-E27).

The worker starts it from a connector's command. It runs on the worker's own Python, so it uses the `mcp` package the
runtime already depends on. It prints nothing on stdout but the protocol.
"""

from mcp.server.fastmcp import FastMCP

server = FastMCP("orbit-e2e-docs")


@server.tool()
def docs_lookup(query: str) -> str:
    """Look a term up in the e2e docs."""
    return f"docs:{query}"


if __name__ == "__main__":
    server.run(transport="stdio")
