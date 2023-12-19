'use strict';

let Books = require('util_books');
let Digger = require('role_digger');
let Longhauler = require('role_longhauler');
let Nav = require('util_nav');
let Sector = require('class_Sector');
let Shorthauler = require('role_shorthauler');
let SpawnJob = require('util_spawnJob');
let Threat = require('room_components_threat');



function setDiggerPosition(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];

  if (digsiteMem.fixed) {
    return;
  }

  let source = Game.getObjectById(digsiteKey);
  let container = Game.getObjectById(room.memory.digsites[digsiteKey].container);
  let link = Game.getObjectById(room.memory.digsites[digsiteKey].link);
  
  let terrain = new Room.Terrain(room.name);

  if (container) {
    // Just stand on the container.
    digsiteMem.diggerPosition = {x: container.pos.x, y: container.pos.y};
  } else if (link) {
    // Find an open tile within 1 of both the source and the link, but
    // not directly on either.
    let minX = Math.max(source.pos.x, link.pos.x) - 1;
    let maxX = Math.min(source.pos.x, link.pos.x) + 1;
    let minY = Math.max(source.pos.y, link.pos.y) - 1;
    let maxY = Math.min(source.pos.y, link.pos.y) + 1;
    
    if (minX > maxX || minY > maxY) {
      return;
    }

    // Choose one that's within 3 of the controller, if that's available.
    let best;

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        let pos = room.getPositionAt(x, y);
        if (!pos.isWalkable()) {
          continue;
        }

        let controllerDistance = room.getPositionAt(x, y).getRangeTo(room.controller);

        // TODO: Wait. In what sense is this the "best", if we're accepting anything
        // that's within 3 of the controller?
        if (terrain.get(x, y) != TERRAIN_MASK_WALL) {
          if (!best || controllerDistance < 4) {
            best = {x: x, y: y};
          }
        }
      }
    }

    if (best) {
      digsiteMem.diggerPosition = best;
    }
  } else {
    // Stand on any open tile. TODO: Find the one nearest to home.
    digsiteMem.maxHarvesters = 0;
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
      for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
        if (terrain.get(x, y) != TERRAIN_MASK_WALL) {
          digsiteMem.diggerPosition = {x: x, y: y};
          if (room.isMyBase && room.controller.level < 4) {
            digsiteMem.maxHarvesters = (digsiteMem.maxHarvesters || 0) + 1;
          }
        }
      }
    }
  }
}

function setContainer(room, digsiteKey) {
  let source = Game.getObjectById(digsiteKey);
  
  if (Game.getObjectById(room.memory.digsites[digsiteKey].container)) {
    return;
  }
    
  // Look for containers near the source.
  let containers = source.pos.findInRange(room.containers, 1);
  
  let container;
  
  if (containers.length == 1) {
    container = containers[0];
  } else if (containers.length > 1) {
    container = containers[1];
  }
  
  if (container) {
    room.memory.digsites[digsiteKey].container = container.id;
  } else {
    delete room.memory.digsites[digsiteKey].container;
  }
}

function setSpawn(room, digsiteKey) {
  let source = Game.getObjectById(digsiteKey);
  let digsiteMem = room.memory.digsites[digsiteKey];

  // Look for a spawn near the source.
  let myActiveSpawns = _.filter(room.spawns, s => s.my && s.active);
  let spawn = source.pos.findInRange(myActiveSpawns, 2)[0];

  if (!spawn) {
    delete digsiteMem.spawn;
    return;
  }

  digsiteMem.spawn = spawn.id;
}

