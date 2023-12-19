'use strict';

let SpawnJob = require('util_spawnJob');


const STATE_BOOST_ALL = 1;
const STATE_BUILD_CONTAINER_DEPLOY = 2;
const STATE_BUILD_CONTAINER = 3;
const STATE_RELOAD = 4;

const TASK_BUILD_CONTAINER = 1;

function getBody(model) {
  switch (model) {
    case 10: // test model
      return [MOVE, MOVE, CARRY, WORK];
    case 2: // unboosted container builder
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,

          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,

          WORK, WORK, WORK, WORK, WORK];
    case 1: // boosted container builder
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY,
          WORK, WORK];
    default:
      console.log('Engineer.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'engineer',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Engineer');
}

function missionBuildContainer(roomName, lairId, pos) {
  let task = TASK_BUILD_CONTAINER;
  return {task, roomName, lairId, pos};
}

function requestSpawn(sourceRoom, model, mission, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.mission = mission;
  opts.memory.workRoom = mission.roomName;
  return SpawnJob.requestSpawn([sourceRoom.name], body, name, opts, priority);
}

function shouldBoost(creep) {
  return creep.memory.model == 1;
}

function runSpawning(creep) {
	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
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
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  

  function doBoostAll() {
    if (creep.doBoost() == OK) {
      if (creep.memory.mission.task == TASK_BUILD_CONTAINER) {
        setState(STATE_BUILD_CONTAINER_DEPLOY);
        return;
      } else {
        creep.logError(`Invalid mission: ${JSON.stringify(creep.memory.mission)}`);
      }
    }

    if (creep.ticksToLive < 1350) {
      // Something has gone wrong. Die.
      setState(STATE_DIE);
      return;
    }
  }

  const CONTAINER_BUILD_ENERGY_BOOSTED = 2500;
  function energyLoad() {
    if (creep.memory.model == 1) return CONTAINER_BUILD_ENERGY_BOOSTED;
    return creep.store.getCapacity();
  }

  function doBuildContainerDeploy() {
    if (creep.store.energy < energyLoad() && creep.room.terminal) {
      let lack = energyLoad() - creep.store.energy;
      if (creep.withdraw(creep.room.terminal, RESOURCE_ENERGY, lack) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.terminal, {range:1, maxRooms:1});
        return;
      }
    }

    let myLair = Game.getObjectById(creep.memory.mission.lairId);
    let buildPosition = new RoomPosition(creep.memory.mission.pos.x,
        creep.memory.mission.pos.y,
        creep.memory.mission.pos.roomName);

    if (!myLair || creep.room != myLair.room || creep.pos.onEdge) {
      myTravelTo(buildPosition, {range:0});
      return;
    }

    // In the room.
    let lairDistance = creep.pos.getRangeTo(myLair);
    let buildPosDistance = creep.pos.getRangeTo(buildPosition);

    // Get closer if it's safe.
    if (myLair.keeper &&
        myLair.keeper.pos.isNearTo(myLair.source) &&
        creep.pos.getRangeTo(myLair.keeper) > 4) {
      myTravelTo(buildPosition, {range:3, maxRooms:1})
    }

    // Approach.
    if (lairDistance > 5 && buildPosDistance > 5) {
      myTravelTo(buildPosition, {range:0, maxRooms:1});
      return;
    }

    // Wait.
    if (myLair.keeper || myLair.ticksToSpawn < 260) {
      return;
    }

    myTravelTo(buildPosition, {range:0, maxRooms:1});

    // Build
    setState(STATE_BUILD_CONTAINER);
    return;
  }

  function doBuildContainer() {
    let myLair = Game.getObjectById(creep.memory.mission.lairId);
    if (!myLair) {
      creep.logError(`I can't see my lair. Which should be impossible in this state.`);
      return;
    }
    let buildPosition = new RoomPosition(creep.memory.mission.pos.x,
        creep.memory.mission.pos.y,
        creep.memory.mission.pos.roomName);

    if (!creep.store.energy && !myLair.source.container) {
      setState(STATE_RELOAD);
      return;
    }

    if (myLair.source.container) {
      if (creep.boosted) {
        setState(STATE_DIE);
        return;
      } else {
        creep.suicide();
        return;
      }
    }

    let site = buildPosition.lookFor(LOOK_CONSTRUCTION_SITES)[0];
    if (!site) {
      buildPosition.createConstructionSite(STRUCTURE_CONTAINER);
    } else if (!site.my) {
      creep.logError(`removing foreign site`);
      site.remove();
    }

    // Stand directly on it.
    if (creep.pos.getRangeTo(buildPosition)) {
      myTravelTo(buildPosition, {range:0, maxRooms:1});
    }

    creep.build(site);
  }

  function doReload() {
    if (!creep.store.getFreeCapacity()) {
      setState(STATE_BUILD_CONTAINER);
      return;
    }

    let myLair = Game.getObjectById(creep.memory.mission.lairId);

    let pile = creep.pos.findInRange(
      FIND_DROPPED_RESOURCES, 1, {filter: r => r.resourceType == RESOURCE_ENERGY })[0];
    if (pile) {
      if(creep.pickup(pile) == ERR_NOT_IN_RANGE) {
        myTravelTo(pile, {range:1})
      }
      return;
    }

    let stone = creep.pos.findInRange(FIND_TOMBSTONES, 1, {filter: s => s.store.energy})[0];
    if (stone) {
      if (creep.withdraw(stone, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(stone, {range:1});
      }
      return;
    }

    pile = creep.pos.findInRange(
      FIND_DROPPED_RESOURCES, 3, {filter: r => r.resourceType == RESOURCE_ENERGY })[0];
    if (pile) {
      if(creep.pickup(pile) == ERR_NOT_IN_RANGE) {
        myTravelTo(pile, {range:1})
      }
      return;
    }

    stone = creep.pos.findInRange(FIND_TOMBSTONES, 3, {filter: s => s.store.energy})[0];
    if (stone) {
      if (creep.withdraw(stone, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(stone, {range:1});
      }
      return;
    }

    if (!creep.store.energy) {
      creep.logError(`Suiciding because no energy, and no energy available.`);
      creep.suicide();
      return;
    }

    setState(STATE_BUILD_CONTAINER);
    return;
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
      case STATE_BUILD_CONTAINER_DEPLOY:
        doBuildContainerDeploy();
        break;
      case STATE_BUILD_CONTAINER:
        doBuildContainer();
        break;
      case STATE_RELOAD:
        doReload();
        break;
      case STATE_AMNESIAC:
        setState(STATE_IDLE);
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_AMNESIAC);
        break;
    }
    stateLog.push({state: creep.memory.state, subState: creep.memory.subState});
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped at ' + creep.pos.link);
    console.log(`Warning: Creep ${creep.name} maxLooped at ${creep.pos.link}`);
    stateLog.forEach(function(element) {
      console.log(`state: ${element.state} substate: ${element.subState}`);
    });
  }
}

module.exports = {
  getBody,
  getDefaultCreateOpts,
  getNewName,
  missionBuildContainer,
  requestSpawn,
  run,
  runSpawning
};