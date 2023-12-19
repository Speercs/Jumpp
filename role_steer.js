'use strict';

let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');


const STATE_BOOST_ALL = 1;
const STATE_INITIAL_LOAD = 3;
const STATE_DEPLOY = 2;

function getBody(model) {
  switch (model) {
    case 7: // RCL7 variant
      return [HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE];
    case 3: // boosted
      return [CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,

          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 2: // test
      return [HEAL, MOVE];
    case 1: // unboosted
      return [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    default:
      console.log('Steer.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'steer',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0,
      noRenew: true
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Steer');
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
  return creep.needsBoostedMove();
}

function runSpawning(creep) {
	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestBoost('XZHO2', creep.getActiveBodyparts(MOVE));
    creep.requestBoost('XKH2O', creep.getActiveBodyparts(CARRY));
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

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
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
    // If I'm full of energy, move out.
    if (creep.isFull) {
      setState(STATE_WAYPOINT);
      return;
    }
    
    // Load energy from terminal.
    if (creep.withdraw(creep.room.terminal, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
      myTravelTo(creep.room.terminal, {range:1});
    }
  }

  function doDeploy() {
    // Heal self if necessary
    if (creep.hits < creep.hitsMax) {
      creep.myHeal(creep);
    }

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

    // If I'm in my work room and I'm carrying energy, unload it.
    if (creep.pos.roomName == creep.memory.workRoom &&
      creep.store.energy &&
      creep.room.storage) {
      myTravelTo(creep.room.storage, {range: 1});
      creep.myTransfer(creep.room.storage, RESOURCE_ENERGY);
      return;
    }
    
    // If I'm in my work room and there's a spawn, die.
    if (creep.pos.roomName == creep.memory.workRoom &&
      !creep.pos.onEdge &&
      creep.room.spawns.length) {
      setState(STATE_DIE);
      return;
    }
    
    let workRoom = Game.rooms[creep.memory.workRoom];
    
    // If there's a visible spawn in my work room, go to that.
    if (workRoom && workRoom.spawns.length && workRoom.spawns[0].my) {
      myTravelTo(
          workRoom.spawns[0],
          {range:1, allowSK:true, roomCallback:RoomCallback.avoidKeepersCallback});
      return;
    }
    
    // If there's a visible spawn construction site in my work room, go
    // to that.
    if (workRoom) {
      let site = workRoom.find(FIND_CONSTRUCTION_SITES, {
        filter: s => s.structureType == STRUCTURE_SPAWN
      })[0];
      
      if (site) {
        myTravelTo(site, {range:1, allowSK:true, roomCallback:RoomCallback.avoidKeepersCallback});

        return;
      }
    }
    
    // Go to my work room controller site.
    myTravelTo(creep.workRoomControllerPos, {range:3, allowSK:true, roomCallback:RoomCallback.avoidKeepersCallback});
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