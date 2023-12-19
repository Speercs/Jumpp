'use strict';

let Alert = require('util_alert');


let lastHitsCache = {};
let lastHitsCacheCheck = Game.time;

function cleanCache() {
  if (lastHitsCacheCheck == Game.time) {
    return;
  }

  for (let key in lastHitsCache) {
    if (!Game.getObjectById(key)) {
      delete lastHitsCache[key];
    }
  }
  lastHitsCacheCheck = Game.time;
}
