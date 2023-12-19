'use strict';

function unblock(creep) {
  let blocked = creep.pos.blockedCreep();

  if (blocked) {
    creep.logDebug('unblocking');
    creep.travelTo2(blocked, {
      range: 0
    });
    return true;
  }
  creep.logDebug('not blocked');
}

function moveToWorkRoom(creep) {
  if (!creep.workRoom || creep.workRoom.name != creep.room.name) {
    creep.travelTo2(creep.workRoomControllerPos, {preferHighway: true});
    return true;
  }
}

function moveToRenew(creep) {
  let nearestSpawn = creep.pos.findClosestByRange(creep.room.spawns);

  if (!nearestSpawn || creep.room.energyAvailable < 50) {
    return;
  }

  if (nearestSpawn && creep.ticksToLive < creep.unit.minimumTTL) {
    creep.travelTo2(nearestSpawn, {range: 1});
    creep.logDebug(`renewing because critical`);
    return true;
  }

  if ((creep.ticksToLive + creep.renewTicks < 1500) && creep.pos.isNearTo(nearestSpawn)) {
    creep.logDebug(`renewing because hysteresis`);
    return true;
  }
}

function fleeFromInvaders(creep) {
  if (!creep.room.npcs.length) {
    return;
  }

  let nearHostiles = creep.pos.findInRange(creep.room.npcs, 5);

  if (!nearHostiles.length) {
    return;
  }

  let enemies = _.map(nearHostiles, function(c) {
    return {pos: c.pos, range: 5}
  });

  let path = PathFinder.search(creep.pos, enemies, {flee: true, maxRooms: 1});
  let pos = path.path[0];
  creep.move(creep.pos.getDirectionTo(pos));
  return true;
}

// ==============================================

function dropEnergy(creep) {
  if (!creep.workRoom || creep.workRoom.name != creep.room.name) {
    if (creep.store.energy) {
      creep.drop(RESOURCE_ENERGY);
    }
  }
}

function moveToController(creep) {
  if (creep.room.controller && creep.room.controller.ticksToDowngrade < 2000) {
    if (creep.pos.getRangeTo(creep.room.controller) > 3) {
      return creep.travelTo2(creep.room.controller, {range:3}) == OK;
    }
  }
}

function moveToConstructionSite(creep) {
  if (!creep.room.constructionSites.length) {
    return;
  }

  let nearest = creep.pos.findClosestByRange(creep.room.constructionSites);

  if (!nearest) {
    return;
  }

  if (creep.pos.getRangeTo(nearest) < 3) {
    creep.memory.clearToReceive = Game.time;
    return true;
  }

  return creep.travelTo2(nearest, {range:2}) == OK;
}

function moveToSpawn(creep) {
  let room = creep.room;

  if (!room.spawns) {
    return;
  }

  let nearest = creep.pos.findClosestByRange(room.spawns);
  if (nearest && !creep.pos.isNearTo(nearest)) {
    return creep.travelTo2(nearest, {range:1}) == OK;
  }
}

function loadFromNearbyStorage(creep) {
  if (creep.room.storage &&
      creep.room.storage.store.energy &&
      creep.store.energy < creep.store.getCapacity() >> 2 &&
      creep.pos.isNearTo(creep.room.storage.pos)) {
    return creep.withdraw(creep.room.storage, RESOURCE_ENERGY) == OK;
  }
}

function enableReceive(creep) {
  creep.memory.clearToReceive = Game.time;
}

function doEmergencyUpgrade(creep) {
  if (creep.room.controller &&
      creep.room.controller.ticksToDowngrade < 2000) {
    return creep.upgradeController(creep.room.controller) == OK;
  }
}

function doBuild(creep) {
  if (!creep.room.constructionSites.length) {
    return;
  }

  if (creep.room.spawns.length && _.min(creep.unit.elements, 'ticksToLive').ticksToLive < 300) {
    return;
  }

  let nearest = creep.pos.findClosestByRange(creep.room.constructionSites);
  return creep.myBuild(nearest) == OK;
}