function setLink(room, digsiteKey) {
  let source = Game.getObjectById(digsiteKey);
  let digsiteMem = room.memory.digsites[digsiteKey];

  if (!digsiteMem.diggerPosition) {
    // Should always be set, but just in case.
    return;
  }
  
  // Look for a link near the source.
  let myActiveLinks = _.filter(room.links, s => s.my && s.active);
  let link = source.pos.findInRange(myActiveLinks, 2)[0];

  if (!link) {
    delete digsiteMem.link;
    return;
  }

  digsiteMem.link = link.id;

  // Look for extensions near the source.
  let diggerPos = room.getPositionAt(digsiteMem.diggerPosition.x, digsiteMem.diggerPosition.y);
  let extensions = diggerPos.findInRange(room.diggerExtensions, 1);
  
  if (digsiteMem.longhauler) {
    room.logError(`Deleting longhauler at linked digsite.`);
    delete digsiteMem.longhauler;
  }

  if (digsiteMem.container &&
      !extensions.length &&
      (!room.upgradeContainer || room.upgradeContainer.id != digsiteMem.container)) {
    let containerObj = Game.getObjectById(digsiteMem.container);
    if (containerObj) {
      room.logError(`Linked digsite has container. Deleting.`);
      if (containerObj.destroy() == OK) {
        delete digsiteMem.container;
      }
    }
  }

  if (source.hasRegen) {
    link.registerBoostedDigsite();
  }
}

function init(room) {
  room.logError('Initializing digsites.');
  room.memory.digsites = {};
  let sources = room.find(FIND_SOURCES);

  for (let i=0; i < sources.length; i++) {
    let source = sources[i];
    
    room.memory.digsites[source.id] = {sourceId: source.id};
    
    setContainer(room, source.id);

    setDiggerPosition(room, source.id);

    setLink(room, source.id);

    setSpawn(room, source.id);

    updateDrop(room, source.id, 'initializing');
  }

  // Don't init mineral digsites. That'll happen automatically, later, if the room
  // is or becomes a base.
}

function unsafeToSpawn(room, digsiteMem) {
  // checkin note: sk rooms with a dead core may still have an invader lurking inside the ruins.
  // This is harmless and shouldn't obstruct spawning. So, mark rooms as unsafe only if they have
  // invaders AND if the sector's invaderCoreState is alive.
  if (room.invaders.length && room.sector.invaderCoreState == Sector.CoreState.ALIVE) {
    return true;
  }

  return room.threatLevel == Threat.THREAT_MAJOR &&
    (!room.controller || !room.controller.safeMode);
}

function updateDiggerLeadtimes(room) {
  for (let digsiteKey in room.memory.digsites) {
    let digsiteMem = room.memory.digsites[digsiteKey];
    let model = diggerModel(room, digsiteKey);
    if (!digsiteMem || !digsiteMem.digger) continue;

    let travelTime = 0;
    if (digsiteMem.digger.arrivalTimes && digsiteMem.digger.arrivalTimes.length) {
      travelTime =
          Math.ceil(_.sum(digsiteMem.digger.arrivalTimes) / digsiteMem.digger.arrivalTimes.length);
      // Sanity check.
      travelTime = Math.min(travelTime, 300);
    } else {
      travelTime = estimateTravelTime(room, digsiteKey);
    }
    let modelBodyParts = Digger.getBody(model).length;
    let spawnTime = CREEP_SPAWN_TIME * modelBodyParts;
    let safetyMargin = 40;
    if (digsiteMem.spawn) {
      safetyMargin = 0;
      travelTime = 0;
    }
    digsiteMem.digger.leadTime = travelTime + spawnTime + safetyMargin;
  }
}

function clearObsoleteLastRegens(room) {
  for (let digsiteKey in room.memory.digsites) {
    let digsiteMem = room.memory.digsites[digsiteKey];
    if (digsiteMem._lastRegen + 10000 < Game.time) {
      room.logError(`Clearing way-obsolete (${Game.time - digsiteMem._lastRegen}) lastRegen.`);
      delete digsiteMem._lastRegen;
    }
  }
}

