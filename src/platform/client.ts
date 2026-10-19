import { createApiClient } from "../api/client";
import { defaultIdentity } from "./identity";

export const api = createApiClient({ credentials: {
  token: () => defaultIdentity.credentials.token(),
  tenant: () => defaultIdentity.credentials.tenant(),
  unauthorized: () => defaultIdentity.credentials.unauthorized(),
} });
