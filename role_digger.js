'use strict';

let Books = require('util_books');
let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');
let Varzs = require('util_varzs');

const STATE_DEPLOY = 1;
const STATE_DIG = 2;
const STATE_DIG_REMOTE = 3;
const STATE_DIG_SIMPLE_LINKED = 4;
const STATE_DIG_EXTENSIONS = 5;
const STATE_DIG_BASE_MINERAL = 6;
const STATE_IDLE = 10;
const STATE_INIT = 11;

// Diggers that feed extensions try to maintain at least this much in container.
const EXTENSION_CONTAINER_BUFFER = 800;

function getBody(model) {
  switch (model) {
    case 17: // lw freshg RCL6 mineral digger
      return _.fill(Array(17), WORK);
    case 15: // rcl-4 harvester.
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          CARRY,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK];
    case 14: // unboosted spawn link variant
      return [CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK];
    case 13: // lw RCL7+ mineral digger
      return _.fill(Array(50), WORK);
    case 12: // lw RCL6 mineral digger
      return [WORK, WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK];
    case 11: // boosted spawn variant.
      return [CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK];
    case 10: // boosted & linked digsite variant
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK];
    case 9: // super-lightweight RCL1 model
      return [MOVE, CARRY, WORK, WORK];
    case 8: // lightweight RCL2 model
      return [MOVE, MOVE, CARRY, WORK, WORK, WORK, WORK];
    case 7: // CPU-efficient linked digsite variant
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          WORK, WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK];
    case 6: // mineral site variant, RCL 7+
      return [WORK, WORK, WORK, WORK, WORK,   WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,   WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,   WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,   WORK, WORK, WORK, WORK, WORK,
          MOVE, MOVE, MOVE, MOVE, MOVE,   MOVE, MOVE, MOVE, MOVE, MOVE];
    case 5: // high-capacity variant, for mineral sites. (RCL 6+)
      return [WORK, WORK, WORK, WORK, WORK,   WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,   WORK, WORK, WORK, WORK, WORK,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 4: // high-capacity variant for mineral sites (fresh RCL6)
      return [MOVE, MOVE, MOVE,
          WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK];
    case 3: // remote mining
      return [MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,
          CARRY,
          WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK];
    case 2: // boosted simple linked digsite (replacement for model-10)
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE,
          CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK];
    case 1: // standard variant
      return [MOVE, MOVE, MOVE, CARRY, WORK, WORK, WORK, WORK, WORK, WORK];
    default:
      console.log('Digger.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
      memory: {
          role: 'digger',
          model: model,
          state: STATE_INIT,
          subState: 0,
      }
  };
}

function getNewName() {
  return getUniqueCreepName('Digger');
}

function requestSpawn(rooms, model, priority, target, workRoom) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.target = target;
  opts.memory.workRoom = workRoom;
  let spawns;
  let digsiteMem = Memory.rooms[workRoom].digsites &&
    Memory.rooms[workRoom].digsites[target];

  if (!digsiteMem) {
    console.log(`Digger.requestSpawn FAIL: no digsite memory for source ${target} in room ${workRoom}`);
    return ERR_FAILED_PRECONDITION;
  }

  let diggerPosition = new RoomPosition(
    digsiteMem.diggerPosition.x,
    digsiteMem.diggerPosition.y,
    workRoom);

  if (digsiteMem.spawn && workRoom == rooms[0]) {
    let spawnObj = Game.getObjectById(digsiteMem.spawn);
    if (!spawnObj) {
      console.log(`Digger.requestSpawn FAIL: source ${target} in room ${workRoom} has bad spawn id`);
      return ERR_FAILED_PRECONDITION;
    }

    if (!spawnObj.pos.isNearTo(diggerPosition)) {
      console.log(`Digger.requestSpawn FAIL: source ${target} in room ${workRoom} has a spawn that` +
          ` isn't next to its diggerPosition`);
      return ERR_FAILED_PRECONDITION;
    }

    let spawnDirection = spawnObj.pos.getDirectionTo(diggerPosition);

    opts.directions = [spawnDirection];
    spawns = [spawnObj.name];
  } else {
    opts.destination = diggerPosition;
  }

  return SpawnJob.requestSpawnSpawn(rooms, spawns, body, name, opts, priority);
}

let containersCache = {};
let lastCleanCacheTime = 0;

function cleanCache() {
  if (lastCleanCacheTime + 1500 > Game.time) {
    return;
  }

  for (let key in containersCache) {
    if (!Game.getObjectById(key)) {
      delete containersCache[key];
    }
  }

  lastCleanCacheTime = Game.time;
}