function doUpgrade(creep) {
  if (creep.unit.memory.state == 'work' &&
      creep.room.controller &&
      creep.room.controller.level < 3) {
    return creep.upgradeController(creep.room.controller) == OK;
  }
}

function updateWorker(creep) {
  dropEnergy(creep);

  if (moveToWorkRoom(creep) || fleeFromInvaders(creep) || moveToRenew(creep)) {
    return;
  }

  loadFromNearbyStorage(creep);

  moveToController(creep) ||
      moveToConstructionSite(creep) ||
      moveToSpawn(creep) ||
      enableReceive(creep) ||
      unblock(creep);

  doEmergencyUpgrade(creep) || doBuild(creep) || doUpgrade(creep);

  if (unblock(creep)) {
    return;
  }
}

// ==============================================

function moveToStorage(creep) {
  if (creep.pos.roomName != creep.unit.memory.sourceRoom) {
    return;
  }

  if (creep.isFull ||
      !creep.room.storage ||
      !creep.room.storage.store.energy) {
    return;
  }

  return (creep.travelTo2(creep.room.storage, {range: 1})) == OK;
}

function moveToMyDigsite(creep) {
  if (creep.store.energy) {
    return;
  }

  let digsiteMem = creep.room.memory.digsites[creep.source.id];
  let workPosition = creep.room.getPositionAt(
      digsiteMem.diggerPosition.x,
      digsiteMem.diggerPosition.y);
  
  if (!creep.pos.isNearTo(workPosition)) {
    return creep.travelTo2(workPosition, {range: 1}) == OK;
  }
}

function moveToNeedyExtension(creep) {
  if (creep.store.energy < 50) {
    return;
  }

  let nearbyExtensions = creep.pos.findInRange(creep.room.extensions, 12);
  if (!nearbyExtensions.length) {
    return;
  }

  let needyExtensions = _.filter(nearbyExtensions, e => e.my && e.energy < e.energyCapacity);
  if (!needyExtensions.length) {
    return;
  }

  let nearest = creep.pos.findClosestByPath(needyExtensions);
  if (!nearest) {
    return;
  }

  return creep.travelTo2(nearest, {range:1}) == OK;
}

function moveToNeedySpawn(creep) {
  if (!creep.store.energy) {
    creep.logDebug('not going to spawn because no energy');
    return;
  }

  let needySpawns = _.filter(creep.room.spawns, e => e.my && e.energy < e.energyCapacity);
  if (!needySpawns.length) {
    creep.logDebug('not going to spawn because not needy');
    return;
  }

  let nearest = creep.pos.findClosestByPath(needySpawns);
  if (!nearest) {
    creep.logDebug('not going to spawn because cant figure it out');
    return;
  }

  creep.logDebug('moving to needy spawn');
  return creep.travelTo2(nearest, {range:1}) == OK;
}

function moveToWorker(creep) {
  if (!creep.store.energy) {
    creep.logDebug('not moving to worker because empty');
    return;
  }

  if (!creep.unit.worker) {
    creep.logDebug('not moving to worker because no worker');
    return;
  }

  if (!creep.pos.isNearTo(creep.unit.worker)) {
    return creep.travelTo2(creep.unit.worker, {range: 1}) == OK;
  }
}

function moveToSpawn(creep) {

  let nearest = creep.pos.findClosestByPath(creep.room.spawns);
  if (!nearest) {
    return;
  }

  if (creep.pos.isNearTo(nearest)) {
    return;
  }

  return creep.travelTo2(nearest, {range:1}) == OK;
}

function moveToNeedyTower(creep) {
  if (!creep.store.energy) {
    creep.logDebug('not going to tower because no energy');
    return;
  }

  let needyTowers = _.filter(creep.room.towers, e => e.my && e.energy < e.energyCapacity);
  if (!needyTowers.length) {
    creep.logDebug('not going to tower because not needy');
    return;
  }

  let nearest = creep.pos.findClosestByPath(needyTowers);
  if (!nearest) {
    creep.logDebug('not going to tower because cant figure it out');
    return;
  }

  creep.logDebug('moving to needy tower');
  return creep.travelTo2(nearest, {range:1}) == OK;
}

