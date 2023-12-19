'use strict';

let Engineer = require('role_engineer');
let Observe = require('util_observe');
let Sector = require('class_Sector');
let Skhauler = require('role_skhauler');
let Skminer = require('role_skminer');
let SpawnJob = require('util_spawnJob');

const State = {
  WORK: 'work',
  DONE: 'done',
};

/*
 * Update mem.base. Base properties are:
 * - roomName: name of nearest base, should always be set.
 * - cost: Cost of pathing from this room's mineral to the nearest base. Should always be set.
 * - hunters: map, with key = roomName and value = array of lair IDs that threaten the
 *   route back to home base.
 */
function updateNearestBase(room) {
  let mineral = room.find(FIND_MINERALS)[0];
  let returnData = {};
  let baseTerminal = mineral.pos.findClosestTerminal({minRcl:6, returnData:returnData});
  let mem = room.memory.mine;

  mem.base = {
      roomName: baseTerminal.room.name,
      cost: returnData.cost
  };

  if (returnData.cost > 100) {
    room.logError(`${mineral.mineralAmount} ${mineral.mineralType} with drop cost of ${mem.base.cost}`);
    return;
  }

  let threateningLairs = findLairsOnPath(returnData.path);
  for (let lair of threateningLairs) {
    if (!mem.base.hunters) mem.base.hunters = {};
    if (!mem.base.hunters[lair.roomName]) mem.base.hunters[lair.roomName] = [];

    mem.base.hunters[lair.roomName].push(lair.lairId);
  }

  let otherLairRoomsOnPath = _(returnData.path)
      .map('roomName')
      .uniq()
      .filter('isSkLair')
      .without(room.name, baseTerminal.room.name)
      .value();

  if (otherLairRoomsOnPath.length) {
    mem.base.otherSkRooms = otherLairRoomsOnPath;
  }

  room.logError(`==========`);
  room.logError(`${mineral.mineralAmount} ${mineral.mineralType} with drop cost of ${mem.base.cost}, requiring ${_.keys(mem.base.hunters).length} hunters`);
}

function likelyKeeperPath(roomName, lairId) {
  let mem = Memory.rooms[roomName]._lairs[lairId];
  let lairPos = new RoomPosition(mem.x, mem.y, roomName);
  let sourcePos = new RoomPosition(mem.sx, mem.sy, roomName);
  let result = PathFinder.search(
      lairPos,
      {pos: sourcePos, range:1},
      {maxRooms:1, plainCost:2, swampCost:10});
  if (!result || result.incomplete) {
    console.log(`Can't find keeper path for lair ${lairId} in ${roomName}. Should never happen.`);
    return [];
  }
  return result.path;
}

function applyKeeperTracks(roomName, matrix) {
  let room = Game.rooms[roomName];

  if (room) {
    let lairs = room.find(
        FIND_HOSTILE_STRUCTURES,
        {filter: s => s.structureType == STRUCTURE_KEEPER_LAIR});
    for (let lair of lairs) {
      for (let step of lair.likelyPath) {
        let x0 = Math.max(0, step.x - 3);
        let x1 = Math.min(49, step.x + 3);
        let y0 = Math.max(0, step.y - 3);
        let y1 = Math.min(49, step.y + 3);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            matrix.set(x, y, 0xff);
          }
        }
      }
    }
  } else if (Memory.rooms[roomName]._lairs) {
    let lairIds = _.keys(Memory.rooms[roomName]._lairs);
    for (let lairId of lairIds) {
      let likelyPath = likelyKeeperPath(roomName, lairId);
      for (let step of likelyPath) {
        let x0 = Math.max(0, step.x - 3);
        let x1 = Math.min(49, step.x + 3);
        let y0 = Math.max(0, step.y - 3);
        let y1 = Math.min(49, step.y + 3);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            matrix.set(x, y, 0xff);
          }
        }
      }
    }
  }
  return matrix;
}

function findLairsOnPath(path) {
  let lairs = {};
  let matrices = {};

  for (let step of path) {
    if (!step.roomName.isSkLair()) continue;
    if (!matrices[step.roomName]) {
      matrices[step.roomName] = applyKeeperTracks(step.roomName, new PathFinder.CostMatrix);
    }

    if (matrices[step.roomName].get(step.x, step.y) != 0xff) continue;

    let l = Memory.rooms[step.roomName]._lairs;
    let lairId = _.min(_.keys(l), function(k) {return Math.max(Math.abs(l[k].x - step.x), Math.abs(l[k].y - step.y))})
    //console.log(`Step at (${step.x},${step.y}) is in danger from lair ${lairId}at (${l[lairId].x},${l[lairId].y})`);
    lairs[lairId] = {roomName: step.roomName, lairId};
  }

  return _.values(lairs);
}

