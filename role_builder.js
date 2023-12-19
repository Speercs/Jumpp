'use strict';

let Books = require('util_books');
let SpawnJob = require('util_spawnJob');
let Wheelbarrow = require('role_wheelbarrow');


const STATE_BOOST_ALL = 1;
const STATE_GATHER = 2;
const STATE_WORK = 3;
const STATE_RENEW = 4;

function currentModel(energyBudget) {
  return Math.max(0,Math.min(16, Math.floor(energyBudget / 200)));
}

function getBody(model) {
  if (model == 0) {
    return [WORK, CARRY, MOVE, MOVE];
  }
  
  if (model == 25) {
    return [WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,

        CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,

        MOVE, MOVE, MOVE, MOVE,		MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE,		MOVE, MOVE, MOVE, MOVE];
  }

  if (model > 100) {
    if (model > 104) {
      return ERR_INVALID_ARGS;
    }
    model -= 100;
    return _.fill(Array(model*5), WORK)
      .concat(_.fill(Array(model*3), CARRY))
      .concat(_.fill(Array(model*4), MOVE));
  }
  
  if (model > 16) {
    return ERR_INVALID_ARGS;
  }
  return _.fill(Array(model), WORK)
    .concat(_.fill(Array(model), CARRY))
    .concat(_.fill(Array(model), MOVE));
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'builder',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0,
      repairAmount: 0,
      suppressNotify: true,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Builder');
}

function requestSpawn(rooms, model, worksite, priority, reason) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  if (worksite instanceof Flag) {
    opts.memory.flagName = worksite.name;
    opts.memory.workRoom = worksite.pos.roomName;
  } else {
    opts.memory.workRoom = worksite;
  }
  if (reason) {
    opts.memory.reason = reason;
  }
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  let boostableModel = [104, 25, 16, 11].includes(creep.memory.model);
  let stateOfEmergency =
    creep.room.nukes.length || creep.room.alertCondition == ALERT_CONDITION_RED;
  let excessBoost = !creep.room.isVault && creep.room.roughInventory('XLH2O') > 12000;

  return boostableModel && (stateOfEmergency || excessBoost);
}

function runSpawning(creep) {
	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestBoost('XLH2O', creep.getActiveBodyparts(WORK));
    creep.room.requestBoost(creep);
    creep.room.requestUnboost(creep);
  }
}

function needsWheelbarrow(creep) {
  return creep.memory.workRoom == 'E59N41';
}

