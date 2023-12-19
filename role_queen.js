'use strict';

let EventLog = require('util_event_log');
let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');


const STATE_BOOST_ALL = 1;
const STATE_INITIAL_LOAD = 6;
const STATE_DEPLOY = 2;
const STATE_BUILD = 3;
const STATE_PICKUP = 4;
const STATE_HARVEST = 5;

function getBody(model) {
  switch (model) {
    case 6: // light boosted
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK,
          
          CARRY, CARRY, CARRY, CARRY,

          MOVE, MOVE, MOVE,
      ];
    case 5: // light unboosted
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE
      ];
    case 4: // tunnel builder
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,

          CARRY, CARRY, CARRY, CARRY, CARRY,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE
      ];
    case 3: // more work less carry
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,

          CARRY, CARRY, CARRY, CARRY, CARRY,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE
      ];
    case 2: // test
      return [WORK, CARRY, MOVE, MOVE];
    case 1: // boosted
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK,
          
          CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE
      ];
    default:
      console.log('Queen.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'queen',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Queen');
}

function requestSpawn(rooms, model, worksite, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  if (worksite instanceof Flag) {
    opts.memory.flagName = worksite.name;
    opts.memory.workRoom = worksite.pos.roomName;
  } else {
    opts.memory.workRoom = worksite;
  }
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  return creep.needsBoostedMove() && creep.memory.model != 5;
}

