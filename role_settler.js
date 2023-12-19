'use strict';

let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');


const STATE_BOOST_ALL = 1;
const STATE_INITIAL_LOAD = 5;
const STATE_DEPLOY = 2;
const STATE_UPGRADE = 3;
const STATE_GATHER = 4;

function getBody(model) {
  switch (model) {
  // Controller fed by a two sources via link.
  case 7:
    return [WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,
      WORK, WORK, WORK, WORK, WORK,

      CARRY, CARRY, CARRY, CARRY, CARRY,
      CARRY, CARRY, CARRY, CARRY, CARRY,

      MOVE, MOVE, MOVE, MOVE, MOVE,
      MOVE, MOVE, MOVE, MOVE, MOVE,
      MOVE, MOVE, MOVE, MOVE, MOVE,
      MOVE, MOVE, MOVE, MOVE, MOVE];

  // Controller fed by a single source via link.
    case 6:
      return [WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,

        CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY,

        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

   case 5: // Heavy unboosted
      return [WORK, WORK, WORK, WORK, WORK,
        WORK, WORK, WORK, WORK, WORK,
        CARRY, CARRY, CARRY, CARRY, CARRY, 
        CARRY, CARRY, CARRY, CARRY, CARRY, 
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];
    case 4: // RCL3 model
      return [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
    case 3: // RCL2 model
      return [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
    case 2: // test
      return [WORK, CARRY, MOVE, MOVE];
    case 1: // boosted
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE
      ];
    default:
      console.log('Settler.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'settler',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Settler');
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
  return creep.memory.model != 6 && creep.memory.model != 7 && creep.needsBoostedMove();
}

function runSpawning(creep) {
  if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestBoost('XZHO2', creep.getActiveBodyparts(MOVE));
    creep.requestBoost('XKH2O', creep.getActiveBodyparts(CARRY));
    creep.requestBoost('XGH2O', creep.getActiveBodyparts(WORK));
    creep.room.requestBoost(creep);
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  let room = creep.room;

  function myTravelTo(target, options = {}) {
    if (creep.pos.onEdge) {
      options.repath = 1;
    }
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  
  /**
   * If there is an upgradeContainer, return an unoccupied spot that is within
   * 3 of the controller and 1 of the upgradeContainer. Otherwise, return an
   * unoccupied spot within 2 of the controller. Returns undefined if there
   * isn't one.
   **/
  function getUpgradePosition() {
    if (room.upgradePositions && room.upgradePositions.length) {
      let myPosition = creep.pos.findInRange(room.upgradePositions, 0)[0];

      if (myPosition) return [creep.pos, 0];

      let openSpots = _.filter(
        room.upgradePositions,
        p => !p.findInRange(FIND_CREEPS, 0).length);

      let nearestOpen = creep.pos.findClosestByPath(openSpots);
    
      if (nearestOpen) {
        return [nearestOpen, 0];
      }
    }

    let xMin = room.controller.pos.x - 2;
    let xMax = room.controller.pos.x + 2;
    let yMin = room.controller.pos.y - 2;
    let yMax = room.controller.pos.y + 2;

    if (room.upgradeContainer) {
      xMin = room.controller.pos.x - 3;
      xMax = room.controller.pos.x + 3;
      yMin = room.controller.pos.y - 3;
      yMax = room.controller.pos.y + 3;
      xMin = Math.max(xMin, room.upgradeContainer.pos.x - 1);
      xMax = Math.min(xMax, room.upgradeContainer.pos.x + 1);
      yMin = Math.max(yMin, room.upgradeContainer.pos.y - 1);
      yMax = Math.min(yMax, room.upgradeContainer.pos.y + 1);
    }
    
    if (creep.pos.x >= xMin &&
      creep.pos.x <= xMax &&
      creep.pos.y >= yMin &&
      creep.pos.y <= yMax) {
      return [creep.pos, 0];
    }
    
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        let pos = room.getPositionAt(x, y);
        if (pos.open &&
          pos.isWalkable() &&
          !pos.lookFor(LOOK_CREEPS).length) {
          return [pos, 0];
        }
      }
    }
  }

  function doBoostAll() {
    if (creep.doBoost() == OK) {
      setState(STATE_INITIAL_LOAD);
      return;
    }

    if (creep.ticksToLive < 1350) {
      // Something has gone wrong. Die.
      setState(STATE_DIE);
      return;
    }
  }

  function doInitialLoad() {
    // no initial load on model-6 or model-7
    if (creep.isFull || creep.memory.model == 6 || creep.memory.model == 7) {
      setState(STATE_WAYPOINT);
      return;
    }
    
    if (creep.withdraw(room.terminal, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
      myTravelTo(room.terminal, {range:1});
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
      setState(STATE_UPGRADE);
      return;
    }
    
    myTravelTo(creep.workRoomControllerPos, {range:3, allowSK: true});
  }
    
  function doUpgrade() {
    if (creep.room.name != creep.memory.workRoom) {
      setState(STATE_DEPLOY);
      return;
    }

    // If I'm out of energy, get more.
    if (!creep.store.energy) {
      setState(STATE_GATHER);
      return;
    }
    
    let fillers = _.any(
      room.myCreeps,
      c => c.memory.role == 'loader' ||
         c.memory.role == 'basecourier' ||
         c.memory.role == 'queen');
    if (!fillers && room.memory.role != 'mine') {
      // If there are needy structures, fill them.
      let need = creep.pos.findClosestByPath(
        _.union(room.extensions, room.towers, room.spawns),
        {filter: s => s.my && s.active && s.energy < s.energyCapacity});
        
      // Anyone on it already?
      let servers = _.filter(room.myCreeps, c => c.servingNeeders);

      if (need && !servers.length) {
        creep.servingNeeders = true;
        if (creep.myTransfer(need, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          myTravelTo(need, {range: 1, maxRooms:1});
        }
        return;
      }
    }
    
    let pulling = false;

    // If there's a stone nearby, collect from that.
    let stone = creep.pos.findInRange(FIND_TOMBSTONES, 1, {filter: s => s.store.energy})[0];
    if (stone) {
      creep.withdraw(stone, 'energy');
      pulling = true;
    }

    // If there's a nearby pile, collect from that.
    let pile = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1)[0];
    if (pile && pile.resourceType == RESOURCE_ENERGY) {
      creep.pickup(pile);
      pulling = true;
    }

    let nearUpgradeLink = room.upgradeLink && creep.pos.getRangeTo(room.upgradeLink) == 1;
    if (nearUpgradeLink) {
      room.memory._feedUpgradeLink = Game.time;
    }

    let workParts = creep.numBodyparts(WORK);
    let lowOnEnergy = creep.store.energy <= workParts * 2 ||
        (nearUpgradeLink && creep.store.getFreeCapacity() >= room.upgradeLink.store.energy);

    // If we're near the upgradeLink and it has energy and we're low, collect from that.
    if (lowOnEnergy &&
        !pulling &&
        nearUpgradeLink &&
        room.upgradeLink.energy) {
      creep.withdraw(room.upgradeLink, RESOURCE_ENERGY);
      pulling = true;
    }
    
    // If there's a storage or container nearby, collect from that.
    if (!pulling) {
      let nearCans = _.filter(
          _.compact(_.union(room.containers, [room.terminal, room.storage])),
          s => creep.pos.isNearTo(s) && s.store.energy);
      if (nearCans.length) {
        let nearest = creep.pos.findClosestByPath(nearCans);
        creep.withdraw(nearest, RESOURCE_ENERGY);
        pulling = true;
      }
    }

    // If there's a nearby active source, mine it.
    if (!pulling) {
      let source = creep.pos.findInRange(FIND_SOURCES_ACTIVE, 1)[0];
      if (source && (creep.store.getFreeCapacity() >= workParts)) {
        creep.harvest(source);
        pulling = true;
      }
    }
      
    // Upgrade.
    let controllerRange = creep.pos.getRangeTo(room.controller);
    if (controllerRange <= 3) {
      creep.upgradeController(room.controller);
    }
    
    let desiredPos = getUpgradePosition();
    
    if (desiredPos) {
      myTravelTo(desiredPos[0], {range: desiredPos[1], maxRooms:1});
    }
  }
    
  function doGather() {
    // If I'm completely full, go back to work.
    if (creep.isFull) {
      setState(STATE_UPGRADE);
      return;
    }
    
    // If there's a source with some energy right next to me, mine it.
    let nearestSource = creep.pos.findClosestByPath(
        FIND_SOURCES_ACTIVE,
        {filter: s => !_.get(creep.room.memory, 'digsites.' + s.id + '.digger')});
    if (nearestSource) {
      if (creep.harvest(nearestSource) == OK) {
        // And try to upgrade, just in case.
        creep.upgradeController(room.controller);
        return;
      }
    }
    
    // If I'm (more or less) full, go back to work.
    if (creep.store.energy >= creep.store.getCapacity() * 3 / 5) {
      setState(STATE_UPGRADE);
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
    
    // If there's a storage or container with enough energy to fill me,
    // collect from that.
    let lack = creep.store.getFreeCapacity();
    let storages = _.filter(
        _.compact(_.union(room.containers, [room.storage, room.terminal])),
        s => s.store.energy >= lack/3 && (s.my || s.naked));
    if (storages.length) {
      let nearest = creep.pos.findClosestByPath(storages);
      if (creep.withdraw(nearest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearest, {range: 1});
      }
      return;
    }
      
    // If there's a source with some energy, go mine it.
    if (nearestSource) {
      if (creep.harvest(nearestSource) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestSource, {range: 1});
      }
      return;
    }

    // If there's a upgrade link with energy, go get it.
    if (creep.room.upgradeLink && creep.room.upgradeLink.store.energy) {
      myTravelTo(creep.room.upgradeLink, {range: 1});
      creep.withdraw(creep.room.upgradeLink, RESOURCE_ENERGY);
      return;
    }
    
    // If I've got some useful amount of energy, go back to work.
    if (creep.store.energy >= creep.store.getCapacity() / 4) {
      setState(STATE_UPGRADE);
      return;
    }
    
    // Wait.
  }
    
  function doCustom() {
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
      case STATE_UPGRADE:
        doUpgrade();
        break;
      case STATE_GATHER:
        doGather();
        break;
      case STATE_WAYPOINT:
        creep.doWaypoint(STATE_DEPLOY);
        break;
      case STATE_AMNESIAC:
        setState(STATE_DEPLOY);
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_DEPLOY);
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