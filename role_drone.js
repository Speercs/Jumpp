'use strict';

let SpawnJob = require('util_spawnJob');

const STATE_DEPLOY = 1;
const STATE_GATHER = 2;
const STATE_DELIVER = 3;
const STATE_RENEW = 5;

const STATE_HARVEST = 10;
const STATE_SHUTTLE_LOAD = 11;
const STATE_SHUTTLE_DELIVER = 12;
const STATE_WORK = 13;

const OP_WITHDRAW = 'withdraw';
const OP_DEPOSIT = 'deposit';

function getBody(model) {
  if (model == 0) {
    return [WORK, CARRY, CARRY, MOVE, MOVE];
  }

  if (model == 10) {
    return [WORK, WORK, CARRY, MOVE];
  }

  if (model == 11) {
    return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
  }

  let body = [];
  for (let i=0; i < model; i++) {
    body.push(WORK);
    body.push(WORK);
    body.push(WORK);
    body.push(CARRY);
    body.push(CARRY);
    body.push(CARRY);
    body.push(CARRY);
    body.push(CARRY);
    body.push(MOVE);
    body.push(MOVE);
    body.push(MOVE);
    body.push(MOVE);
  }
  return body;
}

function buildBody(numWorks, numCarries, numMoves) {
  let body = [];
  for (let i=0; i < numMoves; i++) {
    body.push(MOVE);
  }
  for (let i=0; i < numCarries; i++) {
    body.push(CARRY);
  }
  for (let i=0; i < numWorks; i++) {
    body.push(WORK);
  }
  return body;
}

function getShuttleBody(energyBudget) {
  let numCarries = Math.floor(energyBudget / 100);
  let numMoves = numCarries;
  return buildBody(0, numCarries, numMoves);
}

function getWorkerBody(energyBudget) {
  let numCarries = 1;
  let numWorks = 2;
  let numMoves = 1;
  let remainingEnergy = energyBudget - 300;

  while(remainingEnergy > 50) {
    if (remainingEnergy >= 250) {
      numWorks += 2;
      numMoves += 1;
      remainingEnergy -= 250;
    } else if (remainingEnergy >= 150) {
      numWorks += 1;
      numMoves += 1;
      remainingEnergy -= 150;
    } else if (remainingEnergy >= 50) {
      numMoves += 1;
      remainingEnergy -= 1;
    }
  }

  return buildBody(numWorks, numCarries, numMoves);
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'drone',
      model: model,
      state: STATE_DEPLOY,
      subState: 0,
      noRenew: true
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Drone');
}