function preUpdate(creep) {
  if (creep.spawning && creep.id && needsWheelbarrow(creep) && !creep.memory._lastSpawn) {
    let rooms = [creep.room.name];
    let model = 1;
    let priority = SpawnJob.PRIORITY_HIGH;
    Wheelbarrow.requestSpawnCreep(rooms, model, creep, priority);
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 4;
  let stateLog = [];
  let mem = creep.memory;

  function myTravelTo(target, range = 1) {
    let opts = {
      range: range,
      roomCallback: staySafeCallback
    }

    if (!(target instanceof RoomPosition)) {
      target = target.pos;
    }
    if (target.roomName == creep.pos.roomName) {
      opts.maxRooms = 1;
    }
    creep.logDebug('traveling to target at ' + target);
    let result = creep.travelTo2(target, opts);
    if (result == OK) {
      mem.moveIntents = (mem.moveIntents || 0) + 1;
    }
    return result;
  }

  let deltaE = creep.store.energy - creep.memory._lastEnergy;
  if (deltaE < -1000 || deltaE > 1000) {
    creep.logError('wtf crazy deltaE ' + deltaE);
  }

  if (deltaE > 0) {
    Books.logEnergy(creep, 'builderIn', deltaE);
  }
  
  if (deltaE < 0) {
    Books.logEnergy(creep, 'builderOut', -deltaE);
  }
  
  creep.memory._lastEnergy = creep.store.energy;

  function setState(state) {
    creep.logDebug('setState =' + state);
    creep.memory.state = state;
    creep.memory.subState = 0;
    delete creep.memory.buildId;
    delete creep.memory.repairId;
    delete creep.memory.repairGoal;
    repeat = true;
  }
  
  function doBoostAll() {
    creep.checkSuppressNotify();

    if (creep.doBoost() == OK) {
      setState(STATE_GATHER);
    }
    return;
  }

  function doGather() {
    creep.logDebug('doGather');

    // If I'm not in my work room, go there.
    if (creep.pos.roomName != creep.memory.workRoom) {
      creep.logDebug('traveling to work room');
      myTravelTo(creep.workRoomControllerPos);
      return;
    }
    
    // If I'm blocking someone, move to accommodate them.
    let blocked = creep.pos.blockedCreep();

    if (blocked) {
      creep.logDebug('unblocking');
      myTravelTo(blocked, 0);
      return;
    }

    // If I'm an advanced model nearly out of time, renew
    if (creep.room.spawns.length &&
      !creep.memory.norenew &&
      creep.bodyCost() > creep.room.energyCapacityAvailable &&
      creep.ticksToLive < 300 &&
      creep.room.energyAvailable >= 300) {
      setState(STATE_RENEW);
      return;
    }
    
    // If I'm not an advanced model and nearly out of time, die.
    if (creep.room.spawns.length && creep.ticksToLive < 100) {
      setState(STATE_DIE);
    }

    // If I'm nearly full, deliver.
    if (creep.store.energy >= creep.store.getCapacity() * 4/5) {
      creep.logDebug('Full of energy. Working.');
      setState(STATE_WORK);
      return;
    }
    
    // If there's a hostile energy structure, draw from that.
    if (creep.room.storage && !creep.room.storage.my && creep.room.storage.store.energy) {
      if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.storage);
      }
      return;
    }
    
    if (creep.room.terminal && !creep.room.terminal.my && creep.room.terminal.store.energy) {
      if (creep.withdraw(creep.room.terminal, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.terminal);
      }
      return;
    }
    
    // If there's a nearby pile, draw from that.
    let nearbyPiles = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 10, {
       filter: (p) => p.resourceType == RESOURCE_ENERGY &&
              p.pos.isSafe() &&
              (p.amount > 250 || p.amount > creep.store.getCapacity())
    });
    
    if (nearbyPiles.length) {
      creep.logDebug('Filling from nearby pile.');
      let nearestPile = creep.pos.findClosestByPath(nearbyPiles);
      if (creep.pickup(nearestPile) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestPile);
      }
      return;
    }
    
    // If there's a nearby tombstone, draw from that.
    let nearbyStones = creep.pos.findInRange(FIND_TOMBSTONES, 12, {
       filter: t => t.store.energy && t.pos.isSafe()
    });
    
    if (nearbyStones.length) {
      creep.logDebug('Filling from nearby stone.');
      let nearest = creep.pos.findClosestByPath(nearbyStones);
      if (creep.withdraw(nearest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearest);
      }
      return;
    }
    
    let lack = creep.store.getFreeCapacity();
    
    {
      let eligibleThings = _.compact(_.union(
        _.filter(creep.room.containers, c => c.store.energy >= creep.store.getCapacity()),
        _.filter(creep.room.links, c => c.energy > LINK_CAPACITY / 2),
        _.filter(creep.room.labs, c => c.energy && !c.active),
        [creep.room.activeTerminal]));
      eligibleThings = _.filter(
        eligibleThings,
        s => s.my || s.naked);
  
      const STORAGE_RESERVE = (creep.room.activeTerminal && creep.room.controller && creep.room.controller.level) == 8 ? 50000 : 1000; // Always leave some for other operations.
      if ((creep.room.baseType != 'bunker' || !creep.room.terminal || creep.room.controller.level != 8 || creep.room.terminal.servingController) &&
        creep.room.storage &&
        creep.room.storage.store.energy > STORAGE_RESERVE) {
        eligibleThings.push(creep.room.storage);
      }
      
      creep.logDebug(eligibleThings.length);
      if (eligibleThings.length) {
        let nearestThing = creep.pos.findClosestByPath(eligibleThings);
  
        let result = creep.withdraw(nearestThing, RESOURCE_ENERGY);
  
        if (result == ERR_NOT_IN_RANGE) {
          myTravelTo(nearestThing, 1);
        }
        return;
      }
    }

    // If there's a reasonable amount of energy in storage, draw energy
    // from storage or terminal, whichever's nearest. In 'bunker' type rooms
    // that have terminals, draw only from terminal. It's too crowded at
    // storage.
    const STORAGE_RESERVE = (creep.room.controller && creep.room.controller.level) == 8 ? 50000 : 1000; // Always leave some for other operations.
    if (creep.room.storage &&
      creep.room.storage.store.energy >= lack + STORAGE_RESERVE ) {
      let storageOrTerminal = creep.room.storage;
      
      if (creep.room.terminal && !creep.room.terminal.pos.inRangeTo(creep.room.controller, 2)) {
        if (creep.room.baseType == 'bunker') {
          storageOrTerminal = creep.room.terminal;
        } else {
          storageOrTerminal = creep.pos.findClosestByPath([creep.room.storage, creep.room.terminal]);
        }
      }

      creep.logDebug('Filling from ' + (storageOrTerminal == creep.room.storage ? 'storage' : 'terminal') + '.');
      let withdrawResult = creep.withdraw(storageOrTerminal, RESOURCE_ENERGY, lack);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(storageOrTerminal);
      }
      return;
    }
    
    // If there's a container other than the upgradeContainer, fill from that.
    const CONTAINER_RESERVE = creep.room.memory.role == 'base' ? 1000 : 0;
    let nearestContainer = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: (s) => s.structureType == STRUCTURE_CONTAINER &&
               s.store.energy >= lack + CONTAINER_RESERVE
               //s != creep.room.upgradeContainer
    });
    if (nearestContainer) {
      creep.logDebug('Filling from container.');
      let withdrawResult = creep.withdraw(nearestContainer, RESOURCE_ENERGY, lack);
      creep.logDebug(withdrawResult);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestContainer);
      }
      return;
    }
    
    // If there's a pile anywhere, draw from that.
    let nearestPile = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
       filter: (p) => p.resourceType == RESOURCE_ENERGY && p.amount > 500
    });
    if (nearestPile) {
      creep.logDebug('Filling from a faraway pile.');
      if (creep.pickup(nearestPile) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestPile);
      }
      return;
    }
    
    // If there's an active source, go draw from that.
    // Exception: Not in SK lairs!
    let nearestActiveSource = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (nearestActiveSource && creep.room.memory.role != 'skLair') {
      creep.logDebug('Harvesting.');
      if (creep.harvest(nearestActiveSource) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestActiveSource);
      }
      return;
    }
    
    // If there's a storage, go wait near that.
    if (creep.room.storage) {
      creep.logDebug('Waiting at storage.');
      myTravelTo(creep.room.storage);
      return;
    }
    
    // Go wait near a source.
    // Exception: Not in SK lairs!
    let nearestSource = creep.pos.findClosestByRange(FIND_SOURCES);
    if (nearestSource && creep.room.memory.role != 'skLair') {
      if (creep.pos.getRangeTo(nearestSource) > 3) {
        myTravelTo(nearestSource);
      }
      creep.logDebug('Waiting at source.');
      return;
    }
    
    // If there are containers, wait at the nearest.
    if (creep.room.containers && creep.room.containers.length) {
      creep.logDebug('Waiting at container.');
      let nearest = creep.pos.findClosestByPath(creep.room.containers);
      myTravelTo(nearest);
      return;
    }
    
    // If there's a tombstone anywhere, draw from that.
    let anyStones = creep.room.find(FIND_TOMBSTONES, {
       filter: t => t.store.energy
    });
    
    if (anyStones.length) {
      creep.logDebug('Filling from nearby stone.');
      let nearest = creep.pos.findClosestByPath(anyStones);
      if (creep.withdraw(nearest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearest);
      }
      return;
    }
    
    // If I've got any energy at all, go work.
    if (creep.store.energy) {
      setState(STATE_WORK);
      return;
    }
    
    // If this is an sk lair, it's not super surprising to have nothing to do. Shut up.
    if (creep.room.memory.role == 'skLair') {
      return;
    }
    
    // wth?
    creep.logError('I am lost in a strange room: ' + creep.pos.link);
    return;
  }
  
  function grabNearbyEnergy() {
    let structures = _.union(creep.room.towers, creep.room.spawns, creep.room.extensions);
    let near =
      creep.pos.findInRange(structures, 1, {filter: e => e.energy >= 200 && !e.tapped})[0];
    if (near) {
      if (creep.withdraw(near, RESOURCE_ENERGY) == OK) {
        near.tapped = true;
        return true;
      }
    }
  }
  
  function doWork() {
    if (creep.room.memory.role == 'base' && !creep.room.memory.oldBuilders) {
      return doWorkExperimental();
    }
    creep.logDebug('doWork');

    // If I'm not in my work room, go there.
    if (creep.pos.roomName != creep.memory.workRoom) {
      myTravelTo(creep.workRoomControllerPos);
      return;
    }
    
    // If I'm so badly damaged that I've got no work units left, go die.
    if (!creep.getActiveBodyparts(WORK)) {
      setState(STATE_DIE);
      return;
    }
    
    // If I'm low on energy and happen to be standing near some, grab it.
    let energyIncoming = false;
    if (creep.store.getFreeCapacity() >= 200) {
      energyIncoming = grabNearbyEnergy();
    }
    
    let repairAmount = creep.repairPower;

    // If I'm blocking someone, move to accommodate them.
    let blocked = creep.pos.blockedCreep();
    
    if (blocked) {
      myTravelTo(blocked, 0);
      return;
    }
    
    // If I'm out of energy, go get more.
    if (!creep.store.energy && !energyIncoming) {
      creep.logDebug('Out of energy. Getting more.');
      setState(STATE_GATHER);
      return;
    }
    
    // If I built something last tick, and it's still a construction site, hit it again.
    if (creep.memory.buildId) {
      creep.logDebug('I have a buildId:' + creep.memory.buildId);
      let buildTarget = Game.getObjectById(creep.memory.buildId);
      if (buildTarget && buildTarget.progressTotal) {
        creep.logDebug('It still needs work. Hitting it again.');
        // It's still a construction site.
        let buildResult = creep.myBuild(buildTarget);
        creep.logDebug('buildResult=' + buildResult);
        if (buildResult == ERR_NOT_IN_RANGE) {
          creep.logDebug('Traveling to build site.');
          myTravelTo(buildTarget);
        } else if (!creep.pos.isNearTo(creep.room.terminal) && !creep.pos.isNearTo(buildTarget)) {
          myTravelTo(buildTarget);
        }
        return;
      }
    }
    
    // If I repaired something last tick, and it's not as high as I meant to get it, repair it again.
    if (creep.memory.repairId) {
      creep.logDebug('I have a repairId');
      let repairTarget = Game.getObjectById(creep.memory.repairId);
      if (repairTarget && repairTarget.effectiveHits < creep.memory.repairGoal) {
        creep.logDebug('It still neds work. Hitting it again.');
        // Still valid, and still short of our goal. Keep working.
        let repairResult = creep.repair(repairTarget);
        if (repairResult == OK) {
          creep.memory.repairAmount += repairAmount;
        } else if (repairResult == ERR_NOT_IN_RANGE) {
          creep.logDebug('Traveling to repair site.');
          myTravelTo(repairTarget);
        } else if (!creep.pos.isNearTo(repairTarget)) {
          myTravelTo(repairTarget);
        }
        return;
      }
      creep.logDebug('It is invalid.');
      delete creep.memory.repairId;
    }

    // Done with whatever we were doing. Find a new job.	    
    delete creep.memory.buildId;
    delete creep.memory.repairId;
    delete creep.memory.repairGoal;

    // If I'm nearly out of energy, go get more.
    if (!creep.store.energy) {
      creep.logDebug('Out of energy. Getting more.');
      setState(STATE_GATHER);
      return;
    }
    

    // If there are ramparts under 10000, do them.
    let lowRampart = creep.pos.findClosestByPath(creep.room.ramparts, {
      filter: s => s.effectiveHits < 10000
    });
    
    if (lowRampart) {
      creep.memory.repairId = lowRampart.id;
      creep.memory.repairGoal = 15000;
      let repairResult = creep.repair(lowRampart);
      if (repairResult == OK) {
        creep.memory.repairAmount += repairAmount;
      }
      return;
    }

    const roadsAndContainers = _.union(creep.room.repairableRoads, creep.room.repairableContainers);
    
    if (creep.room.towers.length == 0 || !creep.room.controller || !creep.room.controller.my) {
      // If there are roads or containers anywhere in critical condition, patch them.
      let nearestCritical = creep.pos.findClosestByPath(
        roadsAndContainers,
        {filter: (s) => s.hits * 2 < s.hitsMax});
      if (nearestCritical) {
        creep.logDebug(
          'Repairing critical ' +
          nearestCritical.structureType +
          ' at ' + nearestCritical.pos);
        creep.memory.repairId = nearestCritical.id;
        creep.memory.repairGoal = nearestCritical.hitsMax * 3/5;
        let repairResult = creep.repair(nearestCritical);
        if (repairResult == OK) {
          creep.memory.repairAmount += repairAmount;
        }
        return;
      } else {
        creep.logDebug('No critical roads/containers.');
      }
    }
    
    // If there are containers at mineral sites in sk lairs under 80% hits, patch them.
    if (creep.room.memory.role == 'skLair') {
      let mineralContainer = creep.room.extractor.pos.findInRange(creep.room.containers, 1)[0];
      
      if (mineralContainer &&
        mineralContainer.effectiveHits < mineralContainer.hitsMax * 4 / 5) {
        creep.logDebug('Repairing mineral container.');
        creep.memory.repairId = mineralContainer.id;
        creep.memory.repairGoal = mineralContainer.hitsMax;
        let repairResult = creep.repair(mineralContainer);
        if (repairResult == OK) {
          creep.memory.repairAmount += repairAmount;
        } else if (repairResult == ERR_NOT_IN_RANGE) {
          myTravelTo(mineralContainer);
        }
        return;
      }
    }
    
    // If there are partially-completed work sites, pitch in at the nearest.
    let partials = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {filter: s => s.progress});
    if (partials.length) {
      let nearest = creep.pos.findClosestByPath(partials);
      if(nearest) {
        creep.memory.buildId = nearest.id;
        if (creep.myBuild(nearest) == ERR_NOT_IN_RANGE) {
          myTravelTo(nearest);
        }
        return;
      }
    }
    
    // If there are untouched work sites, start work on the nearest.
    let sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (sites.length) {
      let nearest = creep.pos.findClosestByPath(sites);
      creep.memory.buildId = sites.id;
      let result = creep.myBuild(nearest); 
      if (result == ERR_NOT_IN_RANGE) {
        myTravelTo(nearest);
      }
      return;
    }
    
    if (creep.room.towers.length == 0 || !creep.room.controller || !creep.room.controller.my) {
      // If there are roads or cans within 3 that need any work, patch them.
      let nearbyRoad = creep.pos.findInRange(
        roadsAndContainers,
        3,
        {filter: s => (s.hits + repairAmount) <= s.hitsMax})[0];
      if (nearbyRoad) {
        creep.logDebug('Working a nearby road/can.');
        creep.memory.repairId = nearbyRoad.id;
        creep.memory.repairGoal = nearbyRoad.hitsMax - repairAmount + 1;
        let repairResult = creep.repair(nearbyRoad);
        if (repairResult == OK) {
          creep.memory.repairAmount += repairAmount;
        }
        return;
      }
      
      // If there are roads or cans anywhere that are under 3/4, patch them.
      let needsRepair =
        _.filter(roadsAndContainers, s => s.hits < s.hitsMax * 3 / 4);
      if (needsRepair.length) {
        let nearest = creep.pos.findClosestByPath(needsRepair);
        if (nearest) {
          creep.memory.repairId = nearest.id;
          creep.memory.repairGoal = nearest.hitsMax - repairAmount + 1;
          let repairResult = creep.repair(nearest);
          if (repairResult == OK) {
            creep.memory.repairAmount += repairAmount;
          } else if (repairResult == ERR_NOT_IN_RANGE) {
            myTravelTo(nearest);
          }
          return;
        }
      }
      
      // If there are containers under full, patch them.
      needsRepair = _.filter(creep.room.containers, s => s.hits + repairAmount <= s.hitsMax);
      if (needsRepair.length) {
        let nearest = creep.pos.findClosestByPath(needsRepair);
        if (nearest) {
          creep.memory.repairId = nearest.id;
          creep.memory.repairGoal = nearest.hitsMax - repairAmount + 1;
          let repairResult = creep.repair(nearest);
          if (repairResult == OK) {
            creep.memory.repairAmount += repairAmount;
          } else if (repairResult == ERR_NOT_IN_RANGE) {
            myTravelTo(nearest);
          }
          return;
        }
      }
    }
    
    // Pick a wall or rampart and go repair it. (RCL 2+)
    let walls = _.filter(_.difference(_.union(creep.room.ramparts, creep.room.constructedWalls),
                      _.map(creep.room.memory.dismantle, Game.getObjectById)),
               s => s.effectiveHits < s.hitsMax &&
                  s.effectiveHits < (s.hitsTarget - 10000));
    if (walls.length && creep.room.controller && creep.room.controller.my && creep.room.controller.level >= 2) {
      let wallsSorted = _.sortBy(walls, 'hits');
      let weakest = wallsSorted[0];
      creep.memory.repairId = weakest.id;
      creep.memory.repairGoal = Math.min(weakest.effectiveHits + 25000, weakest.hitsTarget);
      creep.logDebug(`Repairing wall at ${weakest.pos} ideal ${creep.memory.repairGoal}`);
      if (creep.myBuild(weakest) == ERR_NOT_IN_RANGE) {
        myTravelTo(weakest);
      }
      return;
    }
    
    // Change my workRoom if there's a whenDone field on my current flag.
    if (creep.flag && creep.flag.memory.builder && creep.flag.memory.builder.count == 0 && creep.flag.memory.builder.whenDone) {
      let newFlagName = Memory.flags[creep.memory.flagName].builder.whenDone;
      creep.logError('Done working at flag ' + creep.memory.flagName + ', changing to ' + newFlagName);
      creep.logError(`Room ${creep.room.name} needs ${creep.room.roadWorkNeeded()} road work.`);
      creep.memory.flagName = newFlagName;
      creep.memory.workRoom = Game.flags[newFlagName].pos.roomName;
      return;
    }
    
    // Upgrade?
    if (creep.room.controller && creep.room.controller.my && creep.room.controller.level < 8) {
      if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.controller, 3);
      }
      return;
    }
    
    if (creep.room.towers.length == 0 || !creep.room.controller || !creep.room.controller.my) {
      // If there are roads that need any work at all, patch them.
      let needsRepair = _.filter(
        creep.room.repairableRoads,
        s => s.effectiveHits + repairAmount <= s.hitsMax);
      creep.logDebug('needsRepair=' + needsRepair.length);
      if (needsRepair.length) {
        let nearest = creep.pos.findClosestByPath(needsRepair);
        if (nearest) {
          creep.memory.repairId = nearest.id;
          creep.memory.repairGoal = nearest.hitsMax - repairAmount + 1;
          let repairResult = creep.repair(nearest);
          if (repairResult == OK) {
            creep.memory.repairAmount += repairAmount;
          } else if (repairResult == ERR_NOT_IN_RANGE) {
            myTravelTo(nearest);
          }
          return;
        }
      }
    }
    
    // There's just nothing here to do at all.
    creep.logDebug('Done working. Gome home for recycle.');
    setState(STATE_DIE);
  }

  function updatePrimaryRepairTarget() {
    if (mem.repairId && mem.repairGoal > 0 && Game.getObjectById(mem.repairId)) {
      creep.logDebug(`${Game.time % 1000} Keeping primary target, goal = ${mem.repairGoal}.`);
      return;
    }

    if (ticksSinceReset() < 5) {
      // Don't force regeneration of the siege maps right after reset. Just relax a minute.
      return;
    }

    // If any rampart is low, top it up to 150k.
    if (creep.room.lowRamparts.length) {
      let lowest = _.min(creep.room.lowRamparts, 'hits');
      mem.repairId = lowest.id;
      mem.repairGoal = 150000 - lowest.hits;
      return;
    }

    let weakestInRoom = creep.room.weakestScaledRampart();
    let weakestInRange = creep.pos.weakestScaledRampartInRange(3);
    let difference = weakestInRange.scaledHits - weakestInRoom.scaledHits;
    let diffPct = difference * 100.0 / weakestInRoom.scaledHits;

    let target = weakestInRoom;

    if (difference < 100000 || diffPct < 1) {
      //creep.logDebug(`Choosing nearer target because difference (${difference}, ${diffPct}) is small.`);
      target = weakestInRange;
    }

    if (target) {
      //creep.logDebug(`${Game.time % 1000} New primary is rampart at ${target.pos} with ${target.hits} hits.`);
      mem.repairId = target.id;
      mem.repairGoal = Math.min(creep.repairPower * 25, target.hitsMax - target.hits);
    } else {
      delete mem.repairId;
      delete mem.repairGoal;
    }
  }

  const Urgency = {critical: 4, high: 3, medium: 2, low: 1, none:0};

  function applyUrgency(s) {
    let target = s.structure;

    switch (target.structureType) {
      case STRUCTURE_WALL:
      case STRUCTURE_RAMPART:
        s.deficit = target.hitsMax - target.scaledHits;

        if (target.structureType == STRUCTURE_RAMPART && target.hits < 25000) {
          s.urgency = Urgency.critical;
        } else {
          s.urgency = Urgency.high;
        }

        s.goal = creep.repairPower * 20;
        break;

      case STRUCTURE_ROAD:
      case STRUCTURE_CONTAINER:
        s.deficit = target.hitsMax - target.hits;
        if (s.deficit < creep.repairPower) {
          s.urgency = Urgency.none;
          return;
        }

        s.urgency = target.hits <= target.hitsMax / 2 ? Urgency.critical : Urgency.medium;
        s.goal = target.hitsMax - target.hits;
        break;

      case STRUCTURE_CONTROLLER:
        s.deficit = 0;
        s.urgency = Urgency.none;
        break;

      default:
        s.deficit = target.hitsMax - target.hits;
        if (s.deficit == 0) {
          s.urgency = Urgency.none;
          return;
        }
        s.urgency = Urgency.low;
        s.goal = target.hitsMax - target.hits;
        break;
    }
  }

  function updateSecondaryRepairTarget() {
    // If primary goal is in range, don't bother updating the secondary.
    let primaryTarget = Game.getObjectById(mem.repairId);
    if (primaryTarget && creep.pos.getRangeTo(primaryTarget) < 4) {
      return;
    }

    let repairTarget = Game.getObjectById(mem.repairId2);
    if (repairTarget &&
      mem.repairGoal2 > 0 &&
      creep.pos.getRangeTo(repairTarget) < 4 &&
      repairTarget.hits + creep.repairPower <= repairTarget.hitsMax) {
      return;
    }

    let t0 = Game.cpu.getUsed();
    let structures = creep.room.lookForAtArea(
      LOOK_STRUCTURES,
      Math.max(0, creep.pos.y - 2),
      Math.max(0, creep.pos.x - 2),
      Math.min(49, creep.pos.y + 2),
      Math.min(49, creep.pos.x + 2),
      /* asArray = */ true);

    _.forEach(structures, s => applyUrgency(s));

    if (!structures.length) {
      delete mem.repairId2;
      delete mem.repairGoal2;
      return;
    }

    let maxUrgency = _.max(structures, 'urgency').urgency;

    if (maxUrgency == Urgency.none) {
      delete mem.repairId2;
      delete mem.repairGoal2;
      return;
    }

    let urgentStructures = _.filter(structures, s => s.urgency == maxUrgency);

    let mostUrgent = _.max(urgentStructures, 'deficit');

    if (!mostUrgent || !mostUrgent.structure) {
      delete mem.repairId2;
      delete mem.repairGoal2;
      return;
    }

    mem.repairId2 = mostUrgent.structure.id;
    mem.repairGoal2 = mostUrgent.goal;

    let dt = Game.cpu.getUsed() - t0;
    creep.logDebug(`${Game.time % 1000} choosing new secondaryRepairTarget, dt = ${dt}`);
  }

  function updateBuildTarget() {
    if (mem.buildId && Game.getObjectById(mem.buildId)) {
      return;
    }

    // Don't build links at sources. That's the digger's job.
    let eligibleConstructionSites = _.filter(creep.room.constructionSites,
        s => s.structureType != STRUCTURE_LINK ||
            s.pos.findInRange(FIND_SOURCES, 2).length == 0);

    let nearest = creep.pos.findClosestByRange(eligibleConstructionSites);

    if (nearest) {
      mem.buildId = nearest.id;
    } else {
      delete mem.buildId;
    }
  }

  function doWorkTargeting() {
    // Temp!
    if (mem.repairGoal > 150000) {
      delete mem.repairId;
      delete mem.repairGoal;
      creep.logError('fixing out of range repairGoal');
    }

    updatePrimaryRepairTarget();
    updateSecondaryRepairTarget();
    updateBuildTarget();
  }

  function buildBuildTarget() {
    let buildTarget = Game.getObjectById(mem.buildId);

    if (!buildTarget) {
      return;
    }

    let result = creep.myBuild(buildTarget);
    if (result == OK && buildTarget.structureType == STRUCTURE_RAMPART) {
      delete mem.repairId;
      delete mem.repairGoal;
    }

    return result == OK;
  }

  function conserveEnergy() {
    return creep._doConserveEnergy;
  }

  function repairRepairTarget() {
    let repairTarget = Game.getObjectById(mem.repairId);

    if (!repairTarget) {
      return;
    }

    if (creep.repair(repairTarget) == OK) {
      mem.repairAmount += creep.repairPower;
      mem.repairGoal = Math.max(0, mem.repairGoal - creep.repairPower);
      return true;
    }
  }

  function repairSecondaryRepairTarget() {
    let repairTarget = Game.getObjectById(mem.repairId2);

    if (!repairTarget) {
      return;
    }

    if (creep.repair(repairTarget) == OK) {
      mem.repairAmount += creep.repairPower;
      mem.repairGoal2 -= creep.repairPower;
      return true;
    }
  }

  function doWorkWork() {
    if ((creep.store.energy == 0) ||
      buildBuildTarget() ||
      conserveEnergy() ||
      repairRepairTarget() ||
      repairSecondaryRepairTarget()) {
      return;
    }
  }

  function needNoEnergy() {
    if (creep.store.getCapacity() > 200) {
      return creep.store.getFreeCapacity() < 200;
    } else {
      return creep.store.energy > creep.numBodyparts(WORK) * 4;
    }
  }

  function loadFromNearbyStructure() {
    // Note that this'll exclude extensions below RCL7. This is intended. Draining extensions at
    // RCL6 significantly obstructs spawning.
    let near = creep.pos.findInRange(
      _.union(creep.room.towers,
          creep.room.spawns,
          creep.room.labs,
          creep.room.extensions,
          creep.room.towers,
          creep.room.links),
      1,
      {filter: e => e.store.energy > 50})[0];

    if (!near) {
      near = creep.pos.findInRange(
        _([creep.room.storage])
          .union([creep.room.terminal], creep.room.containers)
          .compact()
          .value(),
        1,
        {filter: e => e.store.energy >= 200})[0];
    }

    if (near) {
      if (creep.withdraw(near, RESOURCE_ENERGY) == OK) {
        return true;
      }
    }
  }

  function doWorkGather() {
    if (needNoEnergy() ||
      loadFromNearbyStructure()) {
      return;
    }
  }

  function doWorkUnboost() {
    if (creep.ticksToLive > 1) {
      return;
    }

    let roomDecayRate = creep.room.ramparts.length * RAMPART_DECAY_AMOUNT / RAMPART_DECAY_TIME;
    let ticksAdded = _.round(creep.memory.repairAmount / roomDecayRate);
    creep.room.memory._nextMaintenanceTime =
        Game.time + ticksAdded - (CREEP_LIFE_TIME + 200);

    if (!creep.boosted || !creep.unboostLab) {
      return;
    }

    creep.unboostLab.unboostCreep(creep);
  }

  function moveTowardLab() {
    let wrapupTicks = creep.room.baseType == 'bunker' ? 25 : 50;
    if (creep.ticksToLive > wrapupTicks || !creep.boosted || !creep.unboostLab) {
      return;
    }

    return myTravelTo(creep.unboostLab, 1) == OK;
  }

  function moveTowardEnergy() {
    let workParts = creep.numBodyparts(WORK);

    if (creep.store.energy > workParts * 2) {
      return;
    }

    let sources = _.union(
      _.filter(creep.room.containers, c => c.store.energy >= creep.store.getCapacity()),
      _.filter(creep.room.extensions, e => e.energy == 200),
      _.filter(creep.room.labs, e => e.energy > 200),
      _.filter(creep.room.links, e => e.energy > 50),
      _.filter(creep.room.towers, e => e.energy > 50),
      _.filter(_.compact([creep.room.storage, creep.room.terminal]),
        s => s.store.energy >= creep.store.getCapacity()));

    if (!sources.length) {
      return;
    }

    let nearest = creep.pos.findClosestByPath(sources);

    if (creep.pos.getRangeTo(nearest) > 1) {
      return myTravelTo(nearest, 1) == OK;
    }
  }

  function moveTowardBuildTarget() {
    let buildTarget = Game.getObjectById(mem.buildId);

    if (!buildTarget) {
      return;
    }

    let farawayBuildTarget = creep.room.storage &&
        creep.room.storage.pos.getRangeTo(buildTarget) > 8;

    let lowOnEnergy = creep.store.energy < creep.store.getCapacity() * 7 / 8;

    if (farawayBuildTarget) {
      creep._doConserveEnergy = true;
    }

    return creep.pos.getRangeTo(buildTarget) < 4 || myTravelTo(buildTarget, 3) == OK;
  }

  function moveTowardRepairTarget() {
    let repairTarget = Game.getObjectById(mem.repairId);

    if (!repairTarget || creep.pos.getRangeTo(repairTarget) < 4) {
      return;
    }

    return myTravelTo(repairTarget, 3) == OK;
  }

  function unblock() {
    let blocked = creep.pos.blockedCreep();

    if (blocked) {
      return myTravelTo(blocked, 0) == OK;
    }
  }

  function doWorkMove() {
    if (creep.forced ||
      moveTowardLab() ||
      unblock() ||
      moveTowardEnergy() ||
      moveTowardBuildTarget() ||
      moveTowardRepairTarget()) {
      return;
    }
  }

  function doWorkExperimental() {
    let trying;
    try {
      trying = 'doWorkTargeting';
      doWorkTargeting();
      trying = 'doWorkMove';
      doWorkMove();
      trying = 'doWorkWork';
      doWorkWork();
      trying = 'doWorkGather';
      doWorkGather();
      trying = 'doWorkUnboost';
      doWorkUnboost();
    } catch (err) {
      creep.logError(`doWorkExperimental error: ${err} in ${trying}`)
    }
  }

  function doRenew() {
    if (creep.ticksToLive > 1400 || creep.room.energyAvailable < 100) {
      setState(STATE_GATHER);
      return;
    }
    let spawn = creep.room.spawns[0];
    myTravelTo(spawn);
  }

  function doCustom() {
  }

  creep.doDieIfNuke(25);

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_BOOST_ALL:
        doBoostAll();
        break;
      case STATE_GATHER:
        doGather();
        break;
      case STATE_WORK:
        doWork();
        break;
      case STATE_DIE:
        creep.doUnblock() || creep.doDie();
        break;
      case STATE_RENEW:
        doRenew();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_GATHER);
        break;
    }
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped at ' + creep.pos.link);
    stateLog.forEach(function(element) {
      console.log('state: ' + element.state + ' substate: ' + element.subState);
    });
  }
}

module.exports = {
  currentModel,
  getBody,
  getDefaultCreateOpts,
  getNewName,
  preUpdate,
  requestSpawn,
  run,
  runSpawning
};