function doDigger(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];
  
  if (digsiteMem._nextDiggerCheck > Game.time ||
      digsiteMem.inactive ||
      !digsiteMem.digger ||
      digsiteMem.digger.count < 0) {
    // Site never wants a digger.
    return;
  }
  
  if (unsafeToSpawn(room, digsiteMem)) {
    // Sites under attack don't make diggers.
    return;
  }
  
  let digsiteObj = Game.getObjectById(digsiteKey);
  if (digsiteObj.mineralType &&
      digsiteObj.mineralAmount == 0 &&
      digsiteObj.ticksToRegeneration > 200) {
    // Site is a mineral on cooldown and doesn't need a digger.
    return;
  }

  if (digsiteObj.mineralType) {
    if (!room.extractor || !room.extractor.active || !room.mineralContainer) {
      // There's no usable extractor. Don't make a digger.
      return;
    }

    if (room.roughInventory(room.nativeMineral) > 120000) {
      // Too much mineral on hand. Don't harvest more.
      return;
    }

    if (room.baseType == 'lw' &&
        room.nearestVault &&
        room.nearestVault.roughInventory(room.nativeMineral) > 300000) {
      // Too much mineral on hand. Don't harvest more.
      return;
    }

    if (room.roughInventory(room.nativeMineral) > 9000 &&
        room.nearestVault &&
        room.nearestVault.roughInventory(room.nativeMineral) > 300000) {
      // Too much mineral on hand. Don't harvest more.
      return;
    }
  }


  let model = diggerModel(room, digsiteKey);
  let leadTime = digsiteMem.digger.leadTime || 0;
 
  let myDiggers = _.filter(room.ownedCreeps, c => c.memory.role == 'digger' &&
      c.memory.target == digsiteKey &&
      (c.ticksToLive >= leadTime || c.spawning));

  if (myDiggers.length) {
    let youngestDigger = _.max(myDiggers, 'totalTicksToLive');
    let sleepTime = Math.max(0,youngestDigger.totalTicksToLive - (leadTime + 10));
    digsiteMem._nextDiggerCheck = Game.time + sleepTime;
    return;
  }

  // Order a digger.
  let rooms = [room.memory.sourceRoom || room.memory.base || room.name];
  let target = digsiteKey;
  let workRoom = room.name;

  room.logDebug(`digger requestSpawn(${rooms}}, ${model}, ${SpawnJob.PRIORITY_DEFAULT},` +
      `${target}, ${workRoom})`);
  if (Digger.requestSpawn(
      rooms,
      model,
      SpawnJob.PRIORITY_DEFAULT,
      target,
      workRoom) == OK) {
    room.logDebug('...success.');
  } else {
    room.logError('Failed to queue ' + role + '.');
  }
}

function doLonghauler(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];

  if (!digsiteMem.longhauler || digsiteMem.inactive) {
    // Site never wants a longhauler.
    return;
  }

  if (unsafeToSpawn(room, digsiteMem)) {
    // Sites under attack don't make haulers.
    return;
  }
  
  let digsiteObj = Game.getObjectById(digsiteKey);
  // TODO(checkin): Get rid of this check.
  if (digsiteObj.mineralType) {
    room.logError(`mineral digsite has a longhauler. This should never happen. Clearing.`);
    delete digsiteMem.longhauler;
    return;
  }

  let leadTime = digsiteMem.longhauler.leadTime || 0;
  let myHaulers = _.filter(room.ownedCreeps, c => c.memory.role == 'longhauler' &&
                          c.memory.target == digsiteKey &&
                          c.memory.state != Longhauler.STATE_DIE &&
                          !c.memory.lastTrip &&
                          (c.spawning || c.ticksToLive >= leadTime));

  let numDesired = digsiteMem.longhauler.count || 1;
  
  if (myHaulers.length < numDesired) {
    room.logDebug(`Ordering a longhauler for digsite at ${digsiteObj.pos}`);
    let rooms = [room.memory.sourceRoom || room.memory.base || room.name];
    let spawnRoom = Game.rooms[rooms[0]];
    let bestModel = Math.min(_.floor(spawnRoom.energyCapacityAvailable / 150), 16);
    if (!bestModel) {
      return;
    }
    let model = digsiteMem.longhauler.model || bestModel;
    let target = digsiteKey;
    let workRoom = room.name;
    let priority = SpawnJob.PRIORITY_LOW;
  
    if (Longhauler.requestSpawn(rooms, model, priority, target, workRoom) != OK) {
      room.logError('Failed to order ' + role + '.');
    }
  }
}

