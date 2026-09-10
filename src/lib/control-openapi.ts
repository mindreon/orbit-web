/**
 * Pointer only. orbit-web is an OpenAPI consumer of orbit-control.
 * W0 does not fetch this URL or generate a client.
 * See /openapi/consumer.yaml
 */
export const CONTROL_OPENAPI = {
  provider: "orbit-control",
  repository: "https://github.com/mindreon/orbit-control",
  specPath: "openapi/openapi.yaml",
  specUrl:
    "https://github.com/mindreon/orbit-control/blob/main/openapi/openapi.yaml",
} as const;
