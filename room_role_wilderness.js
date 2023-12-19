'use strict';

let Alert = require('util_alert');
let Analyze = require('room_components_analyze');
let Brick = require('room_components_brick');
let Claimer = require('role_claimer');
let Core = require('room_components_core');
let Destroy = require('room_components_destroy');
let Fight = require('room_components_fight');
let Harass = require('room_components_harass');
let Loot = require('room_components_loot');
let Nav = require('util_nav');
let Observe = require('util_observe');
let Reduce = require('room_components_reduce');
let Reserve = require('room_components_reserve');
let Safemode = require('room_components_safemode');
let Scout = require('room_components_scout');
let Spawn = require('room_components_spawn');
let SpawnJob = require('util_spawnJob');
let Util = require('util_misc');

function attackController(room) {
  if (!room.controller || room.controller.safeMode) {
    return;
  }

  if (room.controller.my) {
    room.logError(`Room is mine. Deleting room.memory claimer properties.`);
    delete room.memory.claimerSource;
    delete room.memory.claimerModel;
    delete room.memory.attackController;
    delete room.memory.claimerLeadTime;
    return;
  }

  if (room.controller.level == 0 && !room.controller.reservation) {
    let message = `${room.name} RCL is 0, but attackController is set.`;
    let key = room.name + Alert.Key.RCL0_ATTACK_CONTROLLER;
    Alert.notify(Alert.Destination.CONSOLE, key, Alert.Frequency.HOURLY, message);
    return;
  }

  if (room.controller.reservation && room.controller.reservation.username == MY_USERNAME) {
    return;
  }

  if (room.controller.upgradeBlocked > (room.memory.claimerLeadTime || 300)) {
    return;
  }

  if (!room.nakedWalkableTilesNearController().length) {
    return;
  }

  if (room.activeTowers && room.activeTowers.length && room.memory.claimerModel < 24) {
    return;
  }

  if (room.controller.level == 1 &&
      room.controller.upgradeBlocked > room.controller.ticksToDowngrade) {
    room.logError(`Room is doomed. No claimer is necessary.`);
    return;
  }

  let myClaimers =
      _.filter(Game.creeps, c => c.memory.role == 'claimer' && c.memory.workRoom == room.name);

  if (myClaimers.length) {
    return;
  }

  if (room.memory.avoid && room.spawns.length && !room.towers.length) {
    room.logError(`Probably-broken base has avoid set.`);
  }
  
  let rooms = [room.memory.claimerSource];
  let model = room.memory.claimerModel || 8;
  let flag = null;
  let workRoom = room.name;
  Claimer.requestSpawn(rooms, model, flag, SpawnJob.PRIORITY_HIGH, workRoom);
  room.logDebug(`requesting model-${model} claimer.`);
}

function claimController(room) {
  room.logDebug('claimController');
  if (!room.controller || room.controller.level) {
    room.logDebug('bailing because no controller or level');
    return;
  }

  if (room.controller.reservation && room.controller.reservation.username != MY_USERNAME) {
    room.logDebug('bailing because reserved');
    return;
  }

  let myClaimers = _.filter(Game.creeps,
    c => c.memory.role == 'claimer' && c.memory.workRoom == room.name);

  if (myClaimers.length) {
    room.logDebug('bailing because myClaimers.length');
    return;
  }

  let claimerSourceRoom = Game.rooms[room.memory.claimerSource || room.memory.sourceRoom];
  if (!claimerSourceRoom ||
    !claimerSourceRoom.controller ||
    !claimerSourceRoom.controller.my ||
    claimerSourceRoom.energyCapacityAvailable < 650) {
    room.logError('invalid claimerSourceRoom');
    return;
  }

  room.logDebug('I need a claimer');
  
  let rooms = [room.memory.claimerSource || room.memory.sourceRoom];
  let model = 1;
  let flag = null;
  let workRoom = room.name;
  let result = Claimer.requestSpawn(rooms, model, flag, SpawnJob.PRIORITY_HIGH, workRoom);
  if (result == OK) {
    claimerSourceRoom.logError(`Sending claimer to ${room.name}.`);
  }
}

