'use strict';

let SpawnJob = require('util_spawnJob');


const STATE_PICKUP = 1;
const STATE_DELIVER = 2;

function getBody(model) {
  switch (model) {
    case 2: // Armored transport
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,

          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 1:
      return [CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY,
        
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE];
    default:
      console.log('Wheelbarrow.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'wheelbarrow',
      model: model,
      state: STATE_PICKUP,
      subState: 0
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Wheelbarrow');
}

function requestSpawnCreep(rooms, model, creep, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);

  opts.requestingCreep = creep.id;

  opts.memory.workRoom = creep.memory.workRoom;
  opts.memory.subject = creep.id;

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  let mySubject = Game.getObjectById(creep.memory.subject);

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  
  function switchToDeliver() {
    if (!creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
      setState(STATE_DELIVER);
      return true;
    }
  }

  function pickupMoreEnergy() {
    if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
      myTravelTo(creep.room.storage);
    }
  }

  function chooseNewSubject() {
    return false;
  }

  function recycle() {
    if (!mySubject) {
      setState(STATE_DIE);
      return true;
    }
  }

  function feedBuilder() {
    if (mySubject.store.getFreeCapacity() >= creep.store[RESOURCE_ENERGY] ||
        mySubject.store.getFreeCapacity() >= mySubject.store.getUsedCapacity()) {
      creep.myTransfer(mySubject, RESOURCE_ENERGY);
    }
  }

  function switchToPickup() {
    if (!creep.store[RESOURCE_ENERGY]) {
      setState(STATE_PICKUP);
      return true;
    }
  }

  function hugBuilder() {
    myTravelTo(mySubject, {range:0});
  }

  function healSelf() {
    if (creep.healPower && (creep.hits < creep.hitsMax || creep.maxDamage)) {
      creep.myHeal(creep);
    }
  }

  function doPickup() {
    healSelf();

    switchToDeliver() ||
        pickupMoreEnergy();
  }

  function doDeliver() {
    healSelf();

    chooseNewSubject();

    if (recycle()) {
      return;
    }

    feedBuilder();

    switchToPickup() ||
        creep.doUnblock() ||
        hugBuilder();
  }

  function doCustom() {
  }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_PICKUP:
        doPickup();
        break;
      case STATE_DELIVER:
        doDeliver();
        break;
      case STATE_AMNESIAC:
        setState(STATE_DIE);
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
  requestSpawnCreep,
  run,
};