function loadFromStorage(creep) {
  if (!creep.room.storage || creep.isFull) {
    return;
  }

  return creep.withdraw(creep.room.storage, RESOURCE_ENERGY) == OK;
}

function pickupPile(creep) {
  if (!creep.miner) {
    return;
  }

  let digsiteMem = creep.room.memory.digsites[creep.source.id];
  let workPosition = creep.room.getPositionAt(
      digsiteMem.diggerPosition.x,
      digsiteMem.diggerPosition.y);

  let pile = workPosition.findInRange(
    FIND_DROPPED_RESOURCES,
    /* range = */ 0,
    {filter: p => p.resourceType == RESOURCE_ENERGY})[0];

  if (pile && pile.amount > creep.store.getFreeCapacity()) {
    if (creep.pickup(pile) == OK) {
      if (creep.unit.worker) {
        creep.travelTo2(creep.unit.worker, {range: 1});
      }
      return true;
    }
  }
}

function loadFromTombstone(creep) {
  let stones = creep.pos.findInRange(FIND_TOMBSTONES, 1, {filter: s => s.store.energy});
  if (stones.length) {
    return creep.withdraw(stones[0], RESOURCE_ENERGY) == OK;
  }
}

function loadTower(creep) {
  if (!creep.store.energy) {
    return;
  }

  let towersInRange = creep.pos.findInRange(creep.room.towers, 1);
  let tower = _.find(
    towersInRange,
      e => e.my && e.energy < e.energyCapacity);

  if (tower) {
    creep.myTransfer(tower, RESOURCE_ENERGY);
  }
}

function loadExtension(creep) {
  if (!creep.store.energy) {
    return;
  }

  let extsInRange = creep.pos.findInRange(creep.room.extensions, 1);
  let ext = _.find(
      extsInRange,
      e => e.my && e.energy < e.energyCapacity);

  if (ext) {
    creep.myTransfer(ext, RESOURCE_ENERGY);
  }
}

function loadSpawn(creep) {
  if (!creep.store.energy) {
    return;
  }

  let needySpawn = _.filter(creep.room.spawns, s => s.my && s.energy < s.energyCapacity)[0];

  if (!needySpawn) {
    return;
  }

  return creep.myTransfer(needySpawn, RESOURCE_ENERGY) == OK;
}

function loadWorker(creep) {
  if (!creep.store.energy || !creep.unit.worker) {
    return;
  }

  if (creep.unit.worker.memory.clearToReceive != Game.time) {
    return;
  }

  if (creep.pos.roomName != creep.unit.memory.targetRoom) {
    return;
  }

  if (creep.room.spawns.length && creep.room.spawns[0].energy < creep.room.spawns[0].energyCapacity) {
    return;
  }

  let worker = creep.unit.worker;

  let workerSpace = worker.store.getFreeCapacity();
  if (workerSpace >= creep.store.getUsedCapacity() ||
      workerSpace >= creep.store.getCapacity() >> 1) {
    return creep.myTransfer(worker, RESOURCE_ENERGY) == OK;
  }
}

function updateHauler(creep) {
  if ((creep.pos.roomName == creep.unit.memory.targetRoom) && (!creep.miner || !creep.source)) {
    creep.memory.state = STATE_DIE;
    return true;
  }

  // move
  moveToStorage(creep) ||
      moveToWorkRoom(creep) ||
      fleeFromInvaders(creep) ||
      moveToRenew(creep) ||
      moveToMyDigsite(creep) ||
      moveToNeedyExtension(creep) ||
      moveToNeedySpawn(creep) ||
      moveToWorker(creep) ||
      //moveToSpawn(creep) ||
      moveToNeedyTower(creep) ||
      unblock(creep);

  // act
  loadFromStorage(creep) ||
      pickupPile(creep) ||
      loadFromTombstone(creep) ||
      loadTower(creep) ||
      loadExtension(creep) ||
      loadSpawn(creep) ||
      loadWorker(creep);
}

// ==============================================