function checkSafemode(room) {
  if (room.controller && room.controller.safeMode) {
    room.memory.safemodeEnd = Game.time + room.controller.safeMode;
  }
}

function sanityCheck(room) {
  if (room.memory.attackController ||
      room.memory.claimController ||
      room.memory.brick ||
      room.memory.destroy || 
      room.memory.harass ||
      room.memory.analyze ||
      room.memory.reduce ||
      room.memory.loot) {
    return;
  }

  if (_(Memory.worms).map('targetRoom').includes(room.name)) {
    return;
  }

  if (room.controller && room.controller.owner) {
    return;
  }

  if (room.find(
      FIND_FLAGS, {filter: f => f.memory.role == 'spawner' && f.memory.execute}).length) {
    return;
  }

  room.logError(`I'm a wilderness room and there's no good reason for me to be executing.`);
  room.memory.execute = false;
}

function updatePortals(room) {
  let portals = room.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_PORTAL});

  if (room.name.isSectorCenter()) {
    room.memory.portalPositions = _.map(portals, 'pos');
  } else {
    delete room.memory.portalPositions;
  }
}

function checkUnusedSources(room) {
  if (Game._sourceCheck) return;

  if (!room.controller) return;

  if (room.memory.scout && room.memory.scout.level) return;

  if (room.memory.scout && room.memory.scout.reserved) return;

  if (Game.cpu.bucket < FULL_BUCKET_CPU ) return;

  if (Memory.fullBucketTicks < 1000) return;

  if (room.getLast('sourceCheck', {}).timestamp + 10000 > Game.time) {
    return;
  }

  let nearestBase = Nav.getNearestBaseManhattan(room.name);
  let nearestBaseDistance = Game.map.getRoomLinearDistance(room.name, nearestBase.name);
  if (nearestBaseDistance > 1) {
    if (room.getLast('sourceCheck')) {
      room.setLast('sourceCheck', undefined);
      room.logError('deleting outofrange last sourceCheck');
    }
    return;
  }

  let sources = room.find(FIND_SOURCES);
  let bestCost = Infinity;

  for (let source of sources) {
    let result = Nav.findNearestEnergyDrop(source.pos);
    if (result && !result.incomplete && result.destination) {
      bestCost = Math.min(bestCost, result.cost);
      let drop = Game.getObjectById(result.destination);
      if (drop && result.cost < 100) {
        room.logError(`Source at ${source.pos} has a cost of ${result.cost} to deliver to ` +
            `${drop.structureType} at ${drop.pos}.`);
      }
    }
  }

  Game._sourceCheck = true;
  room.setLast('sourceCheck', {timestamp: Game.time, bestCost: bestCost});
}

function checkMisc(room) {
  if (room.memory.avoid) {
    let controllerLevel = (room.controller && room.controller.level) || 0;
    let reserved = room.controller &&
        room.controller.reservation &&
        room.controller.reservation.username != MY_USERNAME;
    let hostiles = room.hostilePlayerCreeps.length;
    if (!controllerLevel && !reserved && !hostiles) {
      room.logError(`Wilderness room with no base or hostile reservation has avoid set.`);
    }
  }
}

function recordTowerPositions(room) {
  if (!room.activeTowers.length && !room.memory.towerPositions) {
    return;
  }

  if (room.controller && room.controller.owner && room.controller.owner.username == MY_USERNAME) {
    delete room.memory.towerPositions;
    return;
  }

  if (room.memory.towerPositions && room.controller && !room.controller.owner) {
    room.logError(`Deleting towerPositions(1)`);
    delete room.memory.towerPositions;
    return;
  }

  if (room.memory.towerPositions && !room.activeTowers.length) {
    room.logError(`Deleting towerPositions(2)`);
    delete room.memory.towerPositions;
    return;
  }

  if (room.activeTowers.length) {
    room.memory.towerPositions =
        _.map(room.activeTowers, function(t) {return _.pick(t.pos, ['x', 'y'])});
  }
}

