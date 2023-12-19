'use strict';

let Books = require('util_books');
let EventLog = require('util_event_log');
let SpawnJob = require('util_spawnJob');
let Varzs = require('util_varzs');


const STATE_INIT = 1;
const STATE_GATHER = 2;
const STATE_UPGRADE_STANDARD = 7;
const STATE_UPGRADE = 3;
const STATE_MOVE = 4;
const STATE_RENEW = 5;
const STATE_UNBOOST = 6;
const STATE_USE_SPAWN = 8;

function currentModel(energyBudget) {
  if (energyBudget >= 2300 && energyBudget < 2400) {
    return 11;
  }
  if (energyBudget >= 800 && energyBudget < 1200) {
    return 12;
  }
  if (energyBudget >= 500 && energyBudget < 600) {
    return 0;
  }
  if (energyBudget == 450) {
    return 12;
  }
  if (energyBudget < 450) {
    return 20;
  }
  return Math.max(0,Math.min(7, Math.floor(energyBudget / 600)));
}

function getBody(model) {
  if (!model) {
    return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
  }

  // Special spawn-feeder model
  if (model == 100) {
    return [WORK, CARRY];
  }

  // Mature RCL8 model
  if (model == 8) {
    return [WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,

        CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,

        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];
  }
  
  // Fast variant for remote MOVE.
  if (model == 10) {
    return [WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK,
      
        CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
      
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE];
  }

  // RCL6 model (inconveniently capped at 2300)
  if (model == 11) {
    return [WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK,

        CARRY, CARRY, CARRY, CARRY,
        
        MOVE, MOVE, MOVE, MOVE];
  }

  // RCL3 model
  if (model == 12) {
    return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE];
  }
  
  // RCL2 model
  if (model == 13) {
    return [WORK, WORK, WORK, CARRY, MOVE, MOVE];
  }
  
  // Token model
  if (model == 20) {
    return [WORK, CARRY, MOVE];
  }
  
  // Special model for RCL-7 upgrader sites with spawns. (Some LW bases.)
  if (model == 21) {
    return [WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY];
  }

  // RCL-8 lw model
  if (model == 22) {
    return [WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY];
  }

  let body = [];
  for (let i=0; i < model; i++) {
    body.push(WORK);
    body.push(WORK);
    body.push(WORK);
    body.push(WORK);
    body.push(WORK);
    body.push(CARRY);
    body.push(MOVE);
  }
  return body;
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
        role: 'upgrader',
        state: STATE_INIT,
        subState: 0,
        model: model
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Upgrader');
}

function requestSpawn(spawnRoom, model, workRoom, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = workRoom.name;
  let spawns;

  if (workRoom == spawnRoom) {
    let nearestSpawn = workRoom.controller.pos.findClosestByRange(workRoom.spawns);
    if (nearestSpawn) {
      spawns = [nearestSpawn.name];

      if (workRoom.upgradePositions) {
        opts.destination = workRoom.upgradePositions[0];
      }
      if (nearestSpawn.pos.isNearTo(workRoom.upgradePositions[0])) {
        opts.directions = [nearestSpawn.pos.getDirectionTo(workRoom.upgradePositions[0])];
      } else {
        /*let path = nearestSpawn.pos.findPathTo(workRoom.upgradePositions[0], {ignoreCreeps:true});
        if (path.length) {
          workRoom.logError(`Spawning upgrader at ${nearestSpawn.name}, setting spawn direction to ${path[0].direction}`);
          opts.directions = [path[0].direction];
        }*/
      }
    }
  }

  return SpawnJob.requestSpawnSpawn([spawnRoom.name], spawns, body, name, opts, priority);
}

let ticksToUnboostCache = {};

