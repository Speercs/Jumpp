'use strict';

let Nav = require('util_nav');
let SpawnJob = require('util_spawnJob');


const STATE_LOAD = 1;
const STATE_JUMP = 2;
const STATE_UNLOAD = 3;

function getBody(model) {
  switch (model) {
      case 2: // test model
          return [CARRY, MOVE];
    case 1: // standard model
      return [CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,

        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE
      ];
    default:
      console.log('Sharder.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'sharder',
      model: model,
      state: STATE_LOAD,
      subState: 0
    }
  };
}

function getNewName() {
    return getUniqueCreepName('Sharder');
}

function requestSpawn(rooms, model, workRoom, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.requestingRoom = workRoom;
  opts.requestingComponent = 'sharders';
  opts.memory.workRoom = workRoom;

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];

  // ================================
  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function moveToTerminal() {
    if (creep.pos.getRangeTo(creep.workRoom.terminal) > 1) {
      return creep.travelTo2(creep.workRoom.terminal, {range: 1}) == OK;
    }
  }

  function setDestination() {
    if (creep.room.memory.sharders) {
      creep.memory.destination = _.clone(creep.room.memory.sharders.destination);
    }
  }

  function findPortal() {
    if (creep.memory.destination && creep.memory.destination.shard) {
      let portal  = _.find(
          creep.room.portals,
          p => p.destination && p.destination.shard == creep.memory.destination.shard);
      
      if (portal) {
        return portal;
      }
    }
  }

  // ================================
  function doLoad() {
    if (creep.ticksToLive < 300 || !creep.room.memory.sharders) {
      setState(STATE_DIE);
      return;
    }

    if (!creep.store.getFreeCapacity()) {
      setDestination();
      setState(STATE_JUMP);
      return;
    }

    moveToTerminal() || creep.doUnblock();

    loadFromTerminal();
  }

  function loadFromTerminal() {
    if (!creep.pos.isNearTo(creep.workRoom.terminal)) {
      return;
    }

    if (creep.room.memory.sharders && creep.room.memory.sharders.send) {
      for (let resource of creep.room.memory.sharders.send) {
        if (creep.room.terminal.store[resource] &&
            creep.withdraw(creep.room.terminal, resource) == OK) {
          return true;
        }
      }
    }
  }

  // ================================
  function doJump() {
    if (creep.memory.destination &&
        Game.rooms[creep.memory.destination.room] &&
        creep.memory.destination.shard == Game.shard.name) {
      setState(STATE_UNLOAD);
    }

    let intersection = Nav.getNearestIntersection(creep.pos.roomName);

    if (creep.pos.roomName == intersection) {
      let portal = findPortal();
      creep.travelTo2(portal, {range:0});
      if (creep.pos.isNearTo(portal) && !creep.fatigue) {
        creep.logDeparture(portal.destination.shard, creep.memory.destination.room);
      }
    } else {
      creep.travelTo2(new RoomPosition(25, 25, intersection));
    }
  }

  // ================================
  function doUnload() {
    moveToRecycleSpot() || moveToTerminal() || creep.doUnblock();

    unloadToTerminal() || unloadToStorage();
  }

  function moveToRecycleSpot() {
    if (creep.room.name != creep.memory.workRoom || creep.room.memory.sharders) {
      return;
    }

    let dieSpot = creep.pos.findClosestByPath(creep.room.recyclePositions);
    if (creep.pos.getRangeTo(dieSpot) == 0) {
      creep.memory.killMe = true;
    } else {
      creep.travelTo2(dieSpot, {range: 0});
    }

    return true;
  }

  function unloadToStorage() {
    if (creep.isEmpty) {
      setState(STATE_LOAD);
      return;
    }

    if (!creep.pos.isNearTo(creep.workRoom.storage)) {
      return;
    }

    return creep.myTransfer(creep.workRoom.storage, creep.mainCargo()) == OK;
  }

  function unloadToTerminal() {
    if (creep.isEmpty) {
      setState(STATE_LOAD);
      return;
    }

    if (!creep.pos.isNearTo(creep.workRoom.terminal)) {
      return;
    }

    return creep.myTransfer(creep.workRoom.terminal, creep.mainCargo()) == OK;
  }

  // ================================
  function doCustom() {
  }

  // ================================
  if (!creep.workRoom) {
    creep.logError(`Sharder has no work room, which ought to be impossible.`);
    return;
  }

  if (!creep.workRoom.terminal) {
    creep.logError(`Sharder's workRoom has no terminal, which ought to be impossible.`);
    return;
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_LOAD:
        doLoad();
        break;
      case STATE_JUMP:
        doJump();
        break;
      case STATE_UNLOAD:
        doUnload();
        break;
      case STATE_AMNESIAC:
        setState(STATE_UNLOAD);
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_LOAD);
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
  requestSpawn,
  run,
};