function doShorthauler(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];
  
  if (!digsiteMem.shorthauler || digsiteMem.inactive) {
    // Site never wants a shorthauler.
    return;
  }
  
  if (unsafeToSpawn(room, digsiteMem)) {
    // Sites under attack don't make haulers.
    return;
  }
  
  let digsiteObj = Game.getObjectById(digsiteKey);
  if (digsiteObj.mineralAmount == 0) {
    // Site is a mineral in a base room on cooldown and doesn't need a hauler.
    return;
  }
  
  if (!room.extractor || !room.extractor.active || !room.mineralContainer) {
    // There's no usable active extractor. Don't make a hauler.
    return;
  }

  let leadTime = digsiteMem.shorthauler.leadTime || 0;

  if (digsiteObj.mineralType) {
    let myDiggers = _.filter(room.ownedCreeps, c => c.memory.role == 'digger' &&
        c.memory.target == digsiteKey &&
        (c.ticksToLive >= leadTime || c.spawning));

    // Too much mineral and no digger present. Don't make a hauler.
    if (myDiggers.length == 0) return;
  }

  let myHaulers = _.filter(room.ownedCreeps, c => c.memory.role == 'shorthauler' &&
                          c.memory.target == digsiteKey &&
                          c.memory.state != Shorthauler.STATE_DIE &&
                          !c.memory.lastTrip &&
                          (c.spawning || c.ticksToLive >= leadTime));

  if (!myHaulers.length) {
    room.logDebug(`Ordering a shorthauler for digsite at ${digsiteObj.pos}`);
    let rooms = [room.memory.sourceRoom || room.memory.base || room.name];
    let spawnRoom = Game.rooms[rooms[0]];
    let bestModel = Math.min(_.floor(spawnRoom.energyCapacityAvailable / 150), 16);
    if (!bestModel) {
      return;
    }
    let model = digsiteMem.shorthauler.model || bestModel;
    let target = digsiteKey;
    let workRoom = room.name;
    let priority = SpawnJob.PRIORITY_DEFAULT;
  
    if (Shorthauler.requestSpawn(rooms, model, priority, target, workRoom) != OK) {
      room.logError('Failed to order ' + role + '.');
    }
  }
}

function diggerModel(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];

  let poweredSource = digsiteMem._lastRegen > Game.time - 500;
  let sourceRoom = (room.memory.base && Game.rooms[room.memory.base] || room);

  // Sources in remote rooms should have model-3s if they can afford it. (model-7s if they have a spawn or a link)
  if (digsiteMem.sourceId &&
    ['mine', 'skLair'].includes(room.memory.role) &&
    sourceRoom.energyCapacityAvailable >= 2050) {

    return (digsiteMem.spawn || digsiteMem.link) ? 7 : 3;
  }

  // Sources with spawns should have model-11s or model-14s, depending on boost
  if (digsiteMem.spawn && room.controller.level > 6) {
    return poweredSource ? 11 : 14;
  }
  
  // Unpowered sites with links should have model-7s
  if (digsiteMem.link && !poweredSource && sourceRoom.energyCapacityAvailable >= 1650) {
    return 7;
  }
  
  // Powered sites with links should have model-2s if they can afford it.
  if (digsiteMem.link &&
      poweredSource &&
      sourceRoom.energyCapacityAvailable >= 3250) {
    return 2;
  }
   
  // Powered sites with links should have model-10s
  if (digsiteMem.link && poweredSource && sourceRoom.controller.level > 6) {
    return 10;
  }
   
  // Sources without links should use model-3s.
  if (digsiteMem.sourceId &&
    !digsiteMem.link &&
    sourceRoom.energyCapacityAvailable >= 2050) {
    return 3;
  }

  // Sources in bases rooms should have model-15s if they can't afford model-7s
  if (room.isMyBase &&
    digsiteMem.sourceId &&
    sourceRoom.energyCapacityAvailable < 1650 &&
    sourceRoom.energyCapacityAvailable >= 1300) {
    return 15;
  }

  // Mineral sites should have the best model they can afford.
  if (digsiteMem.mineralId) {
    if (sourceRoom.energyCapacityAvailable >= 4500) {
      return 6;
    } else if (sourceRoom.baseType == 'lw' && sourceRoom.energyCapacityAvailable >= 5000) {
      return 13;
    } else if (sourceRoom.baseType == 'lw' && sourceRoom.energyCapacityAvailable >= 2300) {
      return 12;
    } else if (sourceRoom.baseType == 'lw' && sourceRoom.energyCapacityAvailable >= 1700) {
      return 17;
    } else if (sourceRoom.energyCapacityAvailable >= 2250) {
      return 5;
    }
  }

  // If all else fails, just make a model-1.
  return 1;
}

