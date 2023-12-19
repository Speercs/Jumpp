'use strict';

let SpawnJob = require('util_spawnJob');

const STATE_DEPLOY = 2;
const STATE_BOOST_ALL = 3;
const STATE_WRECK = 4;
const STATE_RENEW = 98;

function getBody(model) {
  switch (model) {
    case 60: // Test shooter
      return [RANGED_ATTACK, MOVE];
  case 55: // crude two-tower variant of the 54
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        
        MOVE, MOVE, MOVE, MOVE,

        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, 
    ];
  case 54: // boosted single-tower solo operator
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        
        MOVE, MOVE, MOVE, MOVE,

        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL
    ];
  case 53: // pincushion
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, WORK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 52: // 20-armor shooter shooter
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 51: // 15-armor shooter shooter
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 50: // shooter model
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 40: // up-armored variant
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH,
          
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, 
          
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, 
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 30: // skirmisher melee variant
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,

          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
    case 24: // Unboosted hitter variant
      return [ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 23: // Unit hitter variant
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 22: // unarmored variant
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,

          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 21: // Ram test
      return [TOUGH, WORK, MOVE, MOVE];
    case 20: // Ram variant (requires boosted move)
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 1: // unarmored non-boosted variant
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    default:
      console.log('Wrecker.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'wrecker',
      model: model
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Wrecker');
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
    creep.requestBoost('XUH2O', creep.getActiveBodyparts(ATTACK));
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
  let maxRepeat = 6;
  let stateLog = [];

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  
  function myTravelTo(target, options) {
    creep.travelTo2(target, options);
  }

  function doDeploy() {
    setState(STATE_BOOST_ALL);
    return;
  }

  function doBoostAll() {
    if (creep.doBoost() == OK) {
      setState(STATE_APPENDAGE);
    }
    return;
  }
    
  function doWreck() {
    if (!creep.flag) {
      setState(STATE_DIE);
    }

    // Go to my flag's room.
    if (creep.pos.roomName != creep.flag.pos.roomName || creep.pos.onEdge) {
      myTravelTo(creep.flag);
      return;
    }
    
    // Wreck anything with a flag on it whose name starts with 'wreck', in
    // alpha order by flag name.
    let wreckFlags = creep.room.find(FIND_FLAGS, {
      filter: f => f.name.startsWith('wreck')
    });
    
    _.sortBy(wreckFlags, 'name');
    
    for (let i=0; i < wreckFlags.length; i++) {
      let flag = wreckFlags[i];
      let structures = flag.pos.findInRange(FIND_HOSTILE_STRUCTURES, 0);
      
      if (structures.length == 0) {
        flag.remove();
        continue;
      }
      
      if (creep.pos.isNearTo(structures[0])) {
        let result = creep.myDismantle(structures[0]);
      } else  {
        myTravelTo(structures[0], {range:1});
      }
      return;
    }
    
    // If in ham mode, wreck any roads I can reach.
    if (creep.memory.ham) {
      let road = creep.pos.findInRange(creep.room.roads, 1)[0];
      creep.myDismantle(road);
    }
  }

  function doRenew() {
    myTravelTo(creep.pos.findClosestByPath(FIND_MY_SPAWNS));
  }
  
  function doCustom() {
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_BOOST_ALL:
        doBoostAll();
        break;
      case STATE_APPENDAGE:
        break;
      case STATE_WRECK:
        doWreck();
        return;
      case STATE_RENEW:
        doRenew();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      case STATE_DIE:
        creep.doDie();
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
  requestSpawnRam,
  requestSpawnUnit,
  run,
  runSpawning
};