function requestSpawn(rooms, model, flag, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.flagName = flag.name;
  opts.memory.workRoom = flag.pos.roomName;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function requestSpawnRoom(rooms, model, workRoom, priority, sourceId, state) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = workRoom;
  if (sourceId) {
    opts.memory.sourceId = sourceId;
  }
  if (state) {
    opts.memory.state = state;
  }
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function requestSpawnDetail(room, body, sourceId, state) {
  let name = getNewName();
  let opts = getDefaultCreateOpts('custom');
  opts.memory.workRoom = room.name;
  opts.memory.sourceId = sourceId;
  opts.memory.state = state;
  return SpawnJob.requestSpawn([room.name], body, name, opts, SpawnJob.PRIORITY_HIGH);
}

function run(creep) {
  let repeat;
  let maxRepeat = 4;

  if (!creep.memory.workRoom && creep.flag) {
    creep.memory.workRoom = creep.flag.pos.roomName;
  }

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function setDibs(id, op, amount) {
    let timestamp = Game.time;
    creep.memory._dibs = {id, op, amount, timestamp};
  }

  function getDibs(objectId) {
    let result = {};
    let claimants = _.filter(
        creep.room.ownedCreeps,
        c => c.memory.role == 'drone' &&
            c.memory._dibs &&
            c.memory._dibs.id == objectId &&
            c.memory._dibs.timestamp > Game.time - 2);

    for (claimant of claimants) {
      let claim = claimant.memory._dibs;
      result[claim.op] = (result[claim.op] || 0) + claim.amount;
    }

    return result;
  }
  
  function doDeploy() {
    creep.logDebug('doDeploy');
    // Go to my work room.
    if (creep.pos.roomName == creep.memory.workRoom) {
      setState(STATE_GATHER);
    } else {
      myTravelTo(creep.workRoomControllerPos);
    }
    return;
  }

  function doGather() {
    creep.logDebug('doGather');

    // If I'm an advanced model nearly out of time, renew
    let spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    if (spawn &&
      !creep.memory.noRenew &&
      creep.bodyCost() > creep.room.energyCapacityAvailable &&
      creep.ticksToLive < 300 &&
      creep.room.energyAvailable >= 300) {
      setState(STATE_RENEW);
      return;
    }
    
    // If I'm full, get to work.
    if (creep.isFull) {
      creep.logDebug('Full energy. Working.');
      setState(STATE_DELIVER);
      return;
    }
    
    // Nearest container/storage/terminal that'll fill me up.
    let storages = _.compact(_.union(creep.room.containers, [creep.room.storage, creep.room.terminal]));
    let container = creep.pos.findClosestByPath(storages, {
      filter: (s) => (s.my || s.naked) && s.store.energy >= creep.store.getCapacity()
    });
    if (container) {
      creep.logDebug(`Filling from container at ${container.pos}`);
      let withdrawResult = creep.withdraw(container, RESOURCE_ENERGY);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(container, {maxRooms:1});
      }
      return;
    }
    
    // If I'm right next to an active source, work that.
    let touchSource = creep.pos.findInRange(FIND_SOURCES_ACTIVE, 1)[0];
    if (touchSource) {
      setDibs(touchSource.id, OP_WITHDRAW, creep.store.getFreeCapacity());
      if (creep.harvest(touchSource) == OK) {
        return;
      }
    }

    // If I've got significant energy, get to work.
    if (creep.store.energy >= creep.store.getCapacity() * 2/5) {
      creep.logDebug('Got energy. Working.');
      setState(STATE_DELIVER);
      return;
    }
    
    // Nearby tombstone?
    let stone = creep.pos.findInRange(FIND_TOMBSTONES, 12, {
      filter: s => s.store.energy
    })[0];
    
    if (stone) {
      let withdrawResult = creep.withdraw(stone, RESOURCE_ENERGY);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(stone, {maxRooms:1});
      }
      return;
    }

    // Container with the most energy
    let containers = creep.room.find(FIND_STRUCTURES, {
      filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store && s.store.energy > 100
    });
    if (containers.length) {
      creep.logDebug('Filling from container.');
      let largestContainer = _.max(containers, 'store.energy');
      let withdrawResult = creep.withdraw(largestContainer, RESOURCE_ENERGY);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(largestContainer, {maxRooms:1});
      }
      return;
    }
    
    // If there's a pile anywhere, draw from the largest.
    let piles = creep.room.find(FIND_DROPPED_RESOURCES, {
       filter: (p) => p.resourceType == RESOURCE_ENERGY
    });
    if (piles.length) {
      creep.logDebug('Filling from a faraway pile.');
      let largestPile = _.max(piles, 'amount');
      setDibs(largestPile.id, OP_WITHDRAW, creep.store.getFreeCapacity());
      if (creep.pickup(largestPile) == ERR_NOT_IN_RANGE) {
        myTravelTo(largestPile, {maxRooms:1});
      }
      return;
    }
    
    // Inactive energy structures?
    let struct = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: (s) => (s.structureType == STRUCTURE_EXTENSION ||
              s.structureType == STRUCTURE_LAB ||
              s.structureType == STRUCTURE_TOWER ||
              s.structureType == STRUCTURE_SPAWN) &&
              s.energy &&
              !s.active
    });
    if (struct) {
      creep.logDebug('Filling from struct.');
      setDibs(struct.id, OP_WITHDRAW, creep.store.getFreeCapacity());
      let withdrawResult = creep.withdraw(struct, RESOURCE_ENERGY);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(struct, {maxRooms:1});
      }
      return;
    }
    
    // Dismantle an empty struct?
    struct = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {
      filter: (s) => s.structureType == STRUCTURE_EXTENSION ||
               s.structureType == STRUCTURE_TOWER ||
               s.structureType == STRUCTURE_SPAWN
    });
    if (struct) {
      creep.logDebug('Dismantling a struct.');
      let withdrawResult = creep.myDismantle(struct);
      if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(struct, {maxRooms:1});
      }
      return;
    }

    // If there's an active source, go harvest that.
    let nearestActiveSource = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (nearestActiveSource) {
      setDibs(nearestActiveSource.id, OP_WITHDRAW, creep.store.getFreeCapacity());
      creep.logDebug('Harvesting.');
      if (creep.harvest(nearestActiveSource) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestActiveSource, {maxRooms:1});
      }
      return;
    }
    
    // Go wait near a source.
    let nearestSource = creep.pos.findClosestByRange(FIND_SOURCES);
    if (nearestSource) {
      setDibs(nearestSource.id, OP_WITHDRAW, creep.store.getFreeCapacity());
      if (creep.pos.getRangeTo(nearestSource) > 3) {
        myTravelTo(nearestSource, {maxRooms:1});
      }
      creep.logDebug('Waiting at source.');
      return;
    }
    
    // wth?
    creep.logError('I am lost in a strange room: ' + creep.pos);
    return;
  }
  
  function rampartToWork() {
    // If any rampart has under 1000 hits, work that.
    let any = creep.pos.findClosestByRange(
      creep.room.ramparts,
      {filter: r => r.hits < 1000});
    if (any) {
      return any;
    }
    
    // If any rampart is significantly weaker than the others, work that.
    let strongest = _.max(creep.room.ramparts, 'hits');
    let weakest = _.min(creep.room.ramparts, 'hits');
    
    if (strongest.hits > weakest.hits + 50000) {
      return weakest;
    }
    
    creep.logDebug('nobody is significantly weaker my room ' + creep.room.name);
    
    // If any rampart within range needs work, work that.
    let near = creep.pos.findInRange(
      creep.room.ramparts,
      /* range = */ 3,
      {filter: r => r.hits < r.hitsMax - 5000});
    if (near.length) {
      creep.logDebug('somebody in range needs work: ' + near[0].pos);
      return near[0];
    }
    
    creep.logDebug('nobody near needs work');

    // If any ramparts need significant work, work the nearest such.
    any = creep.pos.findClosestByRange(
      creep.room.ramparts,
      {filter: r => r.hits < r.hitsMax / 2});
    if (any) {
      return any;
    }
    
    creep.logDebug('nobody needs significant work');

    // If there's any rampart under max, work that.
    any = creep.pos.findClosestByRange(
      creep.room.ramparts,
      {filter: r => r.hits < r.hitsMax - 5000});
    if (any) {
      return any;
    }
    
    // If there's any wall in a room I own with no spawn, work the weakest.
    if (creep.room.controller && creep.room.controller.my && !creep.room.spawns.length) {
      if (creep.room.constructedWalls.length) {
        return _.min(creep.room.constructedWalls, 'hits');
      }
    }

    creep.logDebug('nobody needs any work');
  }
  
  function doDeliver() {
    creep.logDebug('doDeliver');
    if (creep.isEmpty) {
      // Avoid maxlooping. If I'm badly damaged, suicide.
      if (!creep.store.getCapacity()) {
        creep.logError(`${creep.pos.link} I'm too badly damaged to work. Suiciding.`);
        creep.suicide();
        return;
      }
      setState(STATE_GATHER);
      return;
    }
    
    // If the controller is near to downgrade, upgrade it.
    if (creep.room.controller.ticksToDowngrade < 5000) {
      creep.logDebug('upgrading because ticksToDowngrade.');
      if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.controller, {maxRooms:1, range: 3});
      }
      return;
    }

    // Load towers.
    let needyTower = creep.room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType == STRUCTURE_TOWER &&
             s.energy < TOWER_CAPACITY - 100
    })[0];

    if (needyTower) {
      creep.logDebug('loading tower.');
      if (creep.myTransfer(needyTower, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(needyTower);
        return;
      }
    }

    let constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    creep.logDebug(constructionSites.length + ' constructionSites');
    
    let loaders = creep.room.find(FIND_MY_CREEPS, {
      filter: c => c.memory.role == 'loader'
    });
    
    // If any extension needs energy, fill it.
    if (1 || !loaders.length) {
      let extensions = _.filter(creep.room.extensions, s => s.energy < s.energyCapacity);
      
      creep.logDebug(extensions.length + ' extensions');
      if (extensions.length) {
        let nearest = creep.pos.findClosestByPath(extensions);
        if (creep.myTransfer(nearest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          myTravelTo(nearest, {maxRooms:1});
        }
        return;
      }
      
      // If any spawn needs energy, fill it.
      let spawns = _.filter(creep.room.spawns, s => s.energy < s.energyCapacity);
  
      if (spawns.length) {
        let nearest = creep.pos.findClosestByPath(spawns);
        if (creep.myTransfer(nearest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          myTravelTo(nearest, {maxRooms:1});
        }
        return;
      }
    }
    
    // If there are any road construction sites, work the nearest.
    let roadSites = _.filter(constructionSites, s => s.structureType == STRUCTURE_ROAD);
    
    if (roadSites.length) {
      let nearestSite = creep.pos.findClosestByPath(roadSites);
      if (nearestSite) {
        setDibs(nearestSite.id, OP_DEPOSIT, creep.store.energy);
      }
      if (creep.myBuild(nearestSite) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestSite, {maxRooms:1, range:3});
      }
      return;
    }
    
    // If there is a spawn construction site, work that.
    let spawnSite = _.filter(constructionSites, s => s.structureType == STRUCTURE_SPAWN)[0];
    
    if (spawnSite) {
      setDibs(spawnSite.id, OP_DEPOSIT, creep.store.energy);
      if (creep.myBuild(spawnSite) == ERR_NOT_IN_RANGE) {
        myTravelTo(spawnSite, {maxRooms:1, range:3});
      }
      return;
    }
    
    // If the room control level is 1, upgrade.
    if (creep.room.controller && creep.room.controller.my && creep.room.controller.level == 1) {
      if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.controller, {maxRooms:1});
      }
      return;
    }
    
    // If there is any construction site started, work that.
    let partialSites = _.filter(constructionSites, s => s.progress);
    
    if (partialSites.length) {
      let nearestSite = creep.pos.findClosestByPath(partialSites);
      if (nearestSite) {
        setDibs(nearestSite.id, OP_DEPOSIT, creep.store.energy);
      }
      if (creep.myBuild(nearestSite) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestSite, {maxRooms:1, range:3});
      }
      return;
    }
    
    // If there is any construction site at all, work that.
    if (constructionSites.length) {
      let nearestSite = creep.pos.findClosestByPath(constructionSites);
      if (nearestSite) {
        setDibs(nearestSite.id, OP_DEPOSIT, creep.store.energy);
      }
      if (creep.myBuild(nearestSite) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestSite, {maxRooms:1, range:3});
      }
      return;
    }
    
    let rampart = rampartToWork();
    if (rampart && rampart.hits < rampart.hitsMax) {
      if (creep.repair(rampart) == ERR_NOT_IN_RANGE) {
        myTravelTo(rampart, {range:3});
      }
      return;
    }
    
    // Upgrade.
    if (creep.room.controller && creep.room.controller.my) {
      creep.logDebug('Upgrading because nothing better to do.');
      if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.controller, {maxRooms:1});
      }
      return;
    }
  }

  function doHarvest() {
    let sourceObj = Game.getObjectById(creep.memory.sourceId);
    let spawnObj = creep.room.spawns[0];

    // Special case: If I'm the only drone in the room, and I'm full of energy,
    // go put it in the spawn if the spawn is low, or if I'm not on station.
    if (!creep.store.getFreeCapacity() &&
        !_.find(creep.room.ownedCreeps, c => c.memory.role == 'drone' && c != creep) &&
        spawnObj) {
      if (spawnObj.store.getFreeCapacity(RESOURCE_ENERGY) > 50 ||
          creep.pos.getRangeTo(sourceObj) > 1) {
        myTravelTo(spawnObj);
        creep.myTransfer(spawnObj, RESOURCE_ENERGY);
        return;
      }
    }

    if (creep.harvest(sourceObj) != OK) {
      myTravelTo(sourceObj, {maxRooms:1, range:1});
    }
  }

  function doShuttleLoad() {
    // If full. go to SHUTTLE_DELIVER.
    if (!creep.store.getFreeCapacity()) {
      setState(STATE_SHUTTLE_DELIVER);
      return;
    }

    // tombstone?
    let stone = creep.pos.findInRange(FIND_TOMBSTONES, 1, s => s.store.energy)[0];
    if (stone) {
      creep.withdraw(stone, RESOURCE_ENERGY);
      return;
    }

    // pile?
    let pile = creep.pos.findInRange(
        FIND_DROPPED_RESOURCES,
        /* range = */ 1,
        s => s.resourceType == RESOURCE_ENERGY && s.amount > 10)[0];
    if (pile) {
      creep.pickup(pile);
      return;
    }

    let sourceObj = Game.getObjectById(creep.memory.sourceId);
    let sourceDistance = creep.pos.getRangeTo(sourceObj);

    // If I'm 1 away from my source, move toward the controller.
    if (sourceDistance == 1) {
      myTravelTo(creep.room.controller, {maxRooms:1, range:1});
      return;
    }

    // If I'm more than six tiles away from my source, move toward my source.
    if (sourceDistance > 6) {
      myTravelTo(sourceObj, {maxRooms:1, range:3});
      return;
    }

    // If there's another hauler, with my sourceId, in SHUTTLE_LOAD mode, and it's nearer than I am to
    // the source, hold still.
    let otherHaulers = _.filter(
        creep.room.ownedCreeps,
        c => c.memory.role == 'drone' &&
            c.memory.sourceId == creep.memory.sourceId &&
            c != creep &&
            c.memory.state == STATE_SHUTTLE_LOAD);
    let nearerHauler = _.find(otherHaulers, c => c.pos.getRangeTo(sourceObj) < sourceDistance);
    if (nearerHauler) return;

    // If there are no harvesters (near the source) with my source ID, hold still.
    let harvesters = _.filter(
        creep.room.ownedCreeps,
        c => c.memory.role == 'drone' &&
            c.memory.sourceId == creep.memory.sourceId &&
            c.memory.state == STATE_HARVEST &&
            c.pos.isNearTo(sourceObj));
    if (!harvesters.length) {
      return;
    }

    // If I'm not near the farthest harvester, move toward it.
    let farthestHarvester = _.max(harvesters, c => c.pos.getRangeTo(creep));
    if (!creep.pos.isNearTo(farthestHarvester)) {
      myTravelTo(farthestHarvester, {maxRooms:1, range:1, ignoreCreeps:false});
      // Note: No return. Still check transfer cases.
    }

    // Pass energy to any shuttles there with the same target and less TTL.
    let nearSeniorHauler = _.find(otherHaulers,
        c => c.pos.isNearTo(creep) && c.ticksToLive < creep.ticksToLive);
    if (nearSeniorHauler) {
      creep.myTransfer(nearSeniorHauler, RESOURCE_ENERGY);
      return;
    }

    // Pull energy from any harvesters there that are near to full.
    let fullHarvester = _.find(
        harvesters,
        c => c.store.getFreeCapacity() < 2 * c.harvestPower ||
            c.store.getUsedCapacity() >= creep.store.getFreeCapacity());
    if (fullHarvester) {
      fullHarvester.myTransfer(creep, RESOURCE_ENERGY);
      return;
    }
  }

  function doShuttleDeliver() {
    const SUBSTATE_FILL_ENERGY_STRUCTURES = 1;
    const SUBSTATE_FILL_WORKERS = 2;

    // If empty, go to SHUTTLE_LOAD.
    if (!creep.store.getUsedCapacity()) {
      setState(STATE_SHUTTLE_LOAD);
      return;
    }

    function fillStructures() {
      let nearestNeedy = _(creep.room.spawns)
          .union(creep.room.extensions)
          .filter(s => s.store.getFreeCapacity(RESOURCE_ENERGY))
          .min(s => s.pos.getRangeTo(creep));

      if (nearestNeedy == Infinity) {
        creep.memory.subState = 0;
        return;
      }

      if (creep.myTransfer(nearestNeedy, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestNeedy, {maxRooms:1, range:1})
      }
    }

    function fillWorkers() {
      let workers = _(creep.room.ownedCreeps)
          .filter(c => c.memory.role == 'drone' &&
              c.memory.state == STATE_WORK &&
              c.memory.sourceId == creep.memory.sourceId)
          .value();

      let needyWorkers = _.filter(workers, c => c.store.getFreeCapacity());
      let worker;

      if (needyWorkers.length) {
        worker = creep.pos.findClosestByPath(needyWorkers);
      } else {
        worker = creep.pos.findClosestByPath(workers);
      }

      if (creep.myTransfer(worker, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(worker, {maxRooms:1, range:1})
      }
    }

    function chooseTask() {
      let totalNeed = _(creep.room.spawns)
          .union(creep.room.extensions)
          .sum(s => s.store.getFreeCapacity(RESOURCE_ENERGY));
      let totalDelivering = _(creep.room.ownedCreeps)
          .filter(c => c.memory.role == 'drone' &&
              c.memory.state == STATE_SHUTTLE_DELIVER &&
              c.memory.subState == SUBSTATE_FILL_ENERGY_STRUCTURES)
          .sum('store.energy');
      if (totalNeed > totalDelivering) {
        creep.memory.subState = SUBSTATE_FILL_ENERGY_STRUCTURES;
      } else {
        creep.memory.subState = SUBSTATE_FILL_WORKERS;
      }
    }

    switch (creep.memory.subState) {
      case SUBSTATE_FILL_ENERGY_STRUCTURES:
        fillStructures();
        break;
      case SUBSTATE_FILL_WORKERS:
        fillWorkers();
        break;
      default:
        chooseTask();
        repeat = true;
        break;
    }
  }

  function doWork() {
    function chooseTarget() {
      if (creep.room.constructionSites.length) {
        creep.memory.targetId = creep.room.constructionSites[0].id;
        creep.memory._changeTargets = undefined;
        return;
      }
      let needyRampart = _.find(creep.room.ramparts, r => r.hits < 150000);
      if (needyRampart) {
        creep.memory.targetId = needyRampart.id;
        creep.memory._changeTargets = 25;
      }
      creep.memory.targetId = creep.room.controller.id;
      creep.memory._changeTargets = Game.time + 25;
    }

    // Go to your target. (memory.targetId)
    // If it's a construction site, build it until it's done, then choose a new target.
    // If it's a controller, upgrade it for 25 ticks, then choose a new target.
    // If it's a rampart, repair it for 25 ticks, then choose a new target.
    let targetObj = Game.getObjectById(creep.memory.targetId);

    if (!targetObj || !creep.memory.targetId || creep.memory._changeTargets > Game.time) {
      chooseTarget();
    }

    if (targetObj && (Game.time & 127) == ((creep.pos.x + 50*creep.pos.y) & 127)) {
      let sourceObj = Game.getObjectById(creep.memory.sourceId);
      myTravelTo(sourceObj, {maxRooms:1, range:2, ignoreCreeps:false})
    } else if (creep.pos.getRangeTo(targetObj) > 2) {
      myTravelTo(targetObj, {maxRooms:1, range:2});
    }

    if (targetObj instanceof StructureController) {
      creep.upgradeController(targetObj);
    } else if (targetObj instanceof ConstructionSite) {
      creep.myBuild(targetObj);
    } else if (targetObj instanceof StructureRampart) {
      creep.repair(targetObj);
    } else if (!targetObj) {
      chooseTarget();
    }
  }
  
  function doRenew() {
    if (creep.ticksToLive > 1400 || creep.room.energyAvailable < 100) {
      setState(STATE_GATHER);
      return;
    }
    let spawn = creep.room.find(FIND_MY_SPAWNS)[0];
    myTravelTo(spawn.pos);
  }

  function doDie() {
    creep.doDie();
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
      case STATE_GATHER:
        doGather();
        break;
      case STATE_DELIVER:
        doDeliver();
        break;
      case STATE_HARVEST:
        doHarvest();
        break;
      case STATE_SHUTTLE_LOAD:
        doShuttleLoad();
        break;
      case STATE_SHUTTLE_DELIVER:
        doShuttleDeliver();
        break;
      case STATE_WORK:
        doWork();
        break;
      case STATE_RENEW:
        doRenew();
        break;
      case STATE_DIE:
        doDie();
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
    console.log('Warning: ' + creep.name + ' maxLooped (' + creep.memory.state + ',' + creep.memory.subState +
      ')');
  }
}

module.exports = {
  STATE_HARVEST,
  STATE_SHUTTLE_DELIVER,
  STATE_SHUTTLE_LOAD,
  STATE_WORK,

  getBody,
  getDefaultCreateOpts,
  getNewName,
  getShuttleBody,
  getWorkerBody,
  requestSpawn,
  requestSpawnDetail,
  requestSpawnRoom,
  run
};