function damagedContainerInRepairRange(creep) {
  cleanCache();

  if (!containersCache[creep.id]) {
    containersCache[creep.id] = _.map(creep.pos.findInRange(creep.room.containers, 3), 'id');
  }

  let repairPower = creep.repairPower;
  let containers = _.compact(_.map(containersCache[creep.id], Game.getObjectById));

  return _.find(containers, c => c.hits + repairPower <= c.hitsMax);
}

function needyLinkRampartInRepairRange(creep) {
  let myRampartObj = creep.pos.rampart();
  let digsite = Memory.rooms[creep.memory.workRoom].digsites[creep.memory.target];
  let linkObj = Game.getObjectById(digsite.link);
  let linkRampartObj = linkObj && linkObj.pos.rampart();
  if (myRampartObj && myRampartObj.hits < 10000000) {
    if (!linkRampartObj || linkRampartObj.hits > myRampartObj.hits) {
      return myRampartObj;
    }
  }

  if (linkRampartObj && linkRampartObj.hits < 10000000) {
    if (!myRampartObj || myRampartObj.hits > linkRampartObj.hits) {
      return linkRampartObj;
    }
  }
}

let roadCache = {};
let lastRoadCacheCleanTime = 0;

function cleanRoadCache() {
  if (lastRoadCacheCleanTime + 1500 > Game.time) {
    return;
  }

  for (let key in roadCache) {
    if (!Game.getObjectById(key)) {
      delete roadCache[key];
    }
  }

  lastRoadCacheCleanTime = Game.time;
}

function findNearbyRoads(creep) {
  cleanRoadCache();
  if (roadCache[creep.id] && (roadCache[creep.id].timestamp + 1000 > Game.time)) {
    let roads = _.compact(_.map(roadCache[creep.id].roadIds, Game.getObjectById));
    if (roads.length == roadCache[creep.id].roadIds.length) {
      return roads;
    }
  }

  let roads = creep.pos.findInRange(creep.room.repairableRoads, 3);
  let roadIds = _.map(roads, 'id');
  let timestamp = Game.time;

  roadCache[creep.id] = {roadIds, timestamp};
  return roads;
}

function damagedRoadInRepairRange(creep) {
  let roads = findNearbyRoads(creep);

  return _.find(roads, c => c.hits + creep.repairPower <= c.hitsMax);
}