function diggerModelCheck(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];
  let source = Game.getObjectById(digsiteKey);

  if (digsiteMem.digger ||
      (!digsiteMem.container && !digsiteMem.link) ||
      (!room.activeStorage && room.memory.role != 'mine')) return;

  let type = source.energyCapacity ? 'source' : 'mineral';
  room.logError(`Automatically assigning digger to ${type} at ${source.pos.link}`);
  digsiteMem.digger = {};
}

function longhaulerModelCheck(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];
  let digsite = Game.getObjectById(digsiteKey);

  // Send longhaulers to any source with a container
  if (!digsiteMem.longhauler &&
      !digsiteMem.link &&
      digsiteMem.container &&
      !digsite.mineralType &&
      digsiteMem.digger &&
      (room.storage || room.memory.role == 'mine' || room.memory.role == 'skLair')) {
    // Don't send a longhauler if this container doubles as the upgradeContainer.
    if (room.upgradeContainer && room.upgradeContainer.id == digsiteMem.container) return;
    room.logError(`Automatically assigning hauler to digsite at ${digsite.pos.link}.`);
    digsiteMem.longhauler = {};
    return;
  }
}

function shorthaulerModelCheck(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];
  let digsite = Game.getObjectById(digsiteKey);

  if (digsiteMem.shorthauler && digsiteMem.longhauler) {
    room.logError(`Automatically clearing longhauler from mineral digsite at ${room.link}.`);
    delete digsiteMem.longhauler;
  }

  // Send shorthaulers to minerals in base rooms
  if (room.baseType != 'lw' &&
      digsite.mineralType &&
      digsiteMem.digger &&
      digsiteMem.container &&
      !digsiteMem.shorthauler) {
    room.logError(`Automatically assigning shorthauler to mineral digsite at ${room.link}.`);
    digsiteMem.shorthauler = {};
    return;
  }
}

function estimateTravelTime(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];
  let origin = new RoomPosition(digsiteMem.diggerPosition.x,
                  digsiteMem.diggerPosition.y,
                  room.name);
  let sourceRoom = Game.rooms[room.memory.base] || room;
  let goal = sourceRoom.spawns;
  
  let path = PathFinder.search(origin, goal);
  return path.cost;
}

const WASTED_ENERGY_REPORTING_THRESHOLD = 500;

function doSourceStuff(room, digsiteKey) {
  let digsite = Game.getObjectById(digsiteKey);
  let digsiteMem = room.memory.digsites[digsiteKey];

  if (!digsiteMem.digger) {
    return;
  }

  if (digsiteMem.digger.count < 0) {
    return;
  }
  
  // If the cycle is nearly over, record the amount of energy left unharvested.
  if (digsite.ticksToRegeneration == 1) {
    if (!digsiteMem.cycles) {
      digsiteMem.cycles = [];
    }
    
    digsiteMem.cycles.unshift({
      waste: digsite.energy,
      activity: digsiteMem.cycleActivity
    });
    digsiteMem.cycles = _.slice(digsiteMem.cycles, 0, 5);

    if(digsite.energy) {
      let significantWasteThisCycle = digsite.energy > WASTED_ENERGY_REPORTING_THRESHOLD;
      let wasteMoreOftenThanNot = _.filter(digsiteMem.cycles, 'waste').length > 2;
      if (significantWasteThisCycle && wasteMoreOftenThanNot) {
        let missingTicks = ENERGY_REGEN_TIME - _.sum(digsiteMem.cycleActivity);
        if (Game.time > 49855750) { // Temp silence.
          room.logError(`End of cycle, energy remaining = ${digsite.energy}`);
          room.logError(`noDigger=${missingTicks} noHauler=` +
              `${digsiteMem.cycleActivity.idleFull || 0}`);
        }
      }
      Books.logEnergy(room, 'unharvested', digsite.energy);
    }
  }
  
  if (!digsiteMem.cycleActivity || digsite.ticksToRegeneration == undefined) {
    digsiteMem.cycleActivity = {};
  }
  
  // Digger reports its action here. Log it, then stub it so we don't mistake
  // a stale entry for a new one.
  if (digsiteMem.diggerAction) {
    digsiteMem.cycleActivity[digsiteMem.diggerAction] =
        (digsiteMem.cycleActivity[digsiteMem.diggerAction] || 0) + 1;
    digsiteMem.diggerAction = 0;
  }

  // Complain if we're in a mine room and there's no container.
  if (room.memory.role == 'mine' &&
    !digsiteMem.container &&
    !Game.shard.ptr &&
    !room.invaderCore &&
    !room.constructionSites.length) {
    room.logError(`Digsite at ${digsite.pos} lacks container.`);
    room.memory._checkContainers = true;
  }
  
  digsiteMem._lastEnergy = digsite.energy;
}

