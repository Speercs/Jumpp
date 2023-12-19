'use strict';

let Claimer = require('role_claimer');
let Nav = require('util_nav');
let Sector = require('class_Sector');
let SpawnJob = require('util_spawnJob');

// Refresh safemode timers when there are this many ticks left or fewer.
let MIN_SAFEMODE_TICKS = 40000;

let safeModeEndTime = {};

function getSafeModeEndTime(roomName) {
  return safeModeEndTime[roomName] ;
}

// TODO: Get rid of this
global.bu = function(room) {
  return baseUpdateImpl(room);
}

function baseUpdate(room) {
  try {
    return baseUpdateImpl(room);
  } catch (err) {
    room.logError(`Error in baseUpdateImpl: ${err}`);
  }
}

function roomsAlreadyTargeted() {
  let claimers = _.filter(
      Game.creeps, c => c.memory.role == 'claimer' &&
      c.memory.subRole == 'safemode');
  let rooms = new Set();
  _.forEach(claimers, function(creep) {
    rooms.add(creep.memory.workRoom);
    _.forEach(creep.memory.safemodeRooms, r => rooms.add(r));
  });
  return rooms;
}

function baseUpdateImpl(room) {
  if (numSafemodeClaimers() >= 8) return;
  if (room.sector.invaderCoreState == Sector.CoreState.ALIVE) return;
  if (room.isVault) return;

  let xy = Nav.roomNameToXY(room.name);
  let myRooms = [];
  for (let x = xy[0] - 2; x <= xy[0] + 2; x++) {
    for (let y = xy[1] - 2; y <= xy[1] + 2; y++) {
      let roomName = Nav.getRoomNameFromXY(x, y);
      if (!roomName.isValidRoomName()) continue;
      myRooms.push(roomName);
    }
  }

  let targetedRooms = roomsAlreadyTargeted();
  let needyRooms = [];
  for (let roomName of myRooms) {
    if (Memory.rooms[roomName] &&
        Memory.rooms[roomName].noSafemodeRefresh > Game.time - 100000) continue;
    if (Memory.rooms[roomName] &&
        Memory.rooms[roomName].scout &&
        Memory.rooms[roomName].scout.reserved &&
        Memory.rooms[roomName].scout.reserved.username != MY_USERNAME &&
        Memory.rooms[roomName].scout.reserved.timestamp > Game.time - 5000) continue;
    if (targetedRooms.has(roomName)) continue;
    if (safeModeEndTime[roomName] < Game.time + MIN_SAFEMODE_TICKS) {
      //room.logError(`Adding ${roomName} to needyRooms b/c its safeModeEndTime is ${safeModeEndTime[roomName] - Game.time} ticks away`);
      needyRooms.push(roomName);
    }
  }

  if (needyRooms.length == 0) return;

  room.logDebug(`Sending claimer to refresh safemode in rooms: ${JSON.stringify(needyRooms)}`);
  try {
    sendClaimer(needyRooms, room);
  } catch (err) {
    room.logError(`Error in sendClaimer: ${err}`);
  }
}

function numSafemodeClaimers() {
  return _.filter(Game.creeps, c => c.memory.role == 'claimer' && c.memory.subRole == 'safemode').length;
}

function sendClaimer(roomNames, sourceRoom) {
  if (!roomNames instanceof Array || roomNames.length < 1) return ERR_INVALID_ARGS;

  let firstControllerPos = Nav.findNearestController(sourceRoom.spawns[0].pos, roomNames, 200);

  if (!firstControllerPos) {
    sourceRoom.logError(`Can't reach any controller from among [${JSON.stringify(roomNames)}] ` +
        `with 250 steps.`);
    return;
  }

  let rooms = [sourceRoom.name];
  let model = 30;
  let flag = null;
  let workRoom = firstControllerPos.roomName;
  let additionalMem = {subRole: 'safemode', safemodeRooms: _.without(roomNames, firstControllerPos.roomName)};
  Claimer.requestSpawn(rooms, model, flag, SpawnJob.PRIORITY_HIGH, workRoom, additionalMem);
}

/**
 * Is this a room that we'd like to claim and unclaim immediately?
*/
global.shouldRefreshSafemodeCooldown = function(room) {
  return room &&
      room.memory.role == 'wilderness' &&
      room.controller &&
      room.controller.level == 0 &&
      !(room.controller.safeModeCooldown > MIN_SAFEMODE_TICKS) &&
      (!room.controller.reservation || room.controller.reservation.username == MY_USERNAME);
}

function mineUpdate(room) {
  if (!room.controller) return;
  if (room.my &&
      room.controller.level == 1 &&
      room.memory._refreshSafemodeClaimTimestamp > Game.time - 10) {
    // DANGER DANGER DANGER
    // DANGER DANGER DANGER
    // DANGER DANGER DANGER
    let result = room.controller.unclaim();
    // DANGER DANGER DANGER
    // DANGER DANGER DANGER
    // DANGER DANGER DANGER
    if (result == OK) {
      room.logDebug(`Unclaimed self to refresh safemode.`);
      delete safeModeEndTime[room.name];
      return;
    } else {
      room.logDebug(`Failed to unclaim self to refresh safemode.`);
    }
  }
}

/**
 * Update safeModeEndTime for this room if it's a room on which we'd like to maintain a high safemode cooldown.
 * Don't worry about checking for nearby bases. Bases will dispatch claimers only to nearby rooms. Unused entries
 * in the list are harmless and practically cost-free.
 */
function wildernessUpdate(room) {
  if (!room.controller) return;
  if (room.my &&
      room.controller.level == 1 &&
      room.memory._refreshSafemodeClaimTimestamp > Game.time - 10 &&
      !room.memory.claimController) {
    // DANGER DANGER DANGER
    // DANGER DANGER DANGER
    // DANGER DANGER DANGER
    let result = room.controller.unclaim();
    // DANGER DANGER DANGER
    // DANGER DANGER DANGER
    // DANGER DANGER DANGER
    if (result == OK) {
      room.logDebug(`Unclaimed self to refresh safemode.`);
      delete safeModeEndTime[room.name];
      return;
    } else {
      room.logDebug(`Failed to unclaim self to refresh safemode.`);
    }
  }

  if ((room.controller.level) ||
     (room.reservation && room.reservation.username != MY_USERNAME) ||
     (room.walkableTilesNearController().length == 0)) {
    delete safeModeEndTime[room.name];
    return;
  }
  safeModeEndTime[room.name] = (Game.time + room.controller.safeModeCooldown) || 0;
}

// Temp!
global.sc = function() {
  console.log(_(Game.creeps)
      .filter(c => c.memory.role == 'claimer' && c.memory.subRole == 'safemode')
      .map(c => c.room.link)
      .value());
}

module.exports = {
  baseUpdate,
  getSafeModeEndTime,
  mineUpdate,
  wildernessUpdate,
}