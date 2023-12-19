'use strict';

let Core = require('room_components_core');
let Digsite = require('room_components_digsite');
let Hunter = require('role_hunter');
let Loot = require('room_components_loot');
let Mine = require('room_components_mine');
let NoRepair = require('room_components_noRepair');
let Observe = require('util_observe');
let Road = require('room_components_road');
let Sector = require('class_Sector');
let SpawnJob = require('util_spawnJob');
let Threat = require('room_components_threat');

function cacheLairs(room) {
  room.memory._lairs = {};

  _(room.find(FIND_HOSTILE_STRUCTURES))
      .filter(s => s.structureType == STRUCTURE_KEEPER_LAIR)
      .forEach(function(lair) {
          room.memory._lairs[lair.id] = {
          x: lair.pos.x,
          y: lair.pos.y,
          sx: lair.source.pos.x,
          sy: lair.source.pos.y}})
      .value();
}

function maybeSpawnHunters(room) {
  if (room.invaderCore) return;

  if (room.sector.invaderCoreState == Sector.CoreState.ALIVE &&
      Game.time < room.sector.coreExpiry &&
      room.sector.invaderCorePosition.roomName == room.name) {
    return;
  }

  let lairIdsToSuppress = [];

  for (let lairId in room.memory._lairs) {
    let mem = room.memory._lairs[lairId];
    if (mem.suppressUntil < Game.time) {
      delete mem.suppressUntil;
      continue;
    }

    if (mem.suppressUntil > Game.time) {
      lairIdsToSuppress.push(lairId);
    }
  }

  if (!lairIdsToSuppress.length) return;

  let myHunters = _.filter(room.ownedCreeps, c => c.memory.role == 'hunter');

  for (let lairId of lairIdsToSuppress) {
    let sufficientTTL = Math.min(200, room.memory._lairs[lairId].suppressUntil - Game.time);
    let hunter = _.find(myHunters,
        c => c.memory.lairIds.includes(lairId) && c.totalTicksToLive >= sufficientTTL);
    if (hunter) {
      continue;
    }

    let otherHunter = _.find(myHunters, c => c.totalTicksToLive > sufficientTTL);
    if (otherHunter) {
      room.logError(`Broadening the mission of hunter ${otherHunter}`);
      otherHunter.memory.lairIds.push(lairId);
      otherHunter.memory.lairIds = getLairOrder(otherHunter.memory.lairIds);
      continue;
    }

    Observe.setNextScan(room.name, 1);

    Hunter.requestSpawn(
      Game.rooms[room.memory.mine.base.roomName],
      /* model = */ 1,
      room.name,
      getLairOrder(lairIdsToSuppress),
      SpawnJob.PRIORITY_HIGH);
    return;
  }
}

/*
 * If the room is being worked by a player, note name and time. A room is being 'worked'
 * if a player has any creep with a work part near a source or mineral.
 */
function scout(room) {
  let workers = _(room.foreignCreeps)
      .filter(c => !c.npc && c.getActiveBodyparts(WORK))
      .filter(c => c.pos.findInRange(FIND_SOURCES,1) || c.pos.findInRange(FIND_MINERALS,1))
      .value();

  if (workers.length) {
    if (!room.memory.scout || !room.memory.scout.lastWorker) {
      room.logError(`${workers[0].owner.username} has started working skLair ${room.name}`);
    }
    _.set(
        room.memory,
        'scout.lastWorker',
        {timestamp: Game.time, owner: workers[0].owner.username});
  } else {
    if (room.memory.scout &&
        room.memory.scout.lastWorker &&
        room.memory.scout.lastWorker.timestamp < Game.time - 50000) {
      room.logError(`${room.memory.scout.lastWorker.owner} has stopped working skLair ${room.name}`)
      delete room.memory.scout.lastWorker;
    }
  }
}

function run(room) {
  if (room.invaderCore || room.memory.core || room.memory.loot) {
    Observe.setNextScan(room.name, 25);
  } else {
    Observe.setNextScan(room.name, 500);
  }

  room.threatLevel = Threat.getThreatLevel(room);

  Core.update(room);

  Loot.update(room);

  Mine.update(room);

  if (!room.memory._lairs) {
    cacheLairs(room);
  }

  maybeSpawnHunters(room);

  scout(room);

  // Execute in an skLair means we're exploiting the sources in the room.
  if (!room.memory.execute) return;

  Road.checkRoads(room);

  Digsite.updateRoom(room);

  let hashCode = room.name.hashCode();
  if ((hashCode & 127) == (Game.time & 127)) {
    Digsite.updateRoom100(room);
    NoRepair.update(room);
  }
  
  if ((hashCode & 1023) == (Game.time & 1023)) {
    Digsite.updateRoom839(room);
  }
  
  return;
}

function lairToLairCost(a, b) {
  let result = PathFinder.search(a.pos, {pos: b.pos, range:1}, {maxRooms:1});
  if (result.incomplete) {
    console.log(`Failed to find a path between two lairs. This should be impossible.`);
    return Infinity;
  }
  return result.cost;
}

function pathCost(path, costs) {
  return costs[path[0]][path[1]] +
      costs[path[1]][path[2]] +
      costs[path[2]][path[3]] +
      costs[path[3]][path[0]];
}

global.reorderLairs = function(lairIds) {
  return getLairOrder(lairIds);
}

function getLairOrder(lairIds) {
  // With three or fewer ids, any arrangement is optimal.
  if (lairIds.length < 4) return lairIds;

  let lairs = _.map(lairIds, Game.getObjectById);

  let costs = new Array(4).fill(0).map(() => new Array(4).fill(0));
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      let cost = lairToLairCost(lairs[a], lairs[b]);
      costs[a][b] = cost;
      costs[b][a] = cost;
    }
  }

  // There are only three ways to traverse four nodes, since backwards is equivalent to
  // forwards: 01230 (box), 01320 (vertical bow-tie), and 02130 (horizontal bow-tie).
  let paths = [[0,1,2,3,0], [0,1,3,2,0], [0,2,1,3,0]];

  let bestPath;
  let bestCost = Infinity;

  for (let i=0; i < 3; i++) {
    let cost = pathCost(paths[i], costs);
    if (cost < bestCost) {
      bestPath = paths[i];
      bestCost = cost;
    }
  }

  return [lairIds[bestPath[0]], lairIds[bestPath[1]], lairIds[bestPath[2]], lairIds[bestPath[3]]];
}

module.exports = {
  run
};