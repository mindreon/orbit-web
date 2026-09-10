/**
 * Pointer only. orbit-web is an OpenAPI consumer of orbit-control.
 * W0 does not fetch this URL or generate a client.
 * See /openapi/consumer.yaml
 */
export const CONTROL_OPENAPI = {
  provider: "orbit-control",
  repository: "https://github.com/mindreon/orbit-control",
  specPath: "docs/openapi.yaml",
  specUrl:
    "https://github.com/mindreon/orbit-control/blob/main/docs/openapi.yaml",
  runtimeUrl: process.env.NEXT_PUBLIC_CONTROL_URL ?? "http://127.0.0.1:8080",
} as const;
