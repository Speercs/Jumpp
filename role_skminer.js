'use strict';

let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');


const STATE_DEPLOY = 1;
const STATE_WORK = 2;
const STATE_REPAIR_CONTAINER = 3;
const STATE_FLEE = 4;

function getBody(model) {
  switch (model) {
    case 10: // test
      return [MOVE, CARRY, WORK];
    case 1:
      return [MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,

          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK,
          
          CARRY];
    default:
      console.log('Skminer.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'skminer',
      model: model,
      state: STATE_DEPLOY,
      subState: 0
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Skminer');
}

function requestSpawn(sourceRoom, model, workRoom, lairId, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = workRoom;
  opts.memory.lairId = lairId;
  return SpawnJob.requestSpawn([sourceRoom.name], body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];

  function myTravelTo(target, options = {}) {
    options.allowSK = true;
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  

  function doDeploy() {
    if (creep.room.name != creep.memory.workRoom) {
      myTravelTo(
        new RoomPosition(
            Memory.rooms[creep.memory.workRoom]._lairs[creep.memory.lairId].sx,
            Memory.rooms[creep.memory.workRoom]._lairs[creep.memory.lairId].sy,
            creep.memory.workRoom),
        {range:1});
      return;
    }

    let myLair = Game.getObjectById(creep.memory.lairId);

    // Confused. No container? wait.
    if (!myLair.source.container) return;

    let targetPos = myLair.source.container.pos;

    if (creep.pos.isEqualTo(targetPos)) {
      setState(STATE_WORK);
      return;
    }

    myTravelTo(targetPos, {range: creep.pos.isNearTo(targetPos ? 0 : 1)});
  }

  function doWork() {
    let myLair = Game.getObjectById(creep.memory.lairId);
    let containerObj = myLair.source.container;

    if (!containerObj) return;

    if (myLair.keeper || myLair.ticksToSpawn < 20) {
      setState(STATE_FLEE);
      return;
    }


    if (creep.room.extractor.cooldown == 5 &&
        containerObj.store.energy >= creep.store.getCapacity() &&
        containerObj.hits < 200000) {
      setState(STATE_REPAIR_CONTAINER);
      return;
    }

    let workParts = creep.getActiveBodyparts(WORK);
    if (workParts <= containerObj.store.getFreeCapacity() + creep.store.getFreeCapacity()) {
      creep.harvest(myLair.source);
    } else if (creep.store[creep.room.nativeMineral] && containerObj.store.getFreeCapacity()) {
      creep.myTransfer(containerObj, creep.room.nativeMineral);
    }

    if (!myLair.source.mineralAmount && myLair.source.ticksToRegeneration > 1000) {
      if (creep.store[creep.room.nativeMineral] && containerObj.store.getFreeCapacity()) {
        creep.myTransfer(containerObj, creep.room.nativeMineral);
      }

      if (!creep.store[creep.room.nativeMineral]) {
        creep.logError(`Done and empty. Suiciding`);
        creep.suicide();
      }
    }
  }

  function doRepairContainer() {
    // Sub 0: Drop anything that isn't energy.
    if (creep.memory.subState == 0) {
      if (creep.store.getUsedCapacity() != creep.store.energy) {
        creep.drop(creep.mainCargo());
      } else {
        creep.memory.subState++;
      }
    }

    let myLair = Game.getObjectById(creep.memory.lairId);
    let containerObj = myLair.source.container;

    // Sub 1: Load up on energy.
    if (creep.memory.subState == 1) {
      if (creep.store.getFreeCapacity() && containerObj.store.energy) {
        creep.withdraw(containerObj, RESOURCE_ENERGY);
        return;
      } else {
        creep.memory.subState++;
      }
    }

    // Sub 2: Expend energy.
    if (creep.memory.subState == 2) {
      if (!creep.store.energy) {
        setState(STATE_WORK);
        return;
      }

      creep.repair(containerObj);
    }
  }

  function doFlee() {
    let myLair = Game.getObjectById(creep.memory.lairId);
    let containerObj = myLair.source.container;

    if (creep.store.getUsedCapacity() && containerObj) {
      creep.myTransfer(containerObj, creep.mainCargo());
    }

    if (!myLair.keeper && myLair.ticksToSpawn > 50) {
      setState(STATE_DEPLOY);
      return;
    }

    if (myLair.keeper && creep.pos.getRangeTo(myLair.keeper) < 6) {
      let path = PathFinder.search(
          creep.pos,
          {pos: myLair.keeper.pos, range:4},
          {flee: true, maxRooms:1, roomCallback: RoomCallback.avoidMyCreepsCallback});
      myTravelTo(path.path[0], {range:0});
      return;
    }

    if (!myLair.keeper && myLair.ticksToSpawn < 20) {
      let path = PathFinder.search(
          creep.pos,
          {pos: myLair.pos, range:4},
          {flee: true, maxRooms:1, roomCallback: RoomCallback.avoidMyCreepsCallback});
      myTravelTo(path.path[0], {range:0});
      return;
    }
  }

  function doCustom() {
  }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_WORK:
        doWork();
        break;
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_REPAIR_CONTAINER:
        doRepairContainer();
        break;
      case STATE_FLEE:
        doFlee();
        break;
      case STATE_AMNESIAC:
        setState(STATE_IDLE);
        break;
      case STATE_DIE:
        creep.suicide();
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
  requestSpawn,
  run
};