function updateMiner(creep) {
  if (moveToWorkRoom(creep) || fleeFromInvaders(creep) || moveToRenew(creep)) {
    return;
  }

  if (!creep.source) {
    return;
  }

  let digsiteMem = creep.room.memory.digsites[creep.source.id];
  let workPosition = creep.room.getPositionAt(
      digsiteMem.diggerPosition.x,
      digsiteMem.diggerPosition.y);

  creep.travelTo2(workPosition, {range: 0});
  creep.harvest(creep.source);
}

// ==============================================

function moveToWounded(creep) {
  if (!creep.room.woundedCreeps.length) {
    return;
  }

  let nearest = creep.pos.findClosestByPath(creep.room.woundedCreeps);

  if (!nearest) {
    return;
  }

  return creep.travelTo2(nearest, {range:1}) == OK;
}

function healWounded(creep) {
  if (!creep.room.woundedCreeps.length) {
    return;
  }

  let woundedInRange = creep.pos.findInRange(creep.room.woundedCreeps, 3);
  let woundedInTouchRange = creep.pos.findInRange(woundedInRange, 1);

  if (woundedInTouchRange.length) {
    return creep.myHeal(woundedInTouchRange[0]) == OK;
  }

  if (woundedInRange.length) {
    return creep.myRangedHeal(woundedInRange[0]) == OK;
  }
}

function updateNurse(creep) {
  fleeFromInvaders(creep) ||
      moveToWounded(creep) ||
      unblock(creep);

  healWounded(creep);
}

// ==============================================

function updateUpgrader(creep) {
  let spawn = creep.pos.findInRange(creep.room.spawns, 1)[0];

  if (creep.room.controller.level > 2) {
    creep.memory.renewMe = false;
    creep.memory.killMe = true;
  }

  if (!spawn) {
    return;
  }

  if (!creep.store.energy && spawn.energy > 100) {
    creep.withdraw(spawn, RESOURCE_ENERGY);
  }

  creep.upgradeController(creep.room.controller);
}

// ==============================================

function moveToEngageInvaders(creep) {
  if (!creep.room.hostileCreeps.length) {
    return;
  }

  let nearestHostile = creep.pos.findClosestByPath(creep.room.hostileCreeps);

  if (!nearestHostile) {
    creep.logError(`hostiles in room, but findClosestByPath came up empty.`);
    nearestHostile = creep.pos.findClosestByRange(creep.room.hostileCreeps);
  }

  if (!nearestHostile) {
    return;
  }

  return creep.travelTo2(nearestHostile, {range:0}) == OK;
}

function moveToSortOfNearSpawn(creep) {
  let room = creep.room;

  if (!room.spawns) {
    return;
  }

  let nearest = creep.pos.findClosestByRange(room.spawns);
  if (!nearest) {
    nearest = creep.pos.findClosestByRange(creep.room.constructionSites);
  }

  if (creep.pos.getRangeTo(nearest) < 4) {
    return;
  }

  return creep.travelTo2(nearest, {range:3}) == OK;
}

function attackInvaders(creep) {
  let hostilesInTouchRange = creep.pos.findInRange(creep.room.hostileCreeps, 1);

  if (!hostilesInTouchRange.length) {
    return;
  }

  return creep.myAttack(hostilesInTouchRange[0]) == OK;
}

function updateGuard(creep) {
  moveToWorkRoom(creep) ||
      moveToEngageInvaders(creep) ||
      moveToRenew(creep) ||
      unblock(creep) ||
      moveToSortOfNearSpawn(creep);

  attackInvaders(creep);
}

function update(creep) {
  if (creep.memory.state != STATE_APPENDAGE) {
    return;
  }

  switch (creep.memory.subRole) {
    case 'worker':
      updateWorker(creep);
      break;
    case 'guard':
      updateGuard(creep);
      break;
    case 'hauler':
      updateHauler(creep);
      break;
    case 'miner':
      updateMiner(creep);
      break;
    case 'nurse':
      updateNurse(creep);
      break;
    case 'upgrader':
      updateUpgrader(creep);
      break;
    default:
      creep.logError(`Crew unknown subRole: ${creep.memory.subRole}`);
      break;
  }
}

module.exports = {
  update
}