function ticksToUnboost(creep) {
  if (ticksToUnboostCache[creep.room.name]) {
    return ticksToUnboostCache[creep.room.name].ticks;
  }

  if (!creep.unboostLab) {
    creep.logError(`creeps without unboostLabs shouldn't be calling ticksToUnboost.`);
    creep.logError(`I can't unboost because no unboost lab.`);
    return Infinity;
  }

  let upgraderReferencePosition = creep.room.upgradePositions[0];

  if (!upgraderReferencePosition) {
    creep.logError(`I can't unboost because no upgradePositions.`);
    return Infinity;
  }

  let path = creep.room.findPath(upgraderReferencePosition, creep.unboostLab.pos, {range:1, ignoreCreeps:true});

  let ticksPerTile = Math.ceil(creep.getActiveBodyparts(WORK) / creep.getActiveBodyparts(MOVE));

  // Build in a safety margin. The path is crude.
  let ticks = path.length * ticksPerTile + 20;

  ticksToUnboostCache[creep.room.name] = {ticks};
  return ticks;
}

function shouldBoost(creep) {
  if (!creep.room.labs.length) {
    return false;
  }

  // Never boost model-20s. They don't live their whole lifespan.
  if (creep.memory.model == 20) {
    return false;
  }

  let workRoom = Game.rooms[creep.memory.workRoom];

  if (!workRoom || !workRoom.controller || !workRoom.controller.my) {
    return false;
  }

  let workParts = creep.getActiveBodyparts(WORK);
  if (creep.room.roughInventory('XGH2O') < workParts * LAB_BOOST_MINERAL) return false;
  
  // Always boost model-10s if you can.
  if (creep.memory.model == 10 && creep.room.roughInventory('XGH2O') > 1000) {
    return true;
  }

  if (workRoom.controller.level < 6) {
    return false;
  }

  if (workRoom.controller.level < 8) {
    return true;
  }

  let numBoostedUpgraders = _.filter(creep.room.upgraders, 'boosted').length;
  let numLabs =
      _.filter(creep.room.labs, l => l != creep.room.boostLab && l.cooldown < 1500).length;
  const numSpareLabs = 3;

  let excessAmt = workRoom.isVault ? 1000000 : 12000;

  return workRoom.controller.level == 8 &&
    numLabs > (numBoostedUpgraders + numSpareLabs) &&
    workRoom.roughInventory('XGH2O') > excessAmt;
}

function shouldUnboost(creep) {
  return creep.boosted && creep.unboostLab && creep.ticksToLive <= ticksToUnboost(creep);
}

function runSpawning(creep) {
  if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestBoost('XGH2O', creep.getActiveBodyparts(WORK));
    creep.room.requestBoost(creep);
    creep.room.requestUnboost(creep);
  }

  if (creep.memory.model == 100) {
    let spawn = Game.spawns[creep.memory.spawnedBy];
    if (spawn && spawn.spawning && (!spawn.spawning.directions || spawn.spawning.directions.length != 1)) {
      let direction = spawn.pos.getDirectionTo(creep.room.controller.pos);
      if (direction > 0 && direction <= 8) {
        spawn.spawning.setDirections([direction]);
      }
    }
  }
}

function finalReport(creep) {
  if (!creep.memory._experimentArm) return;

  if (creep.memory._lifetimeCpu < 0 || creep.memory._lifetimeCpu > 1000) {
    creep.logError(`Discarding creep with weird lifetimeCpu: ${creep.memory._lifetimeCpu}`);
    return;
  }

  if (!creep.memory._intents) return;

  if (creep.memory._experimentArm == 'treatment') {
    creep.logError('Treatment upgrader done');
    Memory.experiments.upgrader0.treatment.n += 1;
    Memory.experiments.upgrader0.treatment.total += creep.memory._lifetimeCpu;
    _.merge(Memory.experiments.upgrader0.treatment.intents,
        creep.memory._intents, function(a,b) {return (a||0) + (b||0);});
  } else if (creep.memory._experimentArm == 'control') {
    creep.logError('Control upgrader done');
    Memory.experiments.upgrader0.control.n += 1;
    Memory.experiments.upgrader0.control.total += creep.memory._lifetimeCpu;
    _.merge(Memory.experiments.upgrader0.control.intents,
        creep.memory._intents, function(a,b) {return (a||0) + (b||0);});
  }
}

