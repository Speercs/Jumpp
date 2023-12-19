'use strict';

let SpawnJob = require('util_spawnJob');


const STATE_INIT = 1;
const STATE_BOOST_ALL = 2;

function getBody(model) {
  switch (model) {
    case 60: // test healer
      return [HEAL, MOVE];
    case 40: // Up-armored variant.
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, 
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          HEAL, HEAL, HEAL,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 30: // Wrecker variant.
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 21: // ram test
      return [TOUGH, RANGED_ATTACK, MOVE, MOVE];
    case 20: // ram model
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          HEAL, HEAL, HEAL, HEAL,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    default:
      console.log('Sister.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'sister',
      model: model
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Sister');
}

function requestSpawn(rooms, model, flag, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.flagName = flag.name;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function requestSpawnRam(rooms, model, flagName, subRole, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.flagName = flagName;
  opts.memory.subRole = subRole;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function requestSpawnUnit(rooms, model, unit, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.unit = unit;
  opts.memory.holdSpawn = true;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  if (creep.flag && creep.flag.memory.role == 'ram' && creep.flag.memory.boost) {
    return true;
  }

  if (creep.memory.unit && (creep.numBodyparts(MOVE) < creep.body.length / 2)) {
    return true;
  }

  return false;
}

function runSpawning(creep) {
	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestBoost('XGHO2', creep.getActiveBodyparts(TOUGH));
    creep.requestBoost('XZHO2', creep.getActiveBodyparts(MOVE));
    creep.requestBoost('XKHO2', creep.getActiveBodyparts(RANGED_ATTACK));
    creep.requestBoost('XZH2O', creep.getActiveBodyparts(WORK));
    creep.requestBoost('XLHO2', creep.getActiveBodyparts(HEAL));
    creep.room.requestBoost(creep);
  }

  if (creep.flag && creep.flag.memory.role == 'ram' && creep.flag.memory.spawnLock) {
    creep.synchronizeRamSpawn();
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 4;
  let stateLog = [];
  
  function myTravelTo(target, userOptions = {}) {
    let options = {
      range: 1,
    };
    
    _.merge(options, userOptions);
    
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  
  function doInit() {
    // If my flag is a phalanx flag, go to STATE_APPENDAGE.
    if (creep.flag && creep.flag.memory.role == 'ram') {
      setState(STATE_BOOST_ALL);
      return;
    }
    
    if (creep.memory.unit) {
      setState(STATE_BOOST_ALL);
      return;
    }
  }

  function doAppendage() {
  }

  function doBoostAll() {
    if (creep.doBoost() == OK) {
      setState(STATE_APPENDAGE);
    }
  }

  function doCustom() {
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_INIT:
        doInit();
        break;
      case STATE_APPENDAGE:
        doAppendage();
        break;
      case STATE_BOOST_ALL:
        doBoostAll();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_INIT);
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
  requestSpawnRam,
  requestSpawnUnit,
  run,
  runSpawning
};