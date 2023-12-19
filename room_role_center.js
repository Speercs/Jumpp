'use strict';

let Digsite = require('room_components_digsite');
let Road = require('room_components_road');
let Observe = require('util_observe');
let Threat = require('room_components_threat');

function updateDigsites(room) {
  if (!room.memory.digsites) {
    Digsite.init(room);
  }
  
  for (let key in room.memory.digsites) {
    // General digsite stuff.
    Digsite.update(room, key);
  }
}

function run(room) {
  Observe.setNextScan(room.name, 100);

  Threat.getThreatLevel(room);

  // Execute in a center means we're exploiting the sources in the room.
  if (!room.memory.execute) return;

  Road.checkRoads(room);

  updateDigsites(room);

  return;
}

module.exports = {
  run
};