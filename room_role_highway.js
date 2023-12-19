'use strict';

let Deposits = require('room_components_deposits');
let Fight = require('room_components_fight');
let Observe = require('util_observe');
let PowerBank = require('room_components_powerBank');
let TreasureFleet = require('room_components_treasureFleet');
let Util = require('util_misc');

const DELETED = 'deleted';

function setNextScan(room) {
  if (room.memory.noFarm) {
    // don't scan
    room.logDebug(`(setNextScan) noFarm, nil`);
    Observe.clearNextScan(room.name);
    return;
  }

  if (!room.memory.farmPower) {
    // delete the room. We don't need this one.
    room.memory = {};
    Util.markRoomMemoryForDelete(room.name);
    return DELETED;
  }

  if (room.memory.uncontestedBanks > 10) {
    room.logDebug(`(setNextScan) farming, safe, 50`);
    Observe.setNextScan(room.name, 50);
    return;
  }

  room.logDebug(`(setNextScan) farming, fraught, 25`);
  Observe.setNextScan(room.name, 25);
  return;
}

function run(room) {
  room.logDebug('highway run');
  if (setNextScan(room) == DELETED) {
    return;
  }

  if (room.memory.execute !== undefined) {
    room.logError(`Deleting unnecessary execute.`);
    delete room.memory.execute;
  }

  let portals = room.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_PORTAL});

  if (room.name.isHighwayIntersection()) {
    room.memory.portalPositions = _.map(portals, 'pos');
  } else {
    delete room.memory.portalPositions;
  }

  //Road.checkRoads(room);

  //NoRepair.update(room);

  Deposits.update(room);

  PowerBank.update(room);
  
  TreasureFleet.update(room);

  Fight.update(room);
}

module.exports = {
  run
};