function maybeSpawnHunter(room) {
  room.logDebug('maybeSpawnHunter')
  if (!room.mineral.mineralAmount && room.mineral.ticksToRegeneration > 1000) {
    return;
  }

  let mem = room.memory.mine;
  let huntersNeeded = 0;

  for (let roomName of _.keys(mem.base.hunters)) {
    for (let lairId of mem.base.hunters[roomName]) {
      Memory.rooms[roomName]._lairs[lairId].suppressUntil = Game.time + 10;
    }

    let workRoom = Game.rooms[roomName];
    if (!workRoom) {
      room.logDebug('incrementing huntersNeeded because no visibility');
      huntersNeeded++;
      continue;
    }

    let hunter = _.find(workRoom.ownedCreeps, c => c.memory.role == 'hunter' && c.memory.workRoom == roomName);
    if (!hunter) {
      room.logDebug('incrementing huntersNeeded because no hunter');
      huntersNeeded++;
      continue;
    }
  }

  room.logDebug(`huntersNeeded = ${huntersNeeded}`);
  return huntersNeeded > 0;
}

function anyLairsNotControlled(room) {
  room.logDebug('anyLairsNotControlled');
  let mem = room.memory.mine;
  for (let roomName of _.keys(mem.base.hunters)) {
    let roomObj = Game.rooms[roomName];
    // If we can't see the room, it's definitely not under control.
    if (!roomObj) return true;

    let hunters = _.filter(roomObj.ownedCreeps, c => c.memory.role == 'hunter');

    // If there are no hunters, it's not under control.
    if (!hunters.length) return true;

    // If any threatening lair has a keeper, it's not under control.
    for (let lairId of mem.base.hunters[roomName]) {
      let lairObj = Game.getObjectById(lairId);
      if (lairObj.keeper) return true;
    }
  }

  // all clear!
  return false;
}

function maybeSpawnEngineer(room) {
  room.logDebug('maybeSpawnEngineer')
  if (room.mineral.container) {
    return false;
  }

  if (!room.mineral.mineralAmount && room.mineral.ticksToRegeneration > 1000) {
    room.logError(`Not spawning engineer because mineral is empty.`)
    return false;
  }

  if (_.find(room.ownedCreeps,
      c => c.memory.role == 'engineer' && c.memory.mission.lairId == room.mineral.lair.id)) {
    return false;
  }

  let sourceRoom = Game.rooms[room.memory.mine.base.roomName];
  let model = sourceRoom.labs.length ? 1 : 2;

  if (sourceRoom.roughEnergy < 200000) {
    return false;
  }

  Engineer.requestSpawn(
      sourceRoom,
      model,
      Engineer.missionBuildContainer(
          room.name,
          room.mineral.lair.id,
          _.last(room.mineral.lair.likelyPath)),
      SpawnJob.PRIORITY_DEFAULT);
}

function maybeSpawnMiner(room) {
  room.logDebug('maybeSpawnMiner')
  if (!room.mineral.container) {
    return false;
  }

  if (!room.mineral.mineralAmount && room.mineral.ticksToRegeneration > 500) {
    return false;
  }

  if (_.find(room.ownedCreeps,
      c => c.memory.role == 'skminer' &&
          c.memory.lairId == room.mineral.lair.id &&
          c.totalTicksToLive > 200)) {
    return false;
  }

  Skminer.requestSpawn(
      Game.rooms[room.memory.mine.base.roomName],
      /* model = */ 1,
      room.name,
      room.mineral.lair.id,
      SpawnJob.PRIORITY_DEFAULT);
}

function maybeSpawnHauler(room) {
  room.logDebug('maybeSpawnHauler')
  if (!room.mineral.container) {
    return false;
  }

  if (!room.mineral.container.store.getUsedCapacity() &&
      !_.find(room.ownedCreeps,
          c => c.memory.role == 'skminer' &&
              c.memory.lairId == room.mineral.lair.id)) {
    return false;
  }

  if (_.find(room.ownedCreeps,
          c => c.memory.role == 'skhauler' &&
              c.memory.lairId == room.mineral.lair.id &&
              c.totalTicksToLive > 200)) {
    return false;
  }

  Skhauler.requestSpawn(
      Game.rooms[room.memory.mine.base.roomName],
      /* model = */ 1,
      room.name,
      room.mineral.lair.id,
      SpawnJob.PRIORITY_DEFAULT);
}

