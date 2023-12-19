'use strict';

let SpawnJob = require('util_spawnJob');

const STATE_INIT = 4;
const STATE_HEAL = 2;
const STATE_RAID = 3;
const STATE_BOOST_ALL = 6;
const STATE_RENEW = 98;

function getBody(model) {
  switch (model) {
    case 60: // Test shooter
      return [RANGED_ATTACK, MOVE];
    case 52: // 20-armor variant
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 51: // 15-armor variant
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 40: // 22-armor variant
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH,
          
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, 
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 31: // Power bank test
      return [HEAL, MOVE];
    case 30: // Ram skirmisher shooter/healer
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
    case 25: // Saruss Interdictor, Aundine model
      return [TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL];
    case 24: // Distraction variant
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 23: // Ram hybrid test
      return [TOUGH, HEAL, RANGED_ATTACK, MOVE, MOVE, MOVE];
    case 22: // Ram healer/shooter hybrid.
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL,
          
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 21: // Ram test
      return [TOUGH, HEAL, MOVE, MOVE];
    case 20: // Ram variant
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 7: // Single-tower edge-tanker.
      return [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    case 5: // Wrecker-buddy (heals 216)
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,

          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
    case 4: // SK model
      return [HEAL, HEAL, MOVE, MOVE, MOVE,   MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,   MOVE, MOVE, MOVE, MOVE, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,   HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL];
    case 3: // Bruiser-buddy (heals 120)
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL];
    case 2: // Power bank model
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL];
    case 1:
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL];
    default:
      console.log('Healer.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'healer',
      state: STATE_INIT,
      model: model,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Healer');
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

  if (creep.memory.model == 24 || creep.memory.model == 25) {
    return true;
  }

  return false;
}

