import { expect, it } from "vitest";
import { expectModel, ModelFailure } from "../e2e/helpers";
it("classifies only model assertions with the infra report checker's required name and message prefix", async () => {
  const error = new ModelFailure("bad answer");
  expect(error.name).toBe("ModelFailure");
  expect(error.message).toBe("ModelFailure: bad answer: ");
  await expect(expectModel(async () => { throw new Error("assertion"); }, "wrong answer")).rejects.toMatchObject({ name: "ModelFailure", message: "ModelFailure: wrong answer: assertion" });
  await expect(expectModel(async () => undefined)).resolves.toBeUndefined();
});
