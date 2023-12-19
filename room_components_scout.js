'use strict';

let Alert = require('util_alert');
let Destroy = require('room_components_destroy');
let Observe = require('util_observe');
let Reduce = require('room_components_reduce');


function update(room) {
  try {
    updateImpl(room);
  } catch (err) {
    room.logError(`Error in Scout.update: ${err}`);
  }
}

function shouldNotify(room) {
  if (Game.time < room.memory.scout.silence) return false;

  // Her stuff is noisy. Notify only when it dies.
  if (room.controller.level > 0 && room.controller.owner.username == 'anisoptera') return false;

  // His too
  if (room.controller.level > 0 &&
    room.controller.level < 3 &&
    room.controller.owner.username == 'iceburg') return false;

  // His too
  if (room.controller.level > 0 &&
      room.controller.level < 3 &&
      room.controller.owner.username == '0xDEADFEED') return false;

  // Always notify about Overmind.
  if (room.isOvermindBase) return true;

  // Deadfeed does room-claiming operations to head off novice zones. Ignore these.
  if (room.memory.scout.maxLevel < 3 &&
      room.controller.level < 3 &&
      room.memory.scout.owner == '0xDEADFEED' &&
      room.controller.sign &&
      room.controller.sign.username == 'Screeps' &&
      room.controller.sign.text.startsWith('A new Novice')) {
    return false;
  }

  return true;
}

function shouldHarass(room) {
  if (room.memory.harass || room.memory.destroy) return false;

  if (!room.hostileCreeps.length) return false;

  if (room.controller.owner && isFriendly(room.controller.owner.username)) return false;

  if (room.controller.owner && NEIGHBORS.includes(room.controller.owner.username)) return false;

  if (room &&
      room.controller &&
      room.controller.owner &&
      room.newHostileBasesForbidden() &&
      room.controller.level < 5) {
    return true;
  }
  return false;
}

function updateImpl(room) {
  if (!room.controller) {
    delete room.memory.scout;
    return;
  }
  
  if (room.controller.owner && (room.controller.owner.username == MY_USERNAME)) {
    if (room.memory.scout) {
      delete room.memory.scout;
    }
    return;
  }

  if (!room.memory.scout) {
    room.memory.scout = {};
  }

  if (room.controller.level && room.memory.scout.maxLevel === undefined) {
    room.memory.scout.maxLevel = room.controller.level;
    room.logError(`Initializing maxLevel to ${room.memory.scout.maxLevel}`);
  }

  if (room.memory.scout.level != room.controller.level) {
    if (shouldHarass(room)) {
      let harassMessage = `Auto-harassing ${room.controller.owner.username} room ${room.name}`;
      room.logError(harassMessage);
      Game.notify(harassMessage);
      room.memory.harass = {};
    }

    if (Reduce.shouldReduce(room)) {
      let reduceMessage = `Auto-reducing ${room.controller.owner.username} room ${room.name}`;
      room.logError(reduceMessage);
      Game.notify(reduceMessage);
      room.memory.reduce = {};
      room.memory.execute = true;
      Observe.setNextScan(room.name, 1);
    }

    if (Destroy.shouldDestroy(room)) {
      let destroyMessage = `Auto-destroying RCL-${room.controller.level} ` +
          `${room.controller.owner.username} room ${room.name}`;
      room.logError(destroyMessage);
      Game.notify(destroyMessage);
      room.memory.destroy = {};
    }
  
    let changeMessage = '';
    if (room.controller.level == 0) {
      delete room.memory.avoid;
      if (room.memory.scout.level) {
        changeMessage = `${room.memory.scout.owner} base is dead.`;
      }
    } else if (room.memory.scout.level == 0) {
      changeMessage = `${room.controller.owner.username} has a new base at ` +
          `RCL${room.controller.level}`;
    } else if (room.memory.scout.level < room.controller.level) {
      changeMessage = `${room.controller.owner.username} base has risen to ` +
          `RCL${room.controller.level}`;
    } else if (room.memory.scout.level > room.controller.level) {
      changeMessage = `${room.controller.owner.username} base has fallen to `+
          `RCL${room.controller.level}`;
    } else {
      changeMessage = `Spotting an existing ${room.controller.owner.username} base at ` +
          `RCL${room.controller.level}`;
    }

    if (changeMessage.length && shouldNotify(room)) {
      room.logError(changeMessage);
      Game.notify(room.name + ' ' + changeMessage);
    }

    room.memory.scout.level = room.controller.level;

    if (room.controller.level) {
      room.memory.scout.maxLevel = Math.max(room.memory.scout.maxLevel || 0, room.controller.level);
    } else {
      room.memory.scout.maxLevel = 0;
    }
  }

  if (room.controller.level) {
    if (room.memory.scout.owner != room.controller.owner.username) {
      room.memory.scout.owner = room.controller.owner.username;
    }
  } else {
    delete room.memory.scout.owner;
  }

  if (room.controller.reservation) {
    let username = room.controller.reservation.username;
    let timestamp = Game.time;
    room.memory.scout.reserved = {username, timestamp};
  } else if (room.memory.scout.reserved) {
    if (room.memory.scout.reserved.timestamp < Game.time - 10000) {
      delete room.memory.scout.reserved;
    }
  }

  checkAvoid(room);

  checkSignage(room);
}

function checkAvoid(room) {
  if (room.controller.level &&
      room.controller.owner.username != MY_USERNAME &&
      !room.memory.avoid &&
      !room.memory.noAvoid) {
    room.logError(`Room has RCL-${room.controller.level} ${room.controller.owner.username} base.` +
        ` Avoiding it.`);
    room.memory.avoid = true;
  }
}

function baseOwner(roomName) {
  let room = Game.rooms[roomName];
  if (room) {
    if (!room.controller || !room.controller.level) {
      return;
    }

    return room.controller.owner.username;
  }

  let mem = Memory.rooms[roomName];

  if (!mem || !mem.scout || !mem.scout.level) {
    return;
  }

  return mem.scout.owner;
}

function roomMiner(roomName) {
  let room = Game.rooms[roomName];

  if (room && 
      room.controller &&
      room.controller.reservation) {
    return room.controller.reservation.username;
  }

  // Even if there's no reservation, we might still consider the room a mine if we've seen someone
  // mining it recently.

  let mem = Memory.rooms[roomName];

  if (mem && mem.role == 'mine') {
    return MY_USERNAME;
  }

  if (mem && mem.scout && mem.scout.reserved && mem.scout.reserved.timestamp > Game.time - 10000) {
    return mem.scout.reserved.username;
  }
}

function checkSignage(room) {
  if (!room.controller) return;

  if (!room.controller.sign) return;

  if (room.controller.sign.username == 'Screeps' &&
      room.controller.sign.text.startsWith('A new Novice')) {
    let sectorName = room.sector.name;
    let key = sectorName + Alert.Key.NEWBIE_ZONE;
    let message = `Newbie zone in sector ${sectorName} (${room.sector.myBases.length} bases).`;
    Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);
  }
}

module.exports = {
  baseOwner,
  roomMiner,
  update,
}
