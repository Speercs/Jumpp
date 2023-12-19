'use strict';

let Core = require('room_components_core');
let Digsite = require('room_components_digsite');
let Dismantle = require('room_components_dismantle');
let NoRepair = require('room_components_noRepair');
let Observe = require('util_observe');
let Reserve = require('room_components_reserve');
let Road = require('room_components_road');
let Safemode = require('room_components_safemode');
let Spawn = require('room_components_spawn');
let Threat = require('room_components_threat');

function checkThreat(room) {
  let baseRoom = Game.rooms[room.memory.base];
  if (baseRoom) {
    if (!baseRoom.memory.mineInvaders) {
      baseRoom.memory.mineInvaders = {};
    }
    if (!baseRoom.memory.mineHarassers) {
      baseRoom.memory.mineHarassers = {};
    }
    room.memory.numInvaders = room.npcs.length + (room.memory.fakeInvaders || 0);
    baseRoom.memory.mineInvaders[room.name] = room.memory.numInvaders;
    let harassers = _.filter(
        room.hostilePlayerCreeps,
        c => !c.pos.nearEdge && (c.hasParts(RANGED_ATTACK) || c.hasParts(ATTACK)));
    room.memory.numHarassers = harassers.length;
    baseRoom.memory.mineHarassers[room.name] = harassers.length;

    if (room.npcs.length) {
      room.memory.lastKnownInvaderPosition = {
        x: room.npcs[0].pos.x,
        y: room.npcs[0].pos.y
      };
    } else {
      delete room.memory.lastKnownInvaderPosition;
    }

    if (harassers.length) {
      room.memory.lastKnownHarasserPosition = {
        x: harassers[0].pos.x,
        y: harassers[0].pos.y
      };
    } else {
      delete room.memory.lastKnownHarasserPosition;
    }
  }

  let threatLevel = Threat.getThreatLevel(room);
  
  room.threatLevel = threatLevel;

  if (threatLevel == Threat.THREAT_NONE) {
    return;
  }
  
  if (threatLevel == Threat.THREAT_MINOR) {
    //room.logError(Game.time + ' Minor threat.');
  }

  if (threatLevel == Threat.THREAT_MAJOR) {
    //room.logError(Game.time + ' MAJOR threat.');
  }
}

function checkHarass(room) {
  logHarassEvents(room);

  if (room.hashTime(100)) {
    pruneHarassRecords(room);
  }
}

function logHarassEvents(room) {
  try {
    return logHarassEventsImpl(room);
  } catch (err) {
    room.logError(`logHarassEvents error: ${err}`);
  }
}

function logHarassEventsImpl(room) {
  for (let i in room.harassEvents) {
    let event = room.harassEvents[i];
    let attacker = Game.getObjectById(event.objectId);
    if (attacker) {
      if (!room.memory.harassers) {
        room.memory.harassers = {};
      }
      
      let attackingPlayer = attacker.owner.username;
      if (attackingPlayer) {
        logHarassment(room, attackingPlayer);
      }
    }
  }
}

function logHarassment(room, attackingPlayer) {
  if (!(Game.time < room.memory.harassers[attackingPlayer] + 500)) {
    room.logError(`Logging harassment from player ${attackingPlayer}`);
  }

  if (!room.memory.harassers[attackingPlayer]) {
    let baseCode = Memory.rooms[room.memory.base].code;
    let message = `${attackingPlayer} has begun harassing room ${room.name}(${baseCode}) at t=${Game.time}`;
    console.log(message);
    Game.notify(message);
  }

  room.memory.harassers[attackingPlayer] = Game.time;
}

function pruneHarassRecords(room) {
  if (!room.memory.harassers) {
    return;
  }

  const cutoffTime = Game.time - 25000;
  const deadKeys = _(room.memory.harassers)
      .keys()
      .filter(k => room.memory.harassers[k] < cutoffTime)
      .value();

  if (!deadKeys.length) {
    return;
  }

  let baseCode = Memory.rooms[room.memory.base].code;

  for (const key of deadKeys) {
    let message = `${key} has stopped harassing room ${room.name}(${baseCode})`;
    console.log(message);
    Game.notify(message);
    delete room.memory.harassers[key];
  }

  if (!_.any(room.memory.harassers)) {
    delete room.memory.harassers;
  }
}

function checkContainers(room) {
  if (room.memory.digsites) {
    for (let key in room.memory.digsites) {
      Digsite.checkContainers(room, key);
    }
  }
}

function checkMisc(room) {
  if (room.memory.avoid) {
    room.logError(`Mine room has avoid set.`);
  }

  if (room.myCreeps.length == 0 || room.hashTime(1013) || room.memory._checkContainers) {
    checkContainers(room);
  }
}

function do1024(room) {
  if (room.memory.execute) {
    // Don't fix. It was set manually, so complain until it's fixed manually.
    room.logError(`Mine has execute set. Don't do that.`);
  }
}

function runDigsiteLinks(room) {
  if (!room.upgradeLink) return;
  if (!room.digsiteLinks.length) return;
  if (room.upgradeLink.store.getFreeCapacity(RESOURCE_ENERGY) < 800) return;

  let eligibleSenders = _.filter(room.digsiteLinks, l => l.store.energy > 400 && !l.cooldown);
  if (eligibleSenders.length < 1) return;
  let sender = _.max(eligibleSenders, l => l.source.energy / ((l.source.ticksToRegeneration || 0) + 1));
  sender.transferEnergy(room.upgradeLink);
}

function run(room) {
  Observe.setNextScan(room.name, 10);

  checkThreat(room);

  checkHarass(room);

  Reserve.update(room);

  Core.update(room);

  Road.checkRoads(room);

  Digsite.updateRoom(room);

  Safemode.mineUpdate(room);

  Spawn.update(room);

  let hashCode = room.name.hashCode();
  if ((hashCode & 127) == (Game.time & 127)) {
    Digsite.updateRoom100(room);
    Dismantle.update(room);
    NoRepair.update(room);
  }

  if ((hashCode & 1023) == (Game.time & 1023)) {
    do1024(room);
    Digsite.updateRoom839(room);
  }
  
  if (room.links.length) runDigsiteLinks(room);

  checkMisc(room);

  return;
}

module.exports = {
  run
};