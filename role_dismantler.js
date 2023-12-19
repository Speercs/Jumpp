'use strict';

let SpawnJob = require('util_spawnJob');

const STATE_CHOOSE = 1;
const STATE_EAT = 2;
const STATE_DUMP = 3;

function getBody(model) {
  switch (model) {
    case 1:
      return [MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK,
          MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK,
          MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK];
    default:
      console.log('Dismantler.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
        role: 'dismantler',
        model: model
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Dismantler');
}

function requestSpawn(rooms, model, flag, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.flagName = flag.name;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function updateMetrics(creep) {
  if (creep.memory._prevEnergy == undefined) {
    creep.memory._prevEnergy = creep.store.energy;
    creep.memory._energyHarvested = 0;
    creep.memory._energyDelivered = 0;
    return;
  }
  
  if (creep.store.energy > creep.memory._prevEnergy) {
    creep.memory._energyHarvested += creep.store.energy - creep.memory._prevEnergy;
  }

  if (creep.store.energy < creep.memory._prevEnergy) {
    creep.memory._energyDelivered += creep.memory._prevEnergy - creep.store.energy;
  }
  creep.memory._prevEnergy = creep.store.energy;
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 4;
  let stateLog = []
  
  updateMetrics(creep);

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function doChoose() {
    if (creep.room != creep.flag.room) {
      creep.travelTo2(creep.flag);
      return;
    }

    let dismantleObjs = _.map(
        creep.room.memory.dismantle,
        function(id) {return Game.getObjectById(id)});
    let filteredDismantleObj = _.filter(dismantleObjs, (i) => i);
    let nearest = creep.pos.findClosestByPath(filteredDismantleObj);
    if (nearest) {
      creep.memory.targetId = nearest.id;
      setState(STATE_EAT);
    } else {
      setState(STATE_DIE);
    }
  }
  
  function doEat() {
    let targetObj = Game.getObjectById(creep.memory.targetId);
    if (!targetObj) {
      setState(STATE_CHOOSE);
      return;
    }
    
    if (creep.isFull || creep.ticksToLive < 100) {
      setState(STATE_DUMP);
      return;
    }
    
    if (creep.myDismantle(targetObj) == ERR_NOT_IN_RANGE) {
      creep.travelTo2(targetObj, {ignoreCreeps:false});
    }
  }
    
  function doDump() {
    if (!creep.store.energy) {
      if (creep.ticksToLive < 100) {
        setState(STATE_DIE)
      } else {
        setState(STATE_CHOOSE);
      }
      return;
    }
    
    // Dump at storage if there is one.
    if (creep.room.storage && creep.room.storage.my) {
      if (creep.pos.isNearTo(creep.room.storage)) {
        creep.myTransfer(creep.room.storage, RESOURCE_ENERGY);
      } else {
        creep.travelTo2(creep.room.storage);
      }
      return;
    }

    // Dump at the nearest container.
    let container = creep.pos.findClosestByPath(creep.room.containers);
    
    if (container) {
      if (creep.pos.isNearTo(container)) {
        creep.myTransfer(container, RESOURCE_ENERGY);
      } else {
        creep.travelTo2(container);
      }
      return;
    }
  }
  
  function doCustom() {
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_CHOOSE:
        doChoose();
        break;
      case STATE_EAT:
        doEat();
        break;
      case STATE_DUMP:
        doDump();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_CHOOSE);
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
  run
};