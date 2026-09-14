import assert from "node:assert/strict";
import test from "node:test";

import { inspectSemanticSource } from "../src/contract-layer.mjs";

test("materializes a declaration index with its owning Module", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:order a c:Entity ; c:name "Order" ; c:parent d:orders .
  `);

  assert.equal(result.verification.status, "verified");
  assert.equal(result.effectiveModel.declarationIndex["urn:example:order"].declarationIdentifier, "urn:example:order");
  assert.equal(result.effectiveModel.moduleOwnership["urn:example:order"].ownerModule, "urn:example:orders");
});
