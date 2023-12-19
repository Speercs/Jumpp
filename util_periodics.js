'use strict';

let RoomBase = require('room_role_base_base');

function do10(base) {
  RoomBase.do10(base);
}

function do100(base) {
  RoomBase.do100(base);
}

function do839(base) {
  RoomBase.do839(base);
}

function doCycle(period, f) {
  // Special case for only one base.
  if (Game.bases.length == 1) {
    if (Game.time % period == 0) {
      f(Game.bases[0]);
    }
    return;
  }

  let key = `p${period}`;
  let p1 = Game.time % period / period;

  if (!Memory._periodics[key]) {
    Memory._periodics[key] = {p0: p1};
  }
  let n0 = Math.floor(Memory._periodics[key].p0 * Game.bases.length);
  let n1 = Math.floor(p1 * Game.bases.length);

  for (let i = n0; i != n1; i = (i+1) % Game.bases.length) {
    f(Game.bases[i]);
  }
  Memory._periodics[key].p0 = p1;
}
  
exports.update = function() {
  if (!Game.bases.length) return;

  if (!Memory._periodics) {
    Memory._periodics = {};
  }

  doCycle(10, do10);
  doCycle(100, do100);
  doCycle(839, do839);
}