function finalReport(creep) {
  if (!creep.memory._experimentArm) return;

  if (creep.memory._lifetimeCpu < 0 || creep.memory._lifetimeCpu > 1000) {
    return;
  }

  if (!creep.memory._intents) return;

  // Boosted sites mess with the data.
  let targetObj = Game.getObjectById(creep.memory.target);
  if (targetObj.hasRegen) return;

  if (creep.memory._experimentArm == 'experiment') {
    Memory.rollout.experiment.n += 1;
    Memory.rollout.experiment.total += creep.memory._lifetimeCpu;
    _.merge(Memory.rollout.experiment.intents, creep.memory._intents, function(a,b) {return (a||0) + (b||0);});
  } else if (creep.memory._experimentArm == 'control') {
    Memory.rollout.control.n += 1;
    Memory.rollout.control.total += creep.memory._lifetimeCpu;
    _.merge(Memory.rollout.control.intents, creep.memory._intents, function(a,b) {return (a||0) + (b||0);});
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

global.rolloutReport = function(reset) {
  console.log('Control arm:');
  armReport(Memory.rollout.control);
  console.log('Experiment arm:');
  armReport(Memory.rollout.experiment);

  if (reset) {
    Memory.rollout = {control:{total:0, n:0, intents:{}}, experiment:{total:0, n:0, intents:{}}};
    console.log('(resetting)');
  }
  return OK;
}

global.classifyDigger = function(creep) {
  return classify(creep);
}

function classify(creep) {
  let workRoom = Game.rooms[creep.memory.workRoom];
  let digsite = Memory.rooms[creep.memory.workRoom].digsites[creep.memory.target];
  let containerObj = Game.getObjectById(digsite.container);
  let linkObj = Game.getObjectById(digsite.link);
  let digPosition = new RoomPosition(
      digsite.diggerPosition.x,
      digsite.diggerPosition.y,
      creep.memory.workRoom);
  let numExtensions = workRoom.isMyBase && digPosition.findInRange(workRoom.diggerExtensions, 1).length || 0;

  if (workRoom.isMyBase) {
    if (digsite.mineralId) return 'baseMineral';

    if (!containerObj &&
        linkObj &&
        creep.store.getCapacity() == 400) {
      // This is simpleLinked even if there's nearby extensions. No container means we don't intend
      // for the digger to service the extensions.
      return 'simpleLinked';
    }

    if (containerObj == workRoom.upgradeContainer && linkObj == workRoom.upgradeLink) {
      return (digsite.spawn || numExtensions) ? 'upgraderWithExtensions' : 'upgraderSansExtensions';
    }

    if (containerObj != workRoom.upgradeContainer &&
        containerObj &&
        linkObj != workRoom.upgradeLink &&
        numExtensions &&
        creep.store.getCapacity() == 400) {
      return 'extensions';
    }

    if (containerObj && !linkObj && containerObj != workRoom.upgradeContainer && numExtensions == 0 && !digsite.spawn) {
      return 'simpleContainer';
    }

    if (containerObj && !linkObj && containerObj != workRoom.upgradeContainer) {
      return 'extensionsSansLink';
    }

    console.log(`oddball dig position dp=${digPosition}`);
    console.log(`${containerObj != workRoom.upgradeContainer} ${linkObj != workRoom.upgradeLink} ${numExtensions}`);

    return 'baseOddball';
  } else if (workRoom.memory.role == 'mine') {
    return 'simpleRemote';
  } else if (workRoom.memory.role == 'skLair') {
    return digsite.mineralId ? 'skMineral' : 'skSource';
  }
  return 'unknown';
}

function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  let digsite;
  let digPosition;
  
  if (creep.ticksToLive == 1) {
    finalReport(creep);
  }

  if (Memory.rooms[creep.memory.workRoom].digsites) {
    digsite = Memory.rooms[creep.memory.workRoom].digsites[creep.memory.target];
    digPosition = new RoomPosition(
        digsite.diggerPosition.x,
        digsite.diggerPosition.y,
        creep.memory.workRoom);
  }

  function myTravelTo(target) {
    return creep.travelTo2(target);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function logArrivalTime() {
    if (!creep.memory.arrivalTime) {
      creep.memory.arrivalTime = Game.time;
      if (!digsite.digger.arrivalTimes) {
        digsite.digger.arrivalTimes = [];
      }
      digsite.digger.arrivalTimes.unshift(
          CREEP_LIFE_TIME - (creep.ticksToLive + (creep.memory.safeDelayTicks || 0)));
      digsite.digger.arrivalTimes = _.slice(digsite.digger.arrivalTimes, 0, 10);
    }
  }

  function maybeKillPredecessor() {
    let predecessor = creep.pos.findInRange(creep.room.myCreeps, 1, {
      filter: (c) => c.memory.role == 'digger' &&
               c.memory.target == creep.memory.target &&
               c.ticksToLive < creep.ticksToLive
    })[0];

    if (predecessor) {
      finalReport(predecessor);
      predecessor.suicide();
      predecessor.memory.state = STATE_IDLE;
    }
  }

  function maybeRepair() {
    if (Game.time < creep.memory._nextDamagedStuffCheck) return;

    let workParts = creep.getActiveBodyparts(WORK);
    if (!workParts || creep.store.energy < workParts) return;

    // If there's a can or road within 3 which could do with repair, and
    // I've got enough energy to repair, repair instead of harvesting.
    let target = damagedContainerInRepairRange(creep) ||
        damagedRoadInRepairRange(creep) ||
        needyLinkRampartInRepairRange(creep);
    
    if (target) {
      if (creep.repair(target) == OK) {
        if (creep.memory._intents) creep.memory._intents.repair += 1;
      }
      Books.logEnergy(creep, 'diggerRepair', workParts);
      digsite.diggerAction = ACTION_REPAIR;
      
      // If there is energy in the source, repair at most every sixth tick.
      let targetObj = Game.getObjectById(creep.memory.target);
      if (targetObj.energy) {
        creep.memory._nextDamagedStuffCheck = Game.time + 6;
      }
      return true;
    } else {
      // Nothing needs repair. Don't check again until my container
      // decays, or 25 ticks if I have no container.
      let containerObj = Game.getObjectById(digsite.container);
      if (containerObj) {
        creep.memory._nextDamagedStuffCheck = Game.time + containerObj.ticksToDecay;
      } else {
        creep.memory._nextDamagedStuffCheck = Game.time + 25;
      }
    }
    return false;
  }

  function maybeBuild() {
    if (Game.time < creep.memory._nextBuildSiteCheck) return;

    let workParts = creep.getActiveBodyparts(WORK);
    if (!workParts || creep.store.energy < workParts * BUILD_POWER) return;

    let buildSite = creep.pos.findInRange(creep.room.constructionSites, 3)[0];

    if (!buildSite) {
      // No build sites. Don't look again for 250 ticks.
      creep.memory._nextBuildSiteCheck = Game.time + 250;
      return false;
    }

    if (creep.myBuild(buildSite) == OK) {
      if (creep.memory._intents) creep.memory._intents.build += 1;
    }
    Books.logEnergy(creep, 'diggerBuild', workParts * BUILD_POWER);
    digsite.diggerAction = ACTION_BUILD;
    return true;
  }

  function doDeploy() {
    if (digPosition && !creep.pos.isEqualTo(digPosition)) {
      if (creep.pos.isNearTo(digPosition)) {
        maybeKillPredecessor();
      }
      if (myTravelTo(digPosition) == OK && creep.memory._intents) {
        creep.memory._intents.move += 1;
      }
      return;
    }

    // We've arrived.
    logArrivalTime();

    switch (classify(creep)) {
      case 'simpleRemote':
        setState(STATE_DIG_REMOTE);
        break;
      case 'simpleLinked':
        setState(STATE_DIG_SIMPLE_LINKED);
        break;
      case 'extensions':
        setState(STATE_DIG_EXTENSIONS);
        initExtensions();
        //creep.memory._intents = {move:0, harvest:0, withdraw:0, transfer:0, build:0, repair:0, other:0};
        break;
      case 'baseMineral':
        setState(STATE_DIG_BASE_MINERAL);
        break;
      case 'upgraderWithExtensions':
      case 'extensionsSansLink':
        setState(STATE_DIG);
        initExtensions();
        break;
      default:
        setState(STATE_DIG);
        break;
    }
    repeat = true;
  }

  function doDigRemote() {
    let targetObj = Game.getObjectById(creep.memory.target);
    if (!targetObj) {
      creep.logError('I have no target!');
      return;
    }

    if (maybeRepair()) return;
    
    if (maybeBuild()) return;

    // Do the harvest
    if (!targetObj.energy) {
      digsite.diggerAction = ACTION_IDLE_EMPTY;
      return;
    }

    let containerObj = Game.getObjectById(digsite.container);

    if (containerObj &&
        (creep.harvestPower > creep.store.getFreeCapacity() +
            containerObj.store.getFreeCapacity())) {
      digsite.diggerAction = ACTION_IDLE_FULL;
      return;
    }

    if (Game.cpu.bucket < 7000 && !digsite.spawn && !digsite.link) {
      digsite.diggerAction = ACTION_IDLE_BUCKET;
      return;
    }

    if (creep.harvest(targetObj) != OK) {
      digsite.diggerAction = ACTION_FAILED;
      return;
    }

    Books.logEnergy(creep, 'harvested', creep.harvestPower);
    Varzs.logHarvest(creep.harvestPower);
    digsite.diggerAction = ACTION_HARVEST;
    return;
  }

  function doDigSimpleLinked() {
    let targetObj = Game.getObjectById(creep.memory.target);

    if (maybeRepair()) return;
    
    if (maybeBuild()) return;

    const linkObj = Game.getObjectById(digsite.link);

    // Maybe dump energy to link.
    if (creep.store.energy && linkObj) {
      let linkSpace = linkObj.store.getFreeCapacity(RESOURCE_ENERGY);

      // Special code for linked haulers with exactly 400 capacity.
      if (creep.store.energy >= 400 && linkSpace >= 400) {
        creep.logDebug('sending 400 to the link');
        creep.myTransfer(linkObj, RESOURCE_ENERGY);
        Books.logEnergy(creep, 'diggerLink', 400);
      }
    }
    
    // Do the harvest
    if (targetObj.energy < creep.harvestPower) {
      digsite.diggerAction = ACTION_IDLE_EMPTY;
      return;
    }

    // Don't get fancy here. Harvest if there's any room at all, even if there's not enough. Store
    // is a multiple of the harvest amount, so mostly if there's any room, there's enough. If there
    // isn't, spilling a little energy will clear the oddness.
    if (!creep.store.getFreeCapacity()) {
      digsite.diggerAction = ACTION_IDLE_FULL;
      return;
    }
    
    if (creep.harvest(targetObj) != OK) {
      digsite.diggerAction = ACTION_FAILED;
      return;
    }

    Books.logEnergy(creep, 'harvested', creep.harvestPower);
    Varzs.logHarvest(creep.harvestPower);
    digsite.diggerAction = ACTION_HARVEST;
    return;
  }

  function initExtensions() {
    creep.memory._extensions = _.map(
        digPosition.findInRange(_.union(creep.room.diggerExtensions, creep.room.spawns), 1),
        'id');
  }

  function doDigExtensions() {
    let targetObj = Game.getObjectById(creep.memory.target);

    if (maybeRepair()) return;
    
    if (maybeBuild()) return;

    let linkObj = Game.getObjectById(digsite.link);
    let containerObj = Game.getObjectById(digsite.container);

    // Maybe load extensions.
    let needer = _.find(
        creep.memory._extensions.map(Game.getObjectById),
        c => c.store.getFreeCapacity(RESOURCE_ENERGY));
    let needAmount = needer && needer.store.getFreeCapacity(RESOURCE_ENERGY) || 0;

    if (needAmount > 0) {
      let harvestAmount = Math.min(creep.harvestPower, targetObj.energy);
      if (creep.store.energy >= needAmount) {
        creep.myTransfer(needer, RESOURCE_ENERGY);
        Books.logEnergy(creep, 'diggerExtensions', needAmount);
      } else if (needAmount > creep.store.energy + harvestAmount) {
        creep.withdraw(containerObj, RESOURCE_ENERGY);
      }
    // Maybe load link.
    } else if (containerObj.store.energy >= EXTENSION_CONTAINER_BUFFER &&
        creep.store.energy == 400) {
      if (linkObj.store.getFreeCapacity(RESOURCE_ENERGY) >= 400) {
        creep.myTransfer(linkObj, RESOURCE_ENERGY);
        Books.logEnergy(creep, 'diggerLink', 400);
      }
    // Don't let the container get too full.
    } else if (creep.store.energy < 100 &&
        containerObj.store.energy > 1000 &&
        linkObj.store.getFreeCapacity(RESOURCE_ENERGY)) {
      creep.withdraw(containerObj, RESOURCE_ENERGY);
    }

    // Do the harvest
    if (targetObj.energy < creep.harvestPower) {
      digsite.diggerAction = ACTION_IDLE_EMPTY;
      return;
    }

    if (creep.harvestPower >
          creep.store.getFreeCapacity() + containerObj.store.getFreeCapacity()) {
      // special: Check for the trap wheree the container is full, and we're too full to
      // harvest, but not quite full. NOTE: This shouldn't happen anymore, now that we have that
      // sipping code up above. If it's been some time since we saw this warning, it can go.
      // Update: 2023-06-12: It can still happen in owned mines with two digsiteLinks feeding a single
      // upgradeLink. They can get backed up pretty good.
      if (!linkObj.cooldown && creep.store.getFreeCapacity()) {
        if (creep.room.name != 'W31S16') {
          // Don't want to hear it if it's W31S16. I know, and don't care.
          creep.logError(`${creep.pos.link} I think I'm in the extension digger trap. Loading from container`);
          creep.say('trapped');
        }
        creep.withdraw(containerObj, RESOURCE_ENERGY);
      } else {
        digsite.diggerAction = ACTION_IDLE_FULL;
      }
      return;
    }
    
    if (creep.harvest(targetObj) != OK) {
      digsite.diggerAction = ACTION_FAILED;
      return;
    }

    Books.logEnergy(creep, 'harvested', creep.harvestPower);
    Varzs.logHarvest(creep.harvestPower);
    digsite.diggerAction = ACTION_HARVEST;
    return;
  }

  function doDigBaseMineral() {
    let targetObj = Game.getObjectById(creep.memory.target);

    if (digPosition && !creep.pos.isEqualTo(digPosition)) {
      myTravelTo(digPosition);
      return;
    }
    
    let containerObj = Game.getObjectById(digsite.container);
    const containerSpace = (containerObj && containerObj.store.getFreeCapacity()) || 0;

    let workParts = creep.getActiveBodyparts(WORK);
    let mineralHarvestAmount = workParts;
    if (targetObj.mineralAmount == 0 && targetObj.ticksToRegeneration > creep.ticksToLive) {
      // We're done. Go ahead and shut down.
      setState(STATE_DIE);
    } else if (creep.room.extractor.cooldown) {
      //creep.say('🚬');
    } else if (containerObj && mineralHarvestAmount <= containerSpace) {
      creep.harvest(targetObj);
    } 
    return;
  }

  function doDig() {
    let targetObj = Game.getObjectById(creep.memory.target);

    // Move to the safe spot if the site isn't safe.
    if (Memory.rooms[creep.memory.workRoom].role == 'skLair') {
      let myLair = targetObj.lair;
        if (myLair.keeper || myLair.ticksToSpawn < 10) {
        if (creep.store.energy && targetObj && targetObj.container) {
          creep.myTransfer(targetObj.container, RESOURCE_ENERGY);
        }
        if (creep.pos.getRangeTo(myLair.keeper || myLair) < 6) {
          digsite.diggerAction = ACTION_FLEE;
          if (myLair.keeper || myLair.ticksToSpawn < 10) {
            let path = PathFinder.search(
                creep.pos,
                {pos: (myLair.keeper || myLair).pos, range:5},
                {flee: true, maxRooms:1, roomCallback: RoomCallback.avoidMyCreepsCallback});
            myTravelTo(path.path[0], {range:0});
            return;
          }
        }
      }
    }

    if (digPosition && !creep.pos.isEqualTo(digPosition)) {
      myTravelTo(digPosition);
      return;
    }
    
    logArrivalTime();
    
    // TODO: If you don't have a container, don't run extensions. And maybe don't run extensions
    // in a bunker even if you DO have a container.
    if (!creep.memory._extensions && creep.room.extensions && creep.room.extensions.length) {
      creep.memory._extensions = _.map(creep.pos.findInRange(creep.room.diggerExtensions, 1), 'id');
    }

    // If my replacement is here, suicide.
    if (creep.ticksToLive < 400) {
      let replacement = creep.pos.findInRange(creep.room.myCreeps, 1, {
        filter: (c) => c.memory.role == 'digger' &&
                 c.memory.target == creep.memory.target &&
                 c.ticksToLive > creep.ticksToLive
      })[0];

      if (replacement) {
        if (targetObj.mineralType) {
          // Mineral diggers don't suicide. It clutters the container
          // with energy.
          setState(STATE_DIE);
        } else {
          finalReport(creep);
          creep.suicide();
        }
        return;
      }
    }
    
    let workParts = creep.getActiveBodyparts(WORK);

    const containerObj = Game.getObjectById(digsite.container);
    
    const containerSpace = (containerObj && (CONTAINER_CAPACITY - _.sum(containerObj.store))) || 0;

    if (targetObj.mineralType) {
      let mineralHarvestAmount = workParts;
      if (targetObj.mineralAmount == 0 && targetObj.ticksToRegeneration > creep.ticksToLive) {
        digsite.diggerAction = ACTION_IDLE_EMPTY;
        // We're done. Go ahead and shut down.
        setState(STATE_DIE);
      } else if (creep.room.extractor.cooldown) {
        //creep.say('🚬');
      } else if (containerObj && mineralHarvestAmount <= containerSpace) {
        if (creep.harvest(targetObj) == OK) {
          if (creep.memory._intents) creep.memory._intents.harvest += 1;
        }
        digsite.diggerAction = ACTION_HARVEST;
      } else {
        digsite.diggerAction = ACTION_IDLE_FULL;
      } 
      return;
    }
    
    // Everything below here is for sources, not minerals.
    
    // If there's a can or road within 3 which could do with repair, and
    // I've got enough energy to repair, repair instead of harvesting.
    if (Game.time >= (creep.memory._nextDamagedStuffCheck || 0) &&
      creep.store.energy >= workParts) {
      let target = damagedContainerInRepairRange(creep) || damagedRoadInRepairRange(creep);
      
      if (target) {
        if (creep.repair(target) == OK) {
          if (creep.memory._intents) creep.memory._intents.repair += 1;
        }
        Books.logEnergy(creep, 'diggerRepair', workParts);
        digsite.diggerAction = ACTION_REPAIR;
        
        // If there is energy in the source, repair at most every sixth tick.
        if (targetObj.energy) {
          creep.memory._nextDamagedStuffCheck = Game.time + 6;
        }
        return;
      } else {
        // Nothing needs repair. Don't check again until my container
        // decays, or 25 ticks if I have no container.
        if (containerObj) {
          creep.memory._nextDamagedStuffCheck = Game.time + containerObj.ticksToDecay;
        } else {
          creep.memory._nextDamagedStuffCheck = Game.time + 25;
        }
      }
    }

    // Maybe build.
    if (Game.time >= (creep.memory._nextBuildSiteCheck || 0) &&
        (!creep.store.getFreeCapacity() || creep.store.energy >= workParts * BUILD_POWER)) {
      let buildSite = creep.pos.findInRange(creep.room.constructionSites, 3)[0];
      if (buildSite) {
        if (creep.myBuild(buildSite) == OK) {
          if (creep.memory._intents) creep.memory._intents.build += 1;
        }
        Books.logEnergy(creep, 'diggerBuild', workParts * BUILD_POWER);
        digsite.diggerAction = ACTION_BUILD;
        return;
      } else {
        // No build sites. Don't look again for 100 ticks.
        creep.memory._nextBuildSiteCheck = Game.time + 100;
      }
    }
    
    let shifting = false;

    // Crude because it neglects damage and boost.
    let crudeHarvestCapacity = workParts * HARVEST_POWER;
    
    let actualHarvestAmount = Math.min(crudeHarvestCapacity, targetObj.energy);

    // Maybe load extensions.
    if (creep.memory._extensions && creep.memory._extensions.length) {
      let extensions = creep.memory._extensions.map(Game.getObjectById);
      let neediest = _.min(extensions, 'store.energy');
      let needAmount = neediest.store.getFreeCapacity(RESOURCE_ENERGY);
      
      if (needAmount > 0) {
        if (creep.store.energy >= needAmount || creep.store.getCapacity() < 100) {
          if (creep.myTransfer(neediest, RESOURCE_ENERGY) == OK) {
            if (creep.memory._intents) creep.memory._intents.transfer += 1;
          }
          Books.logEnergy(creep, 'diggerExtensions', neediest.energyCapacity - neediest.energy);
        } else {
          let withdrawAmt = 200 - (creep.store.energy + actualHarvestAmount);
          if (withdrawAmt > 0) {
            creep.withdraw(containerObj, RESOURCE_ENERGY);
          }
        }
        // Set shifting true, even if we're mining enough that we'll be
        // able to load an ext next tick. That'll keep us from giving
        // energy away.
        shifting = true;
      }
    }
    
    // Maybe load spawn.
    if (digsite.spawn && !shifting && creep.store.energy) {
      let spawn = Game.getObjectById(digsite.spawn);
      if (spawn &&
          creep.pos.getRangeTo(spawn) == 1 &&
          spawn.energy == 0 &&
          creep.store.energy >= SPAWN_ENERGY_CAPACITY) {
        creep.myTransfer(spawn, RESOURCE_ENERGY);
        if (creep.memory._intents) creep.memory._intents.transfer += 1;
        shifting = true;
      }
    }

    const kContainerBuffer = 800;

    const linkObj = Game.getObjectById(digsite.link);

    // maybe passively fill the container
    if (linkObj && containerObj && containerObj.store.energy < kContainerBuffer) {
      creep.logDebug(`passively filling container (${containerObj.store.energy})`);
      shifting = true;
    }

    // Maybe load the container.
    if (containerObj &&
        containerObj.store.energy < kContainerBuffer &&
        !shifting &&
        ((creep.memory._extensions && creep.memory._extensions.length)) &&
        creep.store.energy > 100) {
      creep.logDebug('dumping to container');
      let amountToLoad = Math.min(creep.store.energy, kContainerBuffer - containerObj.store.energy);
      if (creep.myTransfer(containerObj, RESOURCE_ENERGY, amountToLoad) == OK) {
        if (creep.memory._intents) creep.memory._intents.transfer += 1;
      }
      shifting = true;
    }

    if (linkObj) {
      let linkSpace = linkObj.store.getFreeCapacity(RESOURCE_ENERGY);

      // Maybe dump energy to link.
      if (creep.store.energy && linkObj && !shifting) {
        const linkHalfCap = linkObj.store.getCapacity(RESOURCE_ENERGY) >> 1;

        if (creep.store.getCapacity() == 400) {
          // Special code for linked haulers with exactly 400 capacity.
          if (creep.store.energy == 400 && linkSpace >= 400) {
            creep.logDebug('sending 400 to the link');
            creep.myTransfer(linkObj, RESOURCE_ENERGY);
            if (creep.memory._intents) creep.memory._intents.transfer += 1;
            Books.logEnergy(creep, 'diggerLink', 400);
            shifting = true;
          }
        // If I've got enough to top up the link, top it up.
        } else if (linkSpace && creep.store.energy >= linkSpace) {
          creep.logDebug('topping up the link');
          creep.myTransfer(linkObj, RESOURCE_ENERGY);
          if (creep.memory._intents) creep.memory._intents.transfer += 1;
          Books.logEnergy(creep, 'diggerLink', linkSpace);
          shifting = true;
        // If the link is empty and I've got enough to fill it exactly to half, do that.
        } else if (!linkObj.store.energy && creep.store.energy >= linkHalfCap) {
          creep.logDebug('first half to link');
          creep.myTransfer(linkObj, RESOURCE_ENERGY, linkHalfCap);
          if (creep.memory._intents) creep.memory._intents.transfer += 1;
          Books.logEnergy(creep, 'diggerLink', linkHalfCap);
          shifting = true;
        // If I'm nearly full and there's room in the link, dump what I can.
        } else if (linkSpace && (actualHarvestAmount > creep.store.getFreeCapacity())) {
          creep.logDebug('shunting to link');
          let transferAmount = Math.min(linkSpace, creep.store.energy);
          creep.myTransfer(linkObj, RESOURCE_ENERGY, transferAmount);
          if (creep.memory._intents) creep.memory._intents.transfer += 1;
          Books.logEnergy(creep, 'diggerLink', transferAmount);
          shifting = true;
        }
      }
      
      // Maybe pull energy from container to feed link.
      if (!shifting &&
          !linkObj.cooldown &&
          linkObj.isSendingLink &&
          containerObj &&
          containerObj.store.energy > kContainerBuffer &&
          linkObj.store.getFreeCapacity(RESOURCE_ENERGY) >= creep.store.getCapacity() &&
          creep.store.energy < creep.store.getCapacity() / 5) {
        let amountToLoad = Math.min(creep.store.getFreeCapacity(), containerObj.store.energy);
        creep.withdraw(containerObj, RESOURCE_ENERGY, amountToLoad);
        if (creep.memory._intents) creep.memory._intents.withdraw += 1;
        shifting = true;
      }
    }
    
    // Do the harvest        
    if (actualHarvestAmount) {
      if ((actualHarvestAmount <= creep.store.getFreeCapacity() + containerSpace) || (!containerObj && !linkObj)) {
        if (linkObj &&
            targetObj.hasRegen &&
            targetObj.ticksToRegeneration > 2 &&
            crudeHarvestCapacity > targetObj.energy) {
          digsite.diggerAction = ACTION_IDLE_EMPTY;
        } else if (Game.cpu.bucket > 7000 || creep.room.my) {
          if (creep.harvest(targetObj) == OK) {
            if (creep.memory._intents) creep.memory._intents.harvest += 1;
            Books.logEnergy(creep, 'harvested', actualHarvestAmount);
            Varzs.logHarvest(actualHarvestAmount);
            digsite.diggerAction = ACTION_HARVEST;
          }
        } else {
          digsite.diggerAction = ACTION_IDLE_BUCKET;
        }
      } else {
        if (linkObj &&
            linkObj.store.energy <= 400 &&
            containerObj &&
            creep.store.getFreeCapacity() &&
            // Little stalls are expected when the digsite link is also an upgrade link, and an upgrader is on site.
            (linkObj != creep.room.upgradeLink || creep.room.upgraders.length == 0)) {
          creep.withdraw(containerObj, RESOURCE_ENERGY);
        }
        digsite.diggerAction = ACTION_IDLE_FULL;
      }
    } else {
      if (targetObj.ticksToRegeneration >= creep.ticksToLive && !targetObj.hasRegen) {
        finalReport(creep);
        creep.suicide();
        return;
      }
      digsite.diggerAction = ACTION_IDLE_EMPTY;
    }

    function shouldUpgrade() {
      if (creep.store.energy < workParts) {
        return false;
      }

      if (shifting) return false;

      if (creep.room.baseType == 'lw' &&
        creep.room.controller.level >= 7 &&
        creep.room.controller.ticksToDowngrade > 100000) {
        return false;
      }

      if (creep.room.myConstructionSites.length) {
        return false;
      }

      if (creep.room.controller.level < 8) {
        return true;
      }

      if (creep.room.controller.maxTicksToDowngrade - creep.room.controller.ticksToDowngrade > 100) {
        return true;
      }

      if (digsite.link) {
        return false;
      }

      if (creep.room.upgraderWorksOnStation) {
        return false;
      }

      return true;
    }
    
    // Maybe hit the upgrader.
    if (!shifting &&
        creep.room.controller &&
        creep.room.controller.my &&
        creep.pos.getRangeTo(creep.room.controller) <= 3 &&
        shouldUpgrade()) {
      Books.logEnergy(creep, 'diggerUpgrade', workParts);
      creep.upgradeController(creep.room.controller);
    }
  }

  function doInit() {
    creep.notifyWhenAttacked(false);
    setState(STATE_DEPLOY);
  }
  
  function doCustom() {
  }
  
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_DIG_REMOTE:
        doDigRemote();
        break;
      case STATE_DIG_SIMPLE_LINKED:
        doDigSimpleLinked();
        break;
      case STATE_DIG_EXTENSIONS:
        doDigExtensions();
        break;
      case STATE_DIG_BASE_MINERAL:
        doDigBaseMineral();
        break;
      case STATE_DIG:
        doDig();
        break;
      case STATE_AMNESIAC:
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      case STATE_IDLE:
        break;
      case STATE_INIT:
        doInit();
        break;
      default:
        setState(STATE_DIG);
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

// Digger spent the tick repairing.
const ACTION_REPAIR = 'repair';

// Digger spent the tick building.
const ACTION_BUILD = 'build';

// Digger harvested.
const ACTION_HARVEST = 'harvest';

// Digger was idle because the container was full.
const ACTION_IDLE_FULL = 'idleFull';

// Digger was idle because the source/mineral was empty.
const ACTION_IDLE_EMPTY = 'idleEmpty';

// Digger was idle because the bucket was low
const ACTION_IDLE_BUCKET = 'idleBucket';

// Digger was idle because it was avoiding a guard.
const ACTION_FLEE = 'flee';

// Digger tried to harvest, and failed.
const ACTION_FAILED = 'failed';

module.exports = {
  ACTION_REPAIR,
  ACTION_BUILD,
  ACTION_HARVEST,
  ACTION_IDLE_FULL,
  ACTION_IDLE_EMPTY,
  ACTION_IDLE_BUCKET,
  ACTION_FLEE,
  ACTION_FAILED,
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestSpawn,
  run
};