function updateDrops(room) {
  if (room.memory.role == 'base') return;
  for (let digsiteKey in room.memory.digsites) {
    updateDrop(room, digsiteKey);
  }
}

function updateDrop(room, digsiteKey, reason) {
  let digsite = Game.getObjectById(digsiteKey);
  let digsiteMem = room.memory.digsites[digsiteKey];

  if (digsiteMem.inactive || digsiteMem.mineralId) return;

  if (room.isMyBase) {
    if (digsiteMem.drop) {
      room.logError(`Deleting drop from base digsite.`);
      delete digsiteMem.drop;
    }
    return;
  }

  if (digsiteMem.drop && digsiteMem.drop.id && !digsiteMem.drop.validated) {
    room.logError(`Digsite not validated at ${digsite.pos}`);
  }
  
  if (reason) {
    room.logError(`Updating digsite at ${digsite.pos} because ${reason}.`);
  }

  if (digsiteMem.drop && digsiteMem.drop.fixed) {
    let drop = Game.getObjectById(digsiteMem.drop.id);
    if (drop) return;
  }

  let diggerPosition =
      digsite.room.getPositionAt(digsiteMem.diggerPosition.x, digsiteMem.diggerPosition.y);

  let result = Nav.findNearestEnergyDrop(diggerPosition);

  if (result && digsiteMem.drop) {
    if (result.destination != digsiteMem.drop.id) {
      let drop = Game.getObjectById(result.destination);
      room.logError(`New destination for source at ${digsite.pos} = ${drop.pos}`);
      digsiteMem.drop.id = result.destination;
      delete digsiteMem.drop.validated;
    }
    if (result.cost != digsiteMem.drop.cost) {
      room.logError(`New cost for source at ${digsite.pos} = ${result.cost} ` +
          `(old=${digsiteMem.drop.cost})`);
      digsiteMem.drop.cost = result.cost;
    }
    if (result.steps != digsiteMem.drop.steps) {
      room.logError(`New steps for source at ${digsite.pos} = ${result.steps} ` +
          `(old=${digsiteMem.drop.steps})`);
      digsiteMem.drop.steps = result.steps;
    }
    if (!result.incomplete && digsiteMem.drop.invalid) {
      room.logError(`Digsite is no longer invalid at ${digsite.pos}`);
      delete digsiteMem.drop.invalid;
    }

    return result;
  }

  if (!result || result.incomplete) {
    digsiteMem.drop = {invalid: true};
    room.logError(`Updating digsite at ${digsite.pos} to bad drop.`);
  } else {
    digsiteMem.drop = {id: result.destination, cost: result.cost, steps: result.steps};
    room.logError(`Updating digsite at ${digsite.pos} to drop cost ${result.cost}`);
  }

  return result;
}

// Create mineral digsites in bases that lack them, and delete mineral digsites
// in rooms that have them and aren't bases.
function mineralDigsiteCheck(room) {
  let mineral = room.find(FIND_MINERALS)[0];

  if (room.isMyBase && !room.memory.digsites[mineral.id]) {
    room.memory.digsites[mineral.id] = {};
  }

  if (!room.isMyBase && room.memory.digsites[mineral.id]) {
    room.logError(`Room has an unnecessary mineral digsite. Clearing.`);
    delete room.memory.digsites[mineral.id];
  }
}