function armReport(mem) {
  let meanCpu = mem.total / mem.n;
  let totalIntents = _.sum(mem.intents);
  let meanIntents = totalIntents / mem.n;
  let meanWaste = meanCpu - meanIntents/5;
  let meanIntentsDetail = _.transform(mem.intents, function(result, n, key) {result[key] = _.round(n / mem.n)});
  console.log(`n=${mem.n}, cpu=${_.round(meanCpu)}, waste=${_.round(meanWaste,1)}, intents=${_.round(meanIntents)}`);
  console.log(`intents detail=${JSON.stringify(meanIntentsDetail)}`);
}

global.upgrader0Report = function(reset) {
  if (Memory.experiments && Memory.experiments.upgrader0) {
    console.log('Treatment arm:');
    armReport(Memory.experiments.upgrader0.treatment);
    console.log('Control arm:');
    armReport(Memory.experiments.upgrader0.control);
  }

  if (reset) {
    if (!Memory.experiments) Memory.experiments = {};
    Memory.experiments.upgrader0 = {control:{total:0, n:0, intents:{}}, treatment:{total:0, n:0, intents:{}}};
    console.log('(resetting)');
  }
  return OK;
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];

  function setState(state) {
    creep.memory.state = state;
    creep.memory.substate = 0;
    repeat = true;
  }

  function doInit() {
    if (creep.memory.model == 100) {
      setState(STATE_USE_SPAWN);
      return;
    }

    if (creep.doBoost() == OK) {
      setState(STATE_MOVE);
      return;
    }
  }

  function doGather() {
    creep.logDebug('doGather');
    if (creep.ticksToLive < 100) {
      setState(STATE_DIE);
      return;
    }
    if (creep.memory.substate == 0) {
      const linkWithEnergy = creep.pos.findInRange(FIND_STRUCTURES, 2, {
        filter: (i) => i.structureType == STRUCTURE_LINK &&	i.energy >= creep.store.getCapacity()
      });
      if (linkWithEnergy.length) {
        creep.memory.substate = 2;
        creep.memory.linkId = linkWithEnergy[0].id;
        repeat = true;
        return;
      }
      if (creep.room.upgradeContainer && creep.room.upgradeContainer.store.energy) {
        creep.memory.substate = 1;
        creep.memory.containerId = creep.room.upgradeContainer.id;
        repeat = true;
        return;
      }
      if (creep.room.storage && creep.room.storage.store.energy) {
        creep.memory.substate = 1;
        creep.memory.containerId = creep.room.storage.id;
        repeat = true;
        return;
      }
      // None of that stuff? Just go to position then.
      setState(STATE_UPGRADE);
      return;
    }

    if (creep.memory.substate == 1) {
      if (creep.isFull) {
        creep.memory.containerId = null;
        setState(STATE_UPGRADE);
        return;
      }

      let containerObj = Game.getObjectById(creep.memory.containerId);
      let withdrawResult = creep.withdraw(containerObj, RESOURCE_ENERGY);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        creep.moveTo(containerObj, {
          visualizePathStyle: {
            stroke: '#ffaa00'
          }
        });
      } else if (withdrawResult == ERR_NOT_ENOUGH_RESOURCES) {
        creep.memory.containerId = null;
        setState(STATE_UPGRADE);
        return;
      }
    }

    if (creep.memory.substate == 2) {
      if (creep.store.energy == creep.store.getCapacity()) {
        creep.memory.containerId = null;
        setState(STATE_UPGRADE);
        return;
      }

      let linkObj = Game.getObjectById(creep.memory.linkId);
      let withdrawResult = creep.withdraw(linkObj, RESOURCE_ENERGY);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        creep.moveTo(linkObj, {
          visualizePathStyle: {
            stroke: '#ffaa00'
          }
        });
      } else if (withdrawResult == ERR_NOT_ENOUGH_RESOURCES) {
        creep.memory.linkObj = null;
        setState(STATE_UPGRADE);
        return;
      }
    }
  }

  function getDesiredPosition() {
    // If we're not in our work room, go to it.
    if (creep.room.name != creep.memory.workRoom) {
      return [creep.workRoomControllerPos, 1];
    }
    
    // If I'm blocking someone, move to accommodate them.
    //let blocked = creep.pos.blockedCreep();

    //if (blocked) {
      //creep.logDebug('unblocking');
      //creep.travelTo2(blocked, {range: 0});
    //}

    if (!creep.room.upgradePositions) {
      creep.logError('wtf room lacks upgradePositions');
      return [creep.room.controller.pos, 3];
    }
    
    let myPosition = creep.pos.findInRange(creep.room.upgradePositions, 0)[0];

    let openSpots = _.filter(
      creep.room.upgradePositions,
      p => !p.findInRange(FIND_CREEPS, 0).length);
      
    // If we're not yet on an upgrade spot, move to the nearest available if there is one,
    // and to the nearest unavailable if none are open.
    if (!myPosition) {
      let nearestOpen = creep.pos.findClosestByPath(openSpots);
      
      if (nearestOpen) {
        return [nearestOpen, 0];
      }

      let nearest = creep.pos.findClosestByPath(creep.room.upgradePositions);
      return [nearest, 1];
    }
    
    // If we're already on an upgrade spot, (usually) stay put.
    if (!creep.name.hashTime(10)) {
      return [creep.pos, 0];
    }
    
    // If there's a lower-indexed upgrade spot available, move to it.
    let openSpotsInRange = creep.pos.findInRange(openSpots, 1);

    if (!openSpotsInRange.length) {
      return [creep.pos, 0];
    }

    let mySpotIndex = _.indexOf(creep.room.upgradePositions, myPosition);
    let bestOpenIndex = _.indexOf(creep.room.upgradePositions, openSpotsInRange[0]);
    
    if (bestOpenIndex < mySpotIndex) {
      return [openSpotsInRange[0], 0]
    }

    return [creep.pos, 0];
  }

  function findNearbyLink() {
    // This method assumes that an upgrader near an upgradeLink won't be near any other
    // links. Occasionally check for this odd case, and complain if it exists.
    if (creep.id.hashTime(500)) {
      let nearbyLinks = creep.pos.findInRange(creep.room.links);
      if (nearbyLinks.length > 1) {
        creep.logError(`I see multiple links near the controller, which may confuse me.`);
      }
    }
    // Quick-out for the likely case in which the upgrader is near the upgradeLink.
    if (creep.room.upgradeLink && creep.pos.getRangeTo(creep.room.upgradeLink) == 1) {
      return creep.room.upgradeLink.energy && creep.room.upgradeLink;
    }
    return creep.pos.findInRange(creep.room.links, 1, {filter: l => l.energy})[0];
  }

  function shouldUrgentlyClearLink(link) {
    if (!link.energy) {
      return false;
    }
    if (link.isSendingLink) {
      // If it's a net sender anyway (like if it's also a boosted digsite), then it doesn't need clearing.
      return false;
    }
    if (creep.room.upgradeContainer && creep.room.upgradeContainer.store[RESOURCE_ENERGY] > 1000 ) {
      // Plenty of energy in the container. This isn't urgent.
      return false;
    }
    // Look for links from which the given link could receive energy. That's any other link
    // in the room that either has energy or is the storageLink, which may or may not have energy
    // but would promptly be loaded with some if we were hungry.
    return _.any(
      creep.room.links,
      l => !l.cooldown &&
         l.id != link.id &&
         (l.energy || l.id == creep.room.storageLink.id));
  }

  function shouldUpgrade() {
    if (creep.room.controller.ticksToDowngrade + 100 < creep.room.controller.maxTicksToDowngrade) {
      return true;
    }
    if (creep.room.roughEnergy > 25000 || creep.room.controller.level < 4) {
      return true;
    }

    return false;
  }
  
  function doUpgrade() {
    // done?
    if (creep.memory.model == 7 &&
        creep.room.controller && 
        creep.room.controller.my &&
        creep.room.controller.level == 8) {
      // Don't go to DIE state. You've got hardly any ticks left anyway. Just go.
      creep.suicide();
      return;
    }
    
    if (shouldUnboost(creep)) {
      finalReport(creep);
      setState(STATE_UNBOOST);
      return;
    }

    creep.room.memory._feedUpgradeLink = Game.time;

    // Model-20s are tick-stoppers. Die when ticks are topped up.        
    if (creep.memory.model == 20 &&
        creep.room.controller &&
        creep.room.controller.level == 8 &&
        creep.room.controller.ticksToDowngrade > 199900) {
      // Not worth recycling.
      creep.suicide();
      return;
    }
    
    // Special model-20 thing for feeding off the spawn.
    if (creep.memory.model == 20 &&
        !creep.store.energy &&
        creep.room.spawns.length &&
        creep.pos.isNearTo(creep.room.spawns[0]) &&
        creep.room.spawns[0].energy > 50) {
      creep.withdraw(creep.room.spawns[0], RESOURCE_ENERGY);
    }
    
    // upgrade
    if (creep.upgradeController(creep.room.controller) == OK) {
      Books.logEnergy(creep, 'upgrade', creep.getActiveBodyparts(WORK));
      Varzs.logUpgrade(creep.getActiveBodyparts(WORK));
    }

    // move
    
    let moveTarget;

    moveTarget = getDesiredPosition();

    creep.travelTo2(moveTarget[0], {range: moveTarget[1]});

    if (moveTarget &&
        moveTarget[0] &&
        creep.pos.isEqualTo(moveTarget[0]) &&
        creep.room.upgradeLink &&
        !creep.room.upgradeContainer &&
        creep.pos.isNearTo(creep.room.upgradeLink) &&
        creep.memory.model == 8) {
      if ((creep.room.controller.level == 8 && creep.memory.model == 8) ||
          (creep.room.baseType == 'lw')) {
        setState(STATE_UPGRADE_STANDARD);
        repeat = false;
        return;
      }
    }

    // load/unload
    
    // No loading/unloading until we're pretty close to the controller.
    if (creep.pos.getRangeTo(creep.room.controller) > 3) {
      return;
    }

    let withdrawing = false;
    let ePerTurn = creep.getActiveBodyparts(WORK);
    let lowOnEnergy = (creep.store.energy < 2*ePerTurn) && creep.store.XGH2O == 0;
    
    let nearbyLink = findNearbyLink();

    // If we're low, draw from any nearby link if it has any energy.
    if (!withdrawing && lowOnEnergy && nearbyLink) {
      // Draw from the upgradeContainer if it's got a lot...
      if (creep.room.upgradeContainer &&
          creep.room.upgradeContainer.store.energy >= 1000 &&
          creep.withdraw(creep.room.upgradeContainer, RESOURCE_ENERGY) == OK) {
        creep.logDebug('drawing energy from upgrade container because low');
        withdrawing = true;
      } else if (creep.withdraw(nearbyLink, RESOURCE_ENERGY) == OK) {
        creep.logDebug('drawing energy from link because low');
        withdrawing = true;
      }
    }

    let grabAmount = ePerTurn*4;
    let freeCapacity = creep.store.getFreeCapacity();
    
    // If the nearby link needs urgent clearing, and we've got significant open space or
    // enough to empty it, take from it.
    if (!withdrawing &&
        nearbyLink &&
        shouldUrgentlyClearLink(nearbyLink) &&
        (freeCapacity >= grabAmount || freeCapacity >= nearbyLink.energy)) {
      creep.logDebug('drawing energy from link because it urgently needs clearing');
      let withdrawResult = creep.withdraw(nearbyLink, RESOURCE_ENERGY);
      creep.logDebug('withdrawResult = ' + withdrawResult);
      withdrawing = true;
    }

    // If there are extensionContainers and we're near one and low on energy
    // and not near the terminal/storage, take some.
    if (!withdrawing &&
        lowOnEnergy &&
        creep.room.extensionContainers.length &&
        !creep.pos.isNearTo(creep.room.terminal) &&
        !creep.pos.isNearTo(creep.room.storage)) {
      let extensionContainer = creep.pos.findClosestInRange(creep.room.extensionContainers, 1);
      if (extensionContainer && extensionContainer.store.energy >= grabAmount) {
        creep.withdraw(extensionContainer, RESOURCE_ENERGY);
        withdrawing = true;
      }
    }

    // If the upgradeContainer has energy, we aren't already withdrawing from the
    // upgradeLink, and we're low on energy, take some.
    if (!withdrawing &&
        lowOnEnergy &&
        !creep.room.extensionContainers.length &&
        creep.room.upgradeContainer &&
        (!creep.room.terminal ||
            !creep.room.terminal.active ||
            !creep.pos.isNearTo(creep.room.terminal)) &&
        creep.pos.isNearTo(creep.room.upgradeContainer) &&
        creep.room.upgradeContainer.store.energy >= grabAmount) {
      // If there's no upgradeLink, take as much as we can carry.
      if (!creep.room.upgradeLink) {
        grabAmount = creep.store.getFreeCapacity();
      }
      creep.logDebug(`Pulling from upgrade container because we're low`);
      creep.withdraw(creep.room.upgradeContainer,
          RESOURCE_ENERGY,
          Math.min(creep.room.upgradeContainer.store.energy, grabAmount));
      withdrawing = true;
    }
    
    // If we're near an active terminal that has energy, and we're low, pull
    // from that.
    if (!withdrawing &&
        lowOnEnergy &&
        creep.room.terminal &&
        creep.room.terminal.active &&
        creep.pos.isNearTo(creep.room.terminal) &&
        creep.room.terminal.store.energy) {
      creep.withdraw(creep.room.terminal, RESOURCE_ENERGY);
      withdrawing = true;      
    }

    // If we're near a storage that has energy, and we're low, pull from
    // that.
    if (!withdrawing &&
        lowOnEnergy &&
        creep.room.storage &&
        creep.pos.isNearTo(creep.room.storage) &&
        creep.room.storage.store.energy) {
      creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
      withdrawing = true;
    }

    // If we're near a container other than the upgradeContainer that has
    // energy, and we're low, pull from that.
    if (!withdrawing && lowOnEnergy) {
      let nearContainer = creep.pos.findInRange(
          _.difference(creep.room.containers, [creep.room.upgradeContainer]),
          1,
          {filter: c => c.store.energy})[0];
      if (nearContainer) {
        creep.logDebug(`Pulling from other container because it has energy and we're low`);
        creep.withdraw(nearContainer, RESOURCE_ENERGY);
        withdrawing = true;
      }
    }
    
    // If we're near an inactive terminal that has energy, and we're low,
    // pull from that.
    if (!withdrawing &&
        lowOnEnergy &&
        creep.room.terminal &&
        !creep.room.terminal.active &&
        creep.pos.isNearTo(creep.room.terminal) &&
        creep.room.terminal.store.energy) {
      creep.withdraw(creep.room.terminal, RESOURCE_ENERGY);
      withdrawing = true;
    }

    // If the upgrade container is low on energy, there is a receiving upgrade link, 
    // and we're near to full, deposit some energy.
    if (!withdrawing &&
        creep.room.upgradeContainer &&
        creep.room.upgradeLink &&
        creep.room.upgradeContainer.store.energy < CONTAINER_CAPACITY/3 &&
        creep.room.upgradeLink.isReceivingLink &&
        creep.store.energy > ePerTurn*8) {
      let containerSpace = CONTAINER_CAPACITY - _.sum(creep.room.upgradeContainer.store);
      let myExcess = creep.store.energy - ePerTurn*6;
      let transferAmount = Math.min(containerSpace, myExcess);
      creep.logDebug(`Depositing to upgrade container because it's low, there's a receiving ` +
          `link, and we're near to full`);
      creep.myTransfer(creep.room.upgradeContainer, RESOURCE_ENERGY, transferAmount);
      withdrawing = true;
    }
    
    // Fill an extensionContainer if we can reach.
    if (!withdrawing &&
        creep.room.controller.level < 8 &&
        creep.room.extensionContainers.length &&
        (creep.pos.isNearTo(creep.room.terminal) ||
          creep.pos.isNearTo(creep.room.storage)) &&
        creep.store.energy > ePerTurn * 2) {
      let extensionContainer = creep.pos.findClosestInRange(creep.room.extensionContainers, 1);
      if (extensionContainer && (extensionContainer.storeCapacity > _.sum(extensionContainer.store))) {
        let containerSpace = extensionContainer.storeCapacity - _.sum(extensionContainer.store);
        let myExcess = creep.store.energy - ePerTurn*2;
        let transferAmount = Math.min(containerSpace, myExcess);
        creep.myTransfer(extensionContainer, RESOURCE_ENERGY, transferAmount);
        withdrawing = true;
      }
    }
    
    // If we're near a tombstone with energy, loot it.
    if (!withdrawing && creep.id.hashTime(20)) {
      let stones = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
          filter: t => t.store.energy
      });
      
      if (stones.length) {
        creep.withdraw(stones[0], RESOURCE_ENERGY);
        withdrawing = true;
      }
    }

    if (!withdrawing && creep.room.terminal.servingController && creep.room.labs.length) {
    let labs = _.filter(creep.room.labs, 'servingController');
      let nearLabs = creep.pos.findInRange(labs, 1);
      if (nearLabs.length) {
        let lab = nearLabs[0];

        // If we're holding boost and the lab has room for some, try to dump it to the lab
        if (!withdrawing && creep.store.XGH2O && lab.store.getFreeCapacity('XGH2O')) {
          creep.logDebug('Dumping boost to lab');
          creep.myTransfer(lab, 'XGH2O');
          withdrawing = true;
        }

        // If we're holding boost and we're near the terminal, dump to it.
        if (!withdrawing &&
            creep.store.XGH2O &&
            creep.room.terminal &&
            creep.pos.isNearTo(creep.room.terminal)) {
          creep.logDebug('Dumping boost to terminal');
          creep.myTransfer(creep.room.terminal, 'XGH2O');
          withdrawing = true;
        }

        // If we're near a lab that's serving the controller and it needs energy, feed it.
        if (!withdrawing && lab && lab.store.getFreeCapacity(RESOURCE_ENERGY) && creep.store.energy > 50) {
          creep.myTransfer(lab, RESOURCE_ENERGY);
          withdrawing = true;
        }

        // If the lab needs boost, maybe load some from the terminal.
        if (!withdrawing &&
            creep.room.terminal &&
            creep.pos.isNearTo(creep.room.terminal) &&
            creep.room.terminal.store.XGH2O >= 100 &&
            lab.store.getFreeCapacity('XGH2O') >= 1000 &&
            creep.store.getFreeCapacity() >= 100) {
          creep.logDebug('Drawing boost from terminal');
          creep.withdraw(creep.room.terminal, 'XGH2O');
          withdrawing = true;
        }
      }
    }
  }
  
  // Simple case: RCL8, upgradeLink exists and is within reach, model 8, and already on an
  // upgradePosition.
  function doUpgradeStandard() {
    if (shouldUnboost(creep)) {
      setState(STATE_UNBOOST);
      return;
    }

    let workParts = creep.getActiveBodyparts(WORK);
    
    // upgrade
    if (shouldUpgrade()) {
      creep.upgradeController(creep.room.controller);
      Books.logEnergy(creep, 'upgrade', workParts);
      Varzs.logUpgrade(workParts);
    }

    // load/unload
    
    let lowOnEnergy = (creep.store.energy < 2*workParts);
    let nearbyLink = creep.room.upgradeLink;
    creep.room.memory._feedUpgradeLink = Game.time;

    // If we're low, draw from any nearby link if it has any energy.
    if (lowOnEnergy) {
      // Draw from the upgradeContainer if it's got a lot
      if (creep.room.upgradeContainer &&
          creep.room.upgradeContainer.store.energy >= 1000 &&
          creep.withdraw(creep.room.upgradeContainer, RESOURCE_ENERGY) == OK) {
        creep.logDebug('drawing energy from upgrade container because low');
      // Or from the link if it's got any.
      } else if (nearbyLink.store.energy && creep.withdraw(nearbyLink, RESOURCE_ENERGY) == OK) {
        creep.logDebug('drawing energy from link because low');
      }
    }
  }
  
  function doMove() {
    if (creep.room.name == creep.memory.workRoom) {
      setState(STATE_UPGRADE);
    } else {
      creep.travelTo2(creep.workRoomControllerPos, {range: 1});
    }
  }
  
  function doRenew() {
    let nearestSpawn = creep.pos.findClosestByPath(creep.room.spawns);
    if (creep.ticksToLive > 1480) {
      setState(STATE_INIT);
    } else {
      creep.travelTo2(nearestSpawn);
    }
  }

  function pickUpPile() {
    let piles = creep.pos.lookFor(LOOK_RESOURCES);
    if (piles.length) {
      return creep.pickup(piles[0]);
    }
  }

  function doUnboost() {
    if (!creep.boosted) {
      pickUpPile();
      setState(STATE_DIE);
      return;
    }

    if (creep.store.energy) {
      if (creep.room.terminal &&
          creep.pos.isNearTo(creep.room.terminal.pos) &&
          creep.room.terminal.store.getFreeCapacity(RESOURCE_ENERGY)) {
        creep.myTransfer(creep.room.terminal, RESOURCE_ENERGY);
      } else if (creep.fatigue) {
        // Energy might greatly slow us down.
        creep.drop(RESOURCE_ENERGY);
      }
    }

    if (creep.ticksToLive == 1) {
      creep.logError(`Boosted upgrader failed to unboost in time.`);
      EventLog.writeEntry(EventLog.DEBUG, creep.room.name, `failed to unboost`);
    }

    if (creep.unboostLab) {
      if (creep.unboostLab.unboostCreep(creep) == OK) {
        if (creep.store.getFreeCapacity() < 224) {
          creep.drop(RESOURCE_ENERGY, 224 - creep.store.getFreeCapacity());
        }
      } else {
        creep.travelTo2(creep.unboostLab, {range: 1, maxRooms:1});
      }
      return;
    }

    if (!creep.memory.targetLabId) {
      let targetLab = creep.pos.findClosestByPath(
          creep.room.labs,
          {filter: 'availableForUnboost'});
      creep.memory.targetLabId = targetLab && targetLab.id;
    }

    let lab = Game.getObjectById(creep.memory.targetLabId);

    if (!lab) {
      creep.logError(`Boosted upgrader cannot unboost because no labs available.`);
      setState(STATE_DIE);
      return;
    }
  }

  function doUseSpawn() {
    let spawn = Game.spawns[creep.memory.spawnedBy];
    if (spawn && !creep.store.energy && spawn.store.energy >= 50) {
      creep.withdraw(spawn, RESOURCE_ENERGY);
    }

    if (creep.store.energy) {
      creep.upgradeController(creep.room.controller);
    }

    if (creep.room.controller.ticksToDowngrade > creep.room.controller.maxTicksToDowngrade - 101) {
      creep.suicide();
    }
  }

  function doCustom() {
  }

  if (!creep.memory.workRoom) {
    creep.memory.workRoom = creep.room.name;
  }

  if (creep.ticksToLive == 1) {
    finalReport(creep);
  }
  
  do {
    repeat = false;
    maxRepeat--;
    
    switch (creep.memory.state) {
      case STATE_UPGRADE_STANDARD:
        doUpgradeStandard();
        break;
      case STATE_INIT:
        doInit();
        break;
      case STATE_GATHER:
        doGather();
        break;
      case STATE_UPGRADE:
        doUpgrade();
        break;
      case STATE_MOVE:
        doMove();
        break;
      case STATE_RENEW:
        doRenew();
        break;
      case STATE_UNBOOST:
        doUnboost();
        break;
      case STATE_USE_SPAWN:
        doUseSpawn();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_GATHER);
        break;
    }
    stateLog.push({state: creep.memory.state, subState: creep.memory.subState});
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
  requestSpawn,
  run,
  runSpawning
};