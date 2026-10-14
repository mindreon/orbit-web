import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

/** Reject the old task-centre contract before openapi-typescript can overwrite v2 types. */
export function validateV2Spec(source) {
  const spec = parse(source);
  if (typeof spec?.openapi !== "string" || !/^3\.1\.\d+$/.test(spec.openapi)) {
    throw new Error("gen-api: v2 requires OpenAPI 3.1.x");
  }
  if (typeof spec.info?.version !== "string" || !spec.info.version.startsWith("2.")) {
    throw new Error("gen-api: info.version must start with 2.; wait for the WP1 v2 contract");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateV2Spec(readFileSync(process.argv[2], "utf8"));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