function isTargetOfAnyWorm(room) {
  return Memory.worms && _.any(Memory.worms, r => r.targetRoom == room.name);
}

function setNextScan(room) {
  if (room.controller) {
    if (room.myCreeps.length ||
        room.spawnerFlags.length ||
        room.memory.attackController ||
        isTargetOfAnyWorm(room)) {
      Observe.setNextScan(room.name, 5);
    } else if (room.controller.level && room.controller.level < 8 && !room.controller.my) {
      // Keep an eye on developing bases.
      Observe.setNextScan(room.name, 500);
    } else if (room.name == 'E28N22') {
      Observe.setNextScan(room.name, 100);
    } else if (room.memory.harass || room.memory.destroy || room.memory.reduce) {
      Observe.setNextScan(room.name, 100);
    } else if (room.sector.myBases.length > 1) {
      // Any room in a sector where I have two bases gets pretty frequent scans.
      Observe.setNextScan(room.name, 500);
    } else if (_.any(Game.bases, b => Nav.getRoomDistanceManhattan(b.name, room.name) <= 5)) {
      // Near neighbors get scanned pretty frequently.
      Observe.setNextScan(room.name, 300);
    } else if (room.controller.level == 8) {
      // Don't delete, so we don't spam. But we don't actually care.
      Observe.setNextScan(room.name, 10000);
    } else {
      // This is a room we shouldn't even be scanning.
      room.logError(`Trying to delete this because I just don't care.`);
      Util.markRoomMemoryForDelete(room.name);
      Observe.clearNextScan(room.name);
    }
  } else if (!room.keeperLairs.length) {
    // Any center is 100, even in sectors we don't clear.
    Observe.setNextScan(room.name, 100);
  } else if (room.sector.canClearCores === false) {
    // Really not interested in this at all.
    Observe.setNextScan(room.name, 10000);
  } else if (!room.invaderCore && !room.memory.core && !room.memory.loot) {
    // Center eight is 500 unless we're operating.
    Observe.setNextScan(room.name, 500);
  } else {
    // Center eight is 25 if we're operating.
    Observe.setNextScan(room.name, 25);
  }
}

function run(room) {
  if (!room.controller) {
    if (room.name.isHighway()) {
      room.logError(`I should be a highway! Changing.`);
      room.memory.role = 'highway';
      return;
    }

    if (room.name.isSkLair()) {
      room.logError(`I should be an skLair. Changing.`);
      delete room.memory.execute;
      room.memory.role = 'skLair';
    }

    if (room.name.isSectorCenter()) {
      room.logError(`I should be a center. Changing.`);
      delete room.memory.execute;
      room.memory.role = 'center';
    }
  }

  if (room.memory.avoid && !room.memory.avoid.timestamp) {
    if (!room.memory.scout || !room.memory.scout.level) {
      if (room.hostilePlayerCreeps.length == 0) {
        if (!room.memory.avoidReason || room.memory.avoidReason.timestamp < Game.time - 1000000) {
          room.logError(`I have avoid set for no good reason.`);
        }
      }
    }
  }

  Analyze.update(room);

  Scout.update(room);

  Harass.update(room);

  Destroy.update(room);

  recordTowerPositions(room);

  Core.update(room);

  Loot.update(room);

  Reserve.update(room);

  checkUnusedSources(room);

  setNextScan(room);

  Safemode.wildernessUpdate(room);

  if (!room.memory.execute) {
    return;
  }

  Spawn.update(room);

  sanityCheck(room);

  Fight.update(room);

  Brick.update(room);

  if (room.memory.attackController) {
    attackController(room);
  }

  if (room.memory.claimController) {
    claimController(room);
  }

  if (room.memory.reduce) {
    Reduce.update(room);
  }

  checkSafemode(room);

  updatePortals(room);

  checkMisc(room);
  
  return;
}

module.exports = {
  run
};