function runSpawning(creep) {
  if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.memory.state = STATE_BOOST_ALL;
    creep.memory.subState = 0;
    creep.requestBoost('XGHO2', creep.getActiveBodyparts(TOUGH));
    creep.requestBoost('XZHO2', creep.getActiveBodyparts(MOVE));
    creep.requestBoost('XLHO2', creep.getActiveBodyparts(HEAL));
    creep.requestBoost('XKHO2', creep.getActiveBodyparts(RANGED_ATTACK));
    creep.room.requestBoost(creep);
  }
  
  if (creep.flag && creep.flag.memory.role == 'ram' && creep.flag.memory.spawnLock) {
      creep.synchronizeRamSpawn();
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6
  let stateLog = [];

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function doHeal() {
    if (creep.memory.unit || (creep.flag && creep.flag.memory.role == 'ram')) {
      setState(STATE_BOOST_ALL);
      return;
    }
    
    // Special: If I'm in my flag's room, and my flag says recycle, recycle.
    if (creep.memory.flagName &&
        creep.pos.roomName == Game.flags[creep.memory.flagName].pos.roomName &&
        Game.flags[creep.memory.flagName] &&
        Game.flags[creep.memory.flagName].memory.healer &&
        Game.flags[creep.memory.flagName].memory.healer.recycle) {
      setState(STATE_DIE);
      return;
    }
    
    // Move:
    // - If I'm not in my flag's room, move toward my flag.
    // - If there's a wounded member of my unit in the room, go toward it.
    // - If there's a wounded friendly in my room, go toward it.
    // - If there's a member of my unit in the room that isn't a healer, go
    //   toward it.
    // - Move toward my flag.
    let moveTarget;

    if (creep.pos.roomName != Game.flags[creep.memory.flagName].pos.roomName) {
      moveTarget = Game.flags[creep.memory.flagName];
    }

    if (creep.memory.flagName &&
        Game.flags[creep.memory.flagName].memory.healer &&
        Game.flags[creep.memory.flagName].memory.healer.stay) {
      moveTarget = Game.flags[creep.memory.flagName];
    }

    if (!moveTarget) {
      moveTarget = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
          filter: (c) => c.memory.flagName == creep.memory.flagName &&
              c.hits < c.hitsMax &&
              c.id != creep.id
      });
    }
    
    if (!moveTarget) {
      moveTarget = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
          filter: (c) => c.hits < c.hitsMax && c.id != creep.id
      });
    }

    if (!moveTarget) {
      moveTarget = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
          filter: (c) => c.memory.flagName == creep.memory.flagName &&
              c.getActiveBodyparts(HEAL) == 0 &&
              c.id != creep.id});
    }

    if (!moveTarget) {
      moveTarget = Game.flags[creep.memory.flagName];
    }

    myTravelTo(moveTarget);

    // If I have a gun, use it.
    if (creep.shootPower) {
      let ext = creep.pos.findInRange(creep.room.extensions, 3, {filter: e => e.hostile && e.naked})[0];
      if (ext) {
        creep.myRangedAttack(ext);
      } else {
        let targets = creep.pos.findInRange(creep.room.hostileCreeps, 3, {filter: 'naked'});
        let targetsInTouchRange = creep.pos.findInRange(targets, 1);

        if (targetsInTouchRange.length) {
          creep.rangedMassAttack();
        } else if (targets.length > 1 && creep.memory.previousTarget) {
          let otherTargets = _.filter(targets, c => c.id != creep.memory.previousTarget);
          let target = _.min(otherTargets, 'hits');
          creep.myRangedAttack(target);
          creep.memory.previousTarget = target.id;
        } else if (targets.length) {
          let target = _.min(targets, 'hits');
          creep.myRangedAttack(target);
          creep.memory.previousTarget = target.id;
        } else if (creep.pos.isEqualTo(moveTarget.pos) && creep.memory.model == 25) {
          creep.rangedMassAttack();
        }
      }
    }
    
    // If there are wounded friendlies within 1, heal the most damaged.
    let woundedCreeps = creep.pos.findInRange(creep.room.myWoundedCreeps, 1);
    
    if (woundedCreeps.length) {
      let mostDamaged = _.max(woundedCreeps, function(c) {return c.hitsMax - c.hits;});
      creep.myHeal(mostDamaged);
      return;
    }
    
    // If no wounded to heal, heal myself.
    creep.heal(creep);
    }
    
    function doRaid() {
    let partnerObj = Game.getObjectById(creep.memory.partnerId);

      // If I'm not within 1 of my partner, move toward him, otherwise move to flag.
      let x = creep.pos.x;
      let y = creep.pos.y;
    if (x > 1 && x < 49 && y > 1 && y < 49 && partnerObj && creep.pos.getRangeTo(partnerObj) > 1) {
      myTravelTo(partnerObj.pos);
    } else {
      myTravelTo(Game.flags[creep.memory.flagName].pos);
    }
      
      // Heal nearest damaged creep, including self.
      let damagedCreep = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: (c) => c.hits < c.hitsMax
      });
      if (damagedCreep) {
        if (creep.pos.getRangeTo(damagedCreep) > 1) {
          creep.rangedHeal(damagedCreep);
        } else {
          creep.heal(damagedCreep);
        }
      }
    }

  function doBoostAll() {
    if (creep.doBoost() == OK) {
      setState(STATE_APPENDAGE);
    }
    return;
  }
    
  function doRenew() {
    myTravelTo(creep.pos.findClosestByPath(FIND_MY_SPAWNS));
  }

  function doInit() {
    creep.notifyWhenAttacked(false);
    setState(STATE_HEAL);
  }

  function doCustom() {
  }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_HEAL:
        doHeal();
        break;
      case STATE_RAID:
        doRaid();
        break;
      case STATE_BOOST_ALL:
        doBoostAll();
        break;
      case STATE_APPENDAGE:
        break;
      case STATE_RENEW:
        doRenew();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_INIT:
        doInit();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_HEAL);
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