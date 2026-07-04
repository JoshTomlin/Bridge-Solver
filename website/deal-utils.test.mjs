import assert from "node:assert/strict";

import {
  complementaryDefenderBounds,
  highCardPoints
} from "./deal-utils.js";

const east = "Q5.T65.T865.J985";
const west = "432.J987.J97.T76";

assert.equal(highCardPoints(east), 3);
assert.equal(highCardPoints(west), 2);

const westBounds = complementaryDefenderBounds({
  minS: 2, maxS: 4,
  minH: 3, maxH: 5,
  minD: 0, maxD: 13,
  minC: 0, maxC: 13,
  minHcp: 2, maxHcp: 4
}, east, west);

assert.deepEqual(westBounds, {
  minS: 1, maxS: 3,
  minH: 2, maxH: 4,
  minD: 0, maxD: 7,
  minC: 0, maxC: 7,
  minHcp: 1, maxHcp: 3
});

console.log("Deal utility tests passed.");
