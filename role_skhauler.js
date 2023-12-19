'use strict';

let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');


const STATE_PICKUP = 1;
const STATE_DELIVER = 2;
const STATE_FETCH_ENERGY = 3;

function getBody(model) {
  switch (model) {
    case 10: // test
      return [CARRY, CARRY, MOVE];
    case 1:
      return [CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,

          CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY,

          MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE];
    default:
      console.log('Skhauler.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'skhauler',
      model: model,
      state: STATE_PICKUP,
      subState: 0
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Skhauler');
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
  

  function doPickup() {
    let myLair = Game.getObjectById(creep.memory.lairId);

    if (!myLair) {
      let sourcePos = new RoomPosition(
        Memory.rooms[creep.memory.workRoom]._lairs[creep.memory.lairId].sx,
        Memory.rooms[creep.memory.workRoom]._lairs[creep.memory.lairId].sy,
        creep.memory.workRoom);
      myTravelTo(sourcePos, {range:1});
      return;
    }

    let containerObj = myLair.source && myLair.source.container;

    if (!creep.store.getFreeCapacity() || !containerObj) {
      setState(STATE_DELIVER);
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

    if (myLair.ticksToSpawn > 50 &&
        containerObj.store.energy < 200 &&
        !creep.store.energy &&
        creep.pos.getRangeTo(containerObj) < 5 &&
        containerObj.store[creep.room.nativeMineral] < 1400) {
      let pile = creep.pos.findInRange(
          FIND_DROPPED_RESOURCES, 1, {filter: r => r.resourceType == RESOURCE_ENERGY })[0];
      if (pile) {
        creep.pickup(pile);
        return;
      }

      let stone = creep.pos.findInRange(FIND_TOMBSTONES, 1, {filter: s => s.store.energy})[0];
      if (stone) {
        creep.withdraw(stone, RESOURCE_ENERGY);
        return;
      }
    }

    if (creep.store.energy) {
      if (creep.pos.isNearTo(containerObj) && containerObj.store.energy < 400) {
        let transferAmount = Math.min(creep.store.energy,
            400 - containerObj.store.energy,
            containerObj.store.getFreeCapacity())
        creep.myTransfer(containerObj, RESOURCE_ENERGY, transferAmount);
      } else if (containerObj.store.energy == 400) {
        creep.drop(RESOURCE_ENERGY);
      }
    }

    if (!creep.pos.isNearTo(containerObj)) {
      myTravelTo(containerObj, {range:1});
      return;
    }

    if (containerObj.store[creep.room.nativeMineral] >= creep.store.getFreeCapacity()) {
      creep.withdraw(containerObj, creep.room.nativeMineral);
    } else if (containerObj.store.energy > 400) {
      let withdrawAmount = Math.min(containerObj.store.energy - 400, creep.store.getFreeCapacity());
      creep.withdraw(containerObj, RESOURCE_ENERGY, withdrawAmount);
    }

    if (creep.ticksToLive < 150) {
      if (creep.store.getFreeCapacity() && containerObj.store[creep.room.nativeMineral]) {
        creep.withdraw(containerObj, creep.room.nativeMineral);
        return;
      }

      if (creep.store[creep.room.nativeMineral]) {
        setState(STATE_DELIVER);
        return;
      }

      creep.suicide();
      return;
    }

    if (containerObj.hits < 150000 &&
        !containerObj.store.energy &&
        containerObj.store[creep.room.nativeMineral] < 1200 &&
        !creep.store.energy) {
      if (myLair.source.pos.findInRange(FIND_TOMBSTONES, 5, {filter: s => s.store.energy})[0] ||
          myLair.source.pos.findInRange(
              FIND_DROPPED_RESOURCES,
              5,
              {filter: r => r.resourceType == RESOURCE_ENERGY })[0]) {
        setState(STATE_FETCH_ENERGY);
        return;
      }
    }

    if (myLair.source.mineralAmount == 0) {
      if (containerObj.store[creep.room.nativeMineral]) {
        creep.withdraw(containerObj, creep.room.nativeMineral);
      } else {
        setState(STATE_DELIVER);
        return;
      }
    }
  }

  function doDeliver() {
    let myLair = Game.getObjectById(creep.memory.lairId);

    if (!creep.store.getUsedCapacity() && creep.hits == creep.hitsMax) {
      let containerObj = myLair.source.container;
      if (!containerObj) {
        creep.logError(`Suiciding because no container.`);
        creep.suicide();
        return;
      }

      if (!containerObj.store[containerObj.room.nativeMineral] && !myLair.source.mineralAmount) {
        creep.logError('Suiciding because done.');
        creep.suicide();
        return;
      }

      if (creep.ticksToLive < 150) {
        creep.logError(`Suiciding because ttl=${creep.ticksToLive}.`);
        creep.suicide();
        return;
      }
      setState(STATE_PICKUP);
      return;
    }

    let dropRoomName = Memory.rooms[creep.memory.workRoom].mine.base.roomName;
    let dropObj = Game.rooms[dropRoomName].terminal;

    if (creep.myTransfer(dropObj, creep.mainCargo()) == ERR_NOT_IN_RANGE) {
      myTravelTo(dropObj, {range:1});
    }
  }

  function doFetchEnergy() {
    if (creep.store.energy >= 400) {
      setState(STATE_PICKUP);
      return;
    }

    let myLair = Game.getObjectById(creep.memory.lairId);

    let pile = myLair.source.pos.findInRange(
      FIND_DROPPED_RESOURCES, 5, {filter: r => r.resourceType == RESOURCE_ENERGY })[0];
    if (pile) {
      let pickupAmount = Math.min(400, creep.store.getFreeCapacity(), pile.amount);
      if(creep.pickup(pile, pickupAmount) == ERR_NOT_IN_RANGE) {
        myTravelTo(pile, {range:1})
      }
      return;
    }

    let stone = myLair.source.pos.findInRange(FIND_TOMBSTONES, 5, {filter: s => s.store.energy})[0];
    if (stone) {
      let withdrawAmount = Math.min(400, creep.store.getFreeCapacity(), stone.store.energy);
      if (creep.withdraw(stone, RESOURCE_ENERGY, withdrawAmount) == ERR_NOT_IN_RANGE) {
        myTravelTo(stone, {range:1});
      }
      return;
    }

    setState(STATE_PICKUP);
    return;
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
      case STATE_FETCH_ENERGY:
        doFetchEnergy();
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
  requestSpawn,
  run
};