function maybeAbortBecauseCore(room) {
  // No launching mining ops in sectors with a live core.
  if (room.sector.invaderCoreState == Sector.CoreState.ALIVE &&
    Game.time < room.sector.coreExpiry) {
  return true;
  }

  return false;
}

function maybeEndOperation(room) {
  if (!room.mineral.mineralAmount &&
      room.mineral.ticksToRegeneration > 1000 &&
      (!room.mineral.container || !room.mineral.container.store[room.nativeMineral])) {
    room.logDebug('Ending mine operation because done.');
    room.memory.mine.state = State.DONE;
    delete room.memory.mine.creeps;

    let miners = _.filter(
        room.ownedCreeps,
        c => c.memory.role == 'skminer' && c.memory.lairId == room.mineral.lair.id);
    for (let miner of miners) {
      room.logDebug(`Shutting down ${miner.name}`);
      miner.memory.state = STATE_DIE;
    }
  }
  return false;
}

function wantMineral(baseName, resource) {
  let base = Game.rooms[baseName];
  if (!base) return false;
  
  // Don't mine more if the base has a nearestVault that contains 300k+
  let vault = base.nearestVault;
  if (vault && vault.roughInventory(resource) >= 300000) return false;

  // Don't mine more if the base is within 20k of its limit.
  if (base.roughInventory >= base.resourceLimits[resource] - 20000) return false;

  return true;
}

function update(room) {
  // temp?
  if (room.memory._doUpdateNearestBase) {
    updateNearestBase(room);
    delete room.memory._doUpdateNearestBase;
  }

  let mem = room.memory.mine;
  if (!mem) return;

  if (!mem.base) updateNearestBase(room);

  if (mem.base.cost >= 100) {
    delete mem.mineral;
    return;
  } else {
    mem.mineral = {
        mineralAmount: room.mineral.mineralAmount,
        mineralType: room.mineral.mineralType,
        regenTime: Game.time + room.mineral.ticksToRegeneration,
        density: room.mineral.density,
    };
  }

  if (mem.state != State.WORK) {
    if (room.mineral &&
        Game.cpu.bucket > 9000 &&
        mem.base &&
        mem.base.cost <= 100 &&
        wantMineral(mem.base.roomName, room.mineral.mineralType) &&
        (room.mineral.ticksToRegeneration || 0) < 1000 &&
        !_.get(room.memory, 'scout.lastWorker.owner') &&
        !(room.sector.invaderCoreLevel > 3)) {
      room.logError(`Starting mineral operation.`);
      mem.state = State.WORK;
    } else {
      if (!room.mineral) {
        room.logError(`No operation because no mineral wtf`);
      } else if (Game.cpu.bucket <= 9000) {
        //room.logError(`No operation because bucket <= 9000. (${Game.cpu.bucket})`);
      } else if (!mem.base) {
        room.logError(`No operation because no mem.base (probably because too far)`);
      } else if (mem.base.cost > 100) {
        room.logError(`No operation because too far`);
      } else if (room.mineral.ticksToRegeneration >= 1000) {
        //room.logError(`No operation because ticksToRegeneration`);
      } else if (_.get(room.memory, 'scout.lastWorker.owner')) {
        //room.logError(`No operation because someone else working`);
      } else if (room.sector.invaderCoreLevel > 3) {
        //room.logError(`No operation because invader core.`);
      } else if (!wantMineral(mem.base.roomName, room.mineral.mineralType)) {
        //room.logError(`No operation because mineral is ${room.mineral.mineralType}`);
      } else {
        room.logError(`No operation because...wtf unreachable code`);
      }
    }
  }

  if (mem.state != State.WORK) {
    if (mem.creeps) delete mem.creeps;
    return;
  }

  if (!mem.creeps) mem.creeps = {};

  // Do I need to order any hunters?
  maybeEndOperation(room) ||
      maybeAbortBecauseCore(room) ||
      maybeSpawnHunter(room) ||
      anyLairsNotControlled(room) ||
      maybeSpawnEngineer(room) ||
      maybeSpawnMiner(room) ||
      maybeSpawnHauler(room);
}

module.exports = {
  update,
  updateNearestBase,
}
  