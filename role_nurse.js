'use strict';

let SpawnJob = require('util_spawnJob');


const STATE_BOOST_ALL = 1;
const STATE_IDLE = 2;

function getBody(model) {
  switch (model) {
    case 10: // test
      return [HEAL, HEAL, MOVE, MOVE];
    case 3: // light-ish boosted
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        
        MOVE, MOVE, MOVE, MOVE, MOVE];
    case 2: // boosted
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
    case 1: // unboosted
        return [HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    default:
      console.log('Nurse.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'nurse',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0,
      holdSpawn: true,
      suppressNotify: true,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Nurse');
}

function requestSpawnCreep(rooms, model, creep, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);

  opts.requestingCreep = creep.id;

  opts.memory.workRoom = creep.memory.workRoom;
  opts.memory.subject = creep.id;
  opts.memory.subjectRole = creep.memory.role;

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  return creep.needsBoostedMove();
}

function runSpawning(creep) {
	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestAllBoosts();
    creep.room.requestBoost(creep);
  }

  let mySubject = Game.getObjectById(creep.memory.subject);
  if (!mySubject.spawning) {
    // I guess it didn't wait? Cancel my hold.
    delete creep.memory.holdSpawn;
  }
}

function canQuad(creep) {
  return creep.memory.state != STATE_APPENDAGE;
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
    creep.checkSuppressNotify();

    if (creep.doBoost() == OK) {
      setState(STATE_IDLE);
      return;
    }

    if (creep.ticksToLive < 1350) {
      // Something has gone wrong. Die.
      setState(STATE_DIE);
      return;
    }
  }

  function moveToSubject() {
    let subject = Game.getObjectById(creep.memory.subject);
    if (subject) {
      myTravelTo(subject, {range:0});
      return true;
    }
  }

  function healWoundedFriendlyInTouchRange() {
    let friendlies = creep.pos.findInRange(creep.room.woundedCreeps, /* range = */ 1);
    if (!friendlies.length) {
      return;
    }

    let mostHurt = _.max(friendlies, c => c.hitsMax - c.hits);
    creep.logDebug(`touch healing ${mostHurt.name}`);
    creep.myHeal(mostHurt);
    return true;
  }

  function healWoundedFriendlyInHealRange() {
    let friendlies = creep.pos.findInRange(creep.room.woundedCreeps, /* range = */ 3);
    if (!friendlies.length) {
      return;
    }

    let mostHurt = _.max(friendlies, c => c.hitsMax - c.hits);
    creep.logDebug(`range healing ${mostHurt.name}`);
    creep.myRangedHeal(mostHurt);
    return true;
  }

  function preHeal() {
    let targets = _.filter(creep.room.myCreeps, 'maxDamage');
    if (!targets.length) {
      return;
    }

    // heal whoever can get hurt worst. Break ties in favor of a hitter.
    let needsItMost = _.max(targets, c => c.maxDamage * 5000 + c.attackPower);
    creep.logDebug(`pre-healing ${needsItMost.name}`);
    creep.myHeal(needsItMost);
    return true;
  }

  function maybeSuicide() {
    // If my subject was a claimer and it's gone, die. Probably I followed it back home.
    let subject = Game.getObjectById(creep.memory.subject);
    if (!subject && creep.memory.subjectRole == 'claimer') {
      setState(STATE_DIE);
      return true;
    }
  }

  function doIdle() {
    healWoundedFriendlyInTouchRange() ||
    healWoundedFriendlyInHealRange() ||
    preHeal();

    moveToSubject();
    maybeSuicide();
  }

  function doAppendage() {
    if (!(creep._quadRan > Game.time - 10)) {
      creep.logError(`I'm in STATE_APPENDAGE but my quad didn't update.`);
      setState(STATE_IDLE);
      return;
    }
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
      case STATE_IDLE:
        doIdle();
        break;
      case STATE_APPENDAGE:
        doAppendage();
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
  canQuad,
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestSpawnCreep,
  run,
  runSpawning
};