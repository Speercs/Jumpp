'use strict';

let Nav = require('util_nav');
let SpawnJob = require('util_spawnJob');
let Wagon = require('role_wagon');

function totalLootableStuff(room) {
  let lootableStructures = room.find(
      FIND_STRUCTURES,
      {filter: s => s.store && !s.isSourceContainer && !s.playerSKcontainer && s.naked});
  let lootableRuins = room.find(FIND_RUINS);

  let lootInStructures = _.sum(lootableStructures, s => _.sum(s.store));
  let lootInRuins = _.sum(lootableRuins, r => _.sum(r.store));

  return lootInStructures + lootInRuins;
}

function update(room) {
  try {
    updateImpl(room);
  } catch (err) {
    room.logError(`components.loot.update error: ${err}`);
  }
}

// Min ticks between new wagon spawns.
const DEFAULT_WAGON_SPAWN_PERIOD = 250;
const DEFAULT_WAGON_MODEL = 1;

const ENERGY_STRUCTURES = [STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION];

function updateImpl(room) {
  if (!room.memory.loot) {
    return;
  }

  if ((Game.time & 0xf) == 0 && room.isMyBase) {
    _(room.find(FIND_HOSTILE_STRUCTURES))
        .filter(s => s.store && s.store.getUsedCapacity() == 0)
        .forEach(s => s.destroy())
        .value();
    _(room.find(FIND_HOSTILE_STRUCTURES))
        .filter(
            s => ENERGY_STRUCTURES.includes(s.structureType) &&
            s.store.getUsedCapacity(RESOURCE_ENERGY) == 0)
        .forEach(s => s.destroy())
        .value();
  }

  let lootableStuff = totalLootableStuff(room);

  if (!lootableStuff) {
    delete room.memory.loot;
    return;
  }

  let myWagons = _.filter(room.ownedCreeps, c => c.memory.role == 'wagon');

  if (myWagons.length) {
    let mostRecentSpawnTime = _.max(myWagons, 'memory.spawnTime').memory.spawnTime;

    let period = room.memory.loot.period || DEFAULT_WAGON_SPAWN_PERIOD;

    if (mostRecentSpawnTime + period > Game.time) {
      return;
    }
  }

  let estimatedHaulCapacity =
      _.sum(myWagons, w => Math.floor(w.totalTicksToLive / 300) * w.store.getCapacity());

  if (estimatedHaulCapacity > totalLootableStuff) {
    return;
  }

  let roomCenter = Nav.findCentermostOpenSquare(room.name, 1);
  let nearestBase = roomCenter.findClosestTerminal({minRCL: 8}).room;
  let sourceRooms = [nearestBase.name];
  let model = room.memory.loot.wagonModel || DEFAULT_WAGON_MODEL;

  room.logDebug(`Ordering a wagon from ${sourceRooms[0]}...`);
  try {
    if (Wagon.requestSpawnRoom(
      sourceRooms,
      model,
      room.name,
      SpawnJob.PRIORITY_LOW) == OK) {
      room.logDebug(`...success.`);
    } else {
      room.logError(`Failed to queue wagon.`);
    }
  } catch (err) {
    room.logError(`Exception in Wagon.requestSpawnRoom: ${err}`);
  }
}

module.exports = {
  update,
}