// Do stuff that should happen every 100 ticks or so.
function updateRoom100(room) {
  for (let digsiteKey in room.memory.digsites) {
    let digsiteMem = room.memory.digsites[digsiteKey];
    if (digsiteMem.inactive) return;

    mineralDigsiteCheck(room);

    // Check for new/vanished containers/links/spawns.
    setContainer(room, digsiteKey);
    
    diggerModelCheck(room, digsiteKey);
    longhaulerModelCheck(room, digsiteKey);
    shorthaulerModelCheck(room, digsiteKey);

    if (room.memory.digsites[digsiteKey].sourceId) {
      setLink(room, digsiteKey);
    }
    setSpawn(room, digsiteKey);
    setDiggerPosition(room, digsiteKey);

    if (digsiteMem.drop) {
      if (digsiteMem.drop.id && !Game.getObjectById(digsiteMem.drop.id)) {
        updateDrop(room, digsiteKey, 'drop is gone');
      }
    }
  }
}

// Do super-low-frequency stuff.
function updateRoom839(room) {
  updateDiggerLeadtimes(room);
  clearObsoleteLastRegens(room);
  updateDrops(room);
}

function updateRoom(room) {
  if (!room.memory.digsites) {
    init(room);
  }
  
  for (let key in room.memory.digsites) {
    updateDigsite(room, key);
  }
}

function updateDigsite(room, digsiteKey) {
  let digsite = Game.getObjectById(digsiteKey);
  let digsiteMem = room.memory.digsites[digsiteKey];

  if (digsiteMem.inactive) return;
  
  if (Game.cpu.bucket >= FULL_BUCKET_CPU ||
      room.isVault ||
      !digsiteMem.drop ||
      !digsiteMem.drop.cost ||
      digsiteMem.drop.cost < 100 ||
      (digsiteMem.drop.cost -99) * 50 < Memory.fullBucketTicks) {
    // Order new creeps.
    doDigger(room, digsiteKey);
    doLonghauler(room, digsiteKey);
    doShorthauler(room, digsiteKey);
  }

  // Do updates for energy sources.
  if (digsite.energyCapacity) {
    doSourceStuff(room, digsiteKey);
  }
}

const CONTAINER_WARN_HITS = CONTAINER_HITS / 5;

function getContainerPos(room, digsiteKey) {
  let digsiteMem = room.memory.digsites[digsiteKey];

  if (digsiteMem.containerPos) {
    return room.getPositionAt(digsiteMem.containerPos.x, digsiteMem.containerPos.y);
  }

  // Maybe there's only one possible location?
  let digsite = Game.getObjectById(digsiteKey);
  let possibles = digsite.pos.getAdjacentWalkableTiles();

  if (possibles.length == 1) {
    room.logError(`Digsite needs container and there's only one possible location.`);
    return possibles[0];
  }

  room.logError(`Digsite at ${digsite.pos.link} needs container and I can't figure out where to put it.`);
}

function checkContainers(room, digsiteKey) {
  let digsite = Game.getObjectById(digsiteKey);
  let digsiteMem = room.memory.digsites[digsiteKey];

  delete digsiteMem._checkContainers;

  if (digsiteMem.inactive) return;
  if (digsiteMem.mineralId && room.controller && !room.extractor) return;

  setContainer(room, digsiteKey);

  if (digsiteMem.container) {
    // We have a container. Log its position if it's low on hits.
    // PROBLEM: If there's no miner working the room, the container pos is unlikely to get logged. The room often won't be
    // visible, and the visible ticks are unlikely to fall on the ticks when we check the containers.
    let container = Game.getObjectById(digsiteMem.container);
    if (container.hits < CONTAINER_WARN_HITS) {
      room.logError(`Logging position of endangered container at ${container.pos}`);
      digsiteMem.containerPos = {x: container.pos.x, y: container.pos.y};
    } else if (digsiteMem.containerPos && container.hits > CONTAINER_WARN_HITS) {
      delete digsiteMem.containerPos;
      room.logError(`Deleting unnecessary containerPos at digsite at ${digsite.pos.link}`)
    }
  } else {
    // We lack a container. Maybe try to build one.
    if (room.constructionSites.length) return;
    if (digsite.mineralType && !room.extractor) return;
    let containerPos = getContainerPos(room, digsiteKey);

    if (containerPos) {
      let result = room.createConstructionSite(containerPos, STRUCTURE_CONTAINER);
      room.logError(`Trying to replace container at ${containerPos.link}, result = ${result}`);
    }
  }
}

module.exports = {
  checkContainers,
  updateRoom,
  updateRoom100,
  updateRoom839,
};