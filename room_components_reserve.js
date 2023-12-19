'use strict';

let Claimer = require('role_claimer');
let SpawnJob = require('util_spawnJob');
let Nav = require('util_nav');

function shouldReserve(room) {
  if (!room.controller || room.controller.level) {
    return false;
  }

  if (!room.memory.claimController &&
      room.controller.reservation &&
      room.controller.reservation.ticksToEnd >= 500) {
    return false;
  }

  if (_.find(room.ownedCreeps, c => c.memory.role == 'claimer')) {
    return false;
  }

  if (_.filter(room.hostileCreeps, 'boosted').length) {
    return false;
  }

  if (room.memory.role == 'mine' ||
      room.memory.reserve ||
      room.memory.claimController) {
    return true;
  }

  if (room.controller.sign &&
      room.controller.sign.username == 'Screeps' &&
      room.controller.sign.text.startsWith('A new Novice') &&
      room.sector &&
      (room.sector.myBases.length > 1 ||
          (room.sector.myBases.length && room.sector.memory.blockNoviceZones)) &&
      room.controller.room.find(FIND_SOURCES).length == 2 &&
      room.walkableTilesNearController().length > 0 &&
      !(room.memory.unreachable > Game.time - 1000000)) {
    return true;
  }

  return false;
}

function findClaimerSourceRoom(room) {
  return Game.rooms[room.memory.base] ||
      Game.rooms[room.memory.sourceRoom] ||
      Game.rooms[room.memory.claimerSource] ||
      Nav.getNearestBaseManhattan(room.name);
}

function update(room) {
  if (!shouldReserve(room)) {
    return;
  }

  let sourceRoom = findClaimerSourceRoom(room);

  if (!sourceRoom) {
    room.logError(`Failed to find sourceRoom for claimer.`);
    return;
  }
  
  let rooms = [sourceRoom.name];
  let model =
      room.memory.claimController ? 1 : Claimer.currentModel(sourceRoom.energyCapacityAvailable);
  let flag = null;
  let workRoom = room.name;
  let result = Claimer.requestSpawn(rooms, model, flag, SpawnJob.PRIORITY_HIGH, workRoom);
  room.logDebug(`Ordering claimer, result = ${result}`);
}

module.exports = {
  update,
}