function runSpawning(creep) {
	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestBoost('XZHO2', creep.getActiveBodyparts(MOVE));
    creep.requestBoost('XKH2O', creep.getActiveBodyparts(CARRY));
    creep.requestBoost('XLH2O', creep.getActiveBodyparts(WORK));
    creep.room.requestBoost(creep);
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  
  function myTravelTo(target, options = {}) {
    if (creep.pos.onEdge) {
      options.repath = 1;
    }
    creep.travelTo2(target, options);
  }

  function setState(state, reason) {
    creep.logDebug(`${Game.time } setting state ${state} because ${reason}`);
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function pickupOrHarvest() {
    if (creep.room.name == 'W39S11') {
      setState(STATE_CUSTOM);
      repeat = true;
      return;
    }
    if (creep.room.storage) {
      if ((creep.room.storage.my && creep.room.storage.store.energy > 1000) ||
          (!creep.room.storage.my &&
              creep.room.storage.store.energy &&
              creep.room.storage.naked &&
              creep.room.storage.pos.tileType == TILE_EXPOSED)) {
        myTravelTo(creep.room.storage, {maxRooms:1, range: 1});
        creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
        return;
      }
    }

    let nearbyContainers = creep.pos.findInRange(creep.room.containers, 4, {
        filter: s => s.store.energy >= creep.store.getCapacity() / 2
    });

    if (nearbyContainers.length) {
      let nearest = creep.pos.findClosestByPath(nearbyContainers);
      myTravelTo(nearest);
      creep.withdraw(nearest, RESOURCE_ENERGY);
      return;
    }

    let nearbyRuins = creep.pos.findInRange(FIND_RUINS, 4, {
      filter: s => s.store.energy >= creep.store.getCapacity() / 2
    });

    if (nearbyRuins.length) {
      let nearest = creep.pos.findClosestByPath(nearbyRuins);
      myTravelTo(nearest);
      creep.withdraw(nearest, RESOURCE_ENERGY);
      return;
    }

    if (creep.room.terminal &&
        creep.room.terminal.my &&
        creep.room.terminal.store.energy > 10000) {
      myTravelTo(creep.room.terminal, {range: 1});
      creep.withdraw(creep.room.terminal, RESOURCE_ENERGY);
      return;
    }
    
    if (creep.room.storage &&
        creep.room.storage.my &&
        creep.room.storage.store.energy > 5000) {
      myTravelTo(creep.room.storage, {range: 1});
      creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
      return;
    }

    let stones = creep.room.find(FIND_TOMBSTONES, {
      filter: s => s.store.energy
    });

    if (stones.length) {
      setState(STATE_PICKUP, `there are stones`);
      return;
    }
    
    let ruins = creep.room.find(FIND_RUINS, {
      filter: s => s.store.energy
    });

    if (ruins.length) {
      setState(STATE_PICKUP, `there are ruins`);
      return;
    }
    
    let piles = creep.room.find(FIND_DROPPED_RESOURCES, {
      filter: p => p.resourceType == RESOURCE_ENERGY
    });
    
    if (piles.length) {
      setState(STATE_PICKUP, `there are piles`);
      return;
    }

    setState(STATE_HARVEST, `no better ideas`);
    return;
  }
  
  function highestPriorityConstructionSite() {
    let sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    
    if (sites.length < 2) {
      return sites[0];
    }
    
    let sitePriorites = [STRUCTURE_SPAWN, STRUCTURE_TOWER,
      STRUCTURE_STORAGE, STRUCTURE_EXTENSION, STRUCTURE_ROAD];

    let sitesInRange = creep.pos.findInRange(sites, 3);
    if (sitesInRange.length) {
      return _.min(sitesInRange, s => _.indexOf(sitePriorites, s.structureType));
    }
    
    return _.min(sites, s => _.indexOf(sitePriorites, s.structureType));
  }

  function highestPriorityRampart() {
    // Find the ramparts below their targets.
    let rampartsBelowTarget = _.filter(
        _.union(creep.room.ramparts, creep.room.constructedWalls),
        r => (r.my || r instanceof StructureWall) && r.hits < r.hitsTarget);

    if (!rampartsBelowTarget.length) {
      return;
    }

    // Find the lowest in the room near me.
    let rampartsBelow10k = _.filter(rampartsBelowTarget, r => r.hits < 10000);
    let below10kNearMe = creep.pos.findInRange(rampartsBelow10k, 3);
    if (below10kNearMe.length) {
      return below10kNearMe[0];
    }

    // Find the lowest rampart in the room.
    let lowestOverall = _.min(rampartsBelowTarget, 'hits');
    
    if (lowestOverall.hits < 10000) {
      return lowestOverall;
    }

    // Find the lowest rampart near me.
    let rampartsNearMe = creep.pos.findInRange(rampartsBelowTarget, 3);
    let lowestNearMe = _.min(rampartsNearMe, 'hits');

    // Take the lowest in the room if it's 100k below the lowest near me,
    // or if none are near me.
    if (!rampartsNearMe.length || lowestOverall.hits + 100000 < lowestNearMe.hits) {
      return lowestOverall;
    }

    // Do the lowest near me.
    return lowestNearMe;
  }

  function doBoostAll() {
    if (creep.doBoost() == OK) {
      setState(STATE_INITIAL_LOAD);
      return;
    }

    if (creep.ticksToLive < 1350) {
      // Something has gone wrong. Die.
      setState(STATE_DIE, `something is wrong`);
      return;
    }
  }

  function doInitialLoad() {
    // If I'm full of energy, move out.
    if (creep.isFull) {
      setState(STATE_WAYPOINT, `I'm full of energy`);
      return;
    }

    // If I'm a model-5, move out. I travel empty, for speed.
    if (creep.memory.model == 5) {
      setState(STATE_WAYPOINT, `I'm ready to travel empty`);
      return;
    }
    
    // Load energy from terminal.
    if (creep.withdraw(creep.room.terminal, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
      myTravelTo(creep.room.terminal, {range:1});
    }
  }

  function doDeploy() {
    if (creep.memory.workRoom.isHighway()) {
      if (creep.flag) {
        creep.travelTo2(
          creep.flag.pos,
          {range:0, allowSK:true, roomCallback:RoomCallback.avoidKeepersCallback});
      } else {
        creep.logError(`I am confused. My workRoom is a highway, but I have no flag.`);
      }
      return;
    }

    if (creep.pos.roomName == creep.memory.workRoom && !creep.pos.onEdge) {
      setState(STATE_BUILD, `I'm in my work room and not on the edge`);
      return;
    }
    
    let deployPos = creep.workRoomControllerPos;

    if (creep.flag) {
      deployPos = creep.flag.pos;
    }

    myTravelTo(
      deployPos,
      {allowSK:true, range:3, roomCallback:RoomCallback.avoidKeepersCallback});
  }
    
  function doBuild() {
    if (creep.pos.roomName != creep.memory.workRoom) {
      setState(STATE_DEPLOY, `I'm not in my work room`);
      return;
    }

    // If I'm blocking someone, move to accommodate them.
    let blocked = creep.pos.blockedCreep();

    if (blocked) {
      creep.logDebug('unblocking');
      myTravelTo(blocked);
      return;
    }

    // If I'm out of energy, get more.
    if (!creep.store.energy) {
      creep.logDebug('out of energy');
      pickupOrHarvest();
      return;
    }
    
    // If I'm standing on a construction site, move.
    if (creep.pos.hasConstructionSite()) {
      EventLog.writeEntry(EventLog.DEBUG, creep.room.name, `moving off construction site`);
      myTravelTo(_.sample(creep.pos.getAdjacentWalkableTiles()));
    }
    
    if (creep.room.terminal &&
      creep.pos.isNearTo(creep.room.terminal) &&
      creep.room.terminal.store.energy) {
      creep.withdraw(creep.room.terminal, RESOURCE_ENERGY);
    } else if (creep.room.storage &&
      creep.pos.isNearTo(creep.room.storage) &&
      creep.room.storage.store.energy > 5000) {
      creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
    }
    
    let fillers = _.any(
      creep.room.ownedCreeps,
      c => c.store.energy &&
         (c.memory.role == 'loader' || c.memory.role == 'basecourier' || c.memory.role == 'drone'));
    if (!fillers) {
      // If there are needy structures, fill them.
      let need = creep.pos.findClosestByPath(
        _.union(creep.room.extensions, creep.room.towers, creep.room.spawns),
        {filter: s => s.my && s.energy < s.energyCapacity / 2});
      
      if (need) {
        if (creep.myTransfer(need, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          myTravelTo(need, {maxRooms:1, range: 1});
        }
        // TODO: Why is this here?
        let site = highestPriorityConstructionSite();
        if (site) {
          creep.myBuild(site);
        }
        return;
      }
    }
    
    // If there's a really low rampart, do that
    let rampart = highestPriorityRampart();
    if (rampart && rampart.hits < 10000) {
      if (creep.repair(rampart) == ERR_NOT_IN_RANGE) {
        creep.logDebug('high priority rampart at ${rampart.pos}');
        myTravelTo(rampart, {maxRooms:1, range: 3});
      }
      return;
    }

    // If there's a construction site, work the highest-priority one.
    let site = highestPriorityConstructionSite();
    
    if (site) {
      if (creep.myBuild(site) == ERR_NOT_IN_RANGE) {
        creep.logDebug('moving to high priority construction site');
        myTravelTo(site, {maxRooms:1, range: 3});
      }
      return;
    }
    
    // If there are ramparts that could do with improvement, improve them.
    if (rampart instanceof StructureRampart || rampart instanceof StructureWall) {
      if (creep.repair(rampart) == ERR_NOT_IN_RANGE) {
        creep.logDebug(`moving to rampart/wall that needs improvement at ${rampart.pos}`);
        myTravelTo(rampart, {range: 3, maxRooms:1, roomCallback: blockExitsCallback});
      }
      return;
    }
    
    // Upgrade.
    if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
      myTravelTo(creep.room.controller, {maxRooms:1, range: 3});
    }
  }
    
  function doPickup() {
    // If I'm full, go back to building.
    if (creep.isFull) {
      setState(STATE_BUILD, `I'm full energy`);
      return;
    }

    // If there's a ruin with energy, collect from the nearest.
    let nearestRuinWithEnergy = creep.pos.findClosestByPath(
      FIND_RUINS,
      {filter: t => t.store.energy});
      
    if (nearestRuinWithEnergy) {
      if (creep.withdraw(nearestRuinWithEnergy, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestRuinWithEnergy, {range:1});
      }
      return;
    }

    // If there's a pile of energy, collect from the nearest.
    let nearestPile = creep.pos.findClosestByPath(
      FIND_DROPPED_RESOURCES,
      {filter: t => t.resourceType == RESOURCE_ENERGY && t.amount > 100});
        
    if (nearestPile) {
      if (creep.pickup(nearestPile) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestPile, {range:1});
      }
      return;
    }

    // If there's a tombstone with energy, collect from the nearest.
    let nearestStoneWithEnergy = creep.pos.findClosestByPath(
        FIND_TOMBSTONES,
        {filter: t => t.store.energy});
        
    if (nearestStoneWithEnergy) {
      if (creep.withdraw(nearestStoneWithEnergy, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestStoneWithEnergy, {range:1});
      }
      return;
    }
    
    // If I've got some useful amount of energy, go back to building.
    if (creep.store.energy >= creep.store.getCapacity() / 4) {
      setState(STATE_BUILD, `I've got enough energy`);
      return;
    }
    
    // Go harvest.
    setState(STATE_HARVEST, `No better ideas`);
  }
    
  function doHarvest() {
    // If I'm full, go back to building.
    if (creep.isFull) {
      setState(STATE_BUILD, `I'm full energy`);
      return;
    }
    
    // If there are hostile energy structures with energy, collect from the
    // nearest.
    let nearestHostileStructure = creep.pos.findClosestByPath(
      FIND_HOSTILE_STRUCTURES,
      {filter: t => t.store && t.store.energy && t.naked && t.structureType != STRUCTURE_NUKER});
      
    if (nearestHostileStructure) {
      if (creep.withdraw(nearestHostileStructure, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestHostileStructure, {range:1});
      }
      return;
    }
  
    // If an un-worked source has any energy, harvest it.
    let nearest = creep.pos.findClosestByPath(
        FIND_SOURCES_ACTIVE,
        {filter: s => !_.get(creep.room.memory, 'digsites.' + s.id + '.digger')});
    
    if (nearest) {
      // If the nearest source is pretty far away and I've got significant
      // energy, go back to building.
      if (creep.pos.getRangeTo(nearest) > 10 && creep.store.energy > creep.store.getCapacity() / 2) {
        setState(STATE_BUILD, `meh. good enough.`)
        return;
      }

      if (creep.harvest(nearest) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearest, {range: 1});
      }
      return;
    }
    
    // If an un-worked source is refilling soon, go to it.
    let soon = creep.pos.findClosestByPath(FIND_SOURCES, {
        filter: s => s.ticksToRegeneration <= 25 &&
            !_.get(creep.room.memory, 'digsites.' + s.id + '.digger')
    });
    
    if (soon) {
      myTravelTo(soon, {range: 1});
      return;
    }
    
    // If I've got some useful amount of energy, go back to building.
    if (creep.store.energy >= creep.store.getCapacity() / 4) {
      setState(STATE_BUILD, `more than 1/4 energy`);
      return;
    }

    // If there's a tombstone with energy, go to pickup mode.
    let stones = creep.room.find(FIND_TOMBSTONES, {filter: s => s.store.energy});

    if (stones.length) {
      setState(STATE_PICKUP, `there are stones`);
      return;
    }

    // If there's an upgradeLink with energy, take it.
    if (creep.room.upgradeLink && creep.room.upgradeLink.store.energy) {
      creep.withdraw(creep.room.upgradeLink, RESOURCE_ENERGY);
      myTravelTo(creep.room.upgradeLink, {range:1});
      return;
    }

    // If there's an empty upgradeLink, and the storageLink seems likely to send
    // soon, wait.
    if (creep.room.upgradeLink && creep.room.storageLink && !creep.room.storageLink.cooldown) {
      creep.withdraw(creep.room.upgradeLink, RESOURCE_ENERGY);
      myTravelTo(creep.room.upgradeLink, {range:1});
      return;
    }

    // If any sourceContainer has energy, take it.
    let sourceContainer = creep.pos.findClosestByPath(
        creep.room.sourceContainers,
        {filter: c => c.store.energy > 800});
    if (sourceContainer) {
      creep.withdraw(sourceContainer, RESOURCE_ENERGY);
      myTravelTo(sourceContainer, {range:1});
      return;
    }


    // 700 is good enough if there's nothing in the upgradeLink.
    if (creep.store.energy >= 700) {
      setState(STATE_BUILD, `more than 700`);
      return;
    }

    // Wait at the source that regenerates next.
    let next = _.min(creep.room.find(FIND_SOURCES), 'ticksToRegeneration');
    myTravelTo(next, {range: 1});
  }
  
  function doCustom() {
    if (creep.store.energy) {
      setState(STATE_DEPLOY);
      repeat = true;
      return;
    }
    myTravelTo(ONW.storage, {range:1});
    creep.withdraw(ONW.storage, RESOURCE_ENERGY);
  }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_BOOST_ALL:
        doBoostAll();
        break;
      case STATE_INITIAL_LOAD:
        doInitialLoad();
        break;
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_BUILD:
        doBuild();
        break;
      case STATE_PICKUP:
        doPickup();
        break;
      case STATE_HARVEST:
        doHarvest();
        break;
      case STATE_AMNESIAC:
        setState(STATE_DEPLOY);
        break;
      case STATE_WAYPOINT:
        creep.doWaypoint(STATE_DEPLOY);
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_BUILD);
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
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestSpawn,
  run,
  runSpawning
};
