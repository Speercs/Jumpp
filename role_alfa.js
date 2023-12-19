'use strict';

let Nurse = require('role_nurse');
let SpawnJob = require('util_spawnJob');


const STATE_BOOST_ALL = 1;
const STATE_DEPLOY = 2;
const STATE_GUARD = 3;

function getBody(model) {
  switch (model) {
    case 10: // test
      return [ATTACK, MOVE];
    case 3: // light-ish boosted
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        
        MOVE, MOVE, MOVE, MOVE, MOVE];
    case 2: // boosted
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
    case 1: // unboosted
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
    default:
      console.log('Alfa.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'alfa',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0,
      holdSpawn: true,
      suppressNotify: true,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Alfa');
}

function numSpawningAlfas(roomName) {
  let room = Game.rooms[roomName];
  if (!room) return 0;
  return _.filter(room.spawns, s => s.spawning && Memory.creeps[s.spawning.name].role == 'alfa').length;
}

// Can get a nasty deadlock if a base is making three alfas. Strike from the list of rooms
// any rooms that are already spawning more than one alfa.
// Limit it even further. No point trying to do two alfas at once. The other will just wait anyway.
function filterRooms(rooms) {
  return _.filter(rooms, r => numSpawningAlfas(r) < 1);
}

function requestSpawn(rooms, model, worksite, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  let filteredRooms = filterRooms(rooms);
  if (filteredRooms.length < 1) return OK;

  if (worksite instanceof Flag) {
    opts.memory.flagName = worksite.name;
    opts.memory.workRoom = worksite.pos.roomName;
  } else {
    opts.memory.workRoom = worksite;
  }
  return SpawnJob.requestSpawn(filteredRooms, body, name, opts, priority);
}

function canQuad(creep) {
  return creep.memory.state != STATE_APPENDAGE;
}

function shouldBoost(creep) {
  return creep.needsBoostedMove();
}

function runSpawning(creep) {
	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestAllBoosts();
    creep.room.requestBoost(creep);
  }

  if (!creep.memory.nurse && creep.memory._lastSpawn) {
    creep.memory.nurse = creep.memory._lastSpawn.name;
  }

  let myNurse = Game.creeps[creep.memory.nurse];

  if (creep.memory.holdSpawn && myNurse) {
    let mySpawn = Game.spawns[creep.memory.spawnedBy];
    let herSpawn = Game.spawns[myNurse.memory.spawnedBy];

    if ((!mySpawn || !mySpawn.spawning.remainingTime) &&
        (!herSpawn || !herSpawn.spawning.remainingTime)) {
      delete creep.memory.holdSpawn;
      delete myNurse.memory.holdSpawn;
    }
  }
}

function getNurseModel(creep) {
  return creep.memory.model;
}

function preUpdate(creep) {
  if (creep.spawning && creep.id && !creep.memory._lastSpawn) {
    let rooms = [creep.room.name];
    let model = getNurseModel(creep);
    let priority = SpawnJob.PRIORITY_HIGH;
    Nurse.requestSpawnCreep(rooms, model, creep, priority);
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  let myPost = creep.flag ? creep.flag.pos : roomGuardPosition(creep.memory.workRoom);

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
      setState(STATE_WAYPOINT);
      return;
    }

    if (creep.ticksToLive < 1350) {
      // Something has gone wrong. Die.
      setState(STATE_DIE);
      return;
    }
  }

  function shouldSwitchToGuardMode() {
    return creep.pos.roomName == myPost.roomName;
  }

  function attackHostilesInTouchRange() {
    let targets = creep.pos.findInRange(creep.room.hostilePlayerCreeps, /* range = */ 1);

    if (!targets.length) {
      targets = creep.pos.findInRange(creep.room.npcs, /* range = */ 1);
    }

    if (targets.length) {
      let target = _.max(targets, function (c) {
        return c.healPower + (c.attackPower * 5000) + (c.shootPower * 5000);
      });

      creep.myAttack(target);
    }
  }

  function getClearOfLabs() {
    if (!creep.room.controller ||
        !creep.room.controller.my ||
        !creep.room.labs.length) {
      return;
    }

    let nearLabs = creep.pos.findInRange(creep.room.labs, 8);
    if (nearLabs.length) {
      myTravelTo(myPost, {range:0});
      return true;
    }
  }

  function waitForNurse() {
    if (creep.pos.onEdge) {
      return;
    }

    let myNurse = Game.creeps[creep.memory.nurse];

    if (myNurse && !creep.pos.isNearTo(myNurse.pos)) {
      return true;
    }
  }

  function markTime() {
    if (creep.memory.halt) {
      creep.memory.halt--;
      return true;
    }
  }

  function awayFromEdgeDirection() {
    let fromTop = creep.pos.y;
    let fromRight = 49 - creep.pos.x;
    let fromBottom = 49 - creep.pos.y;
    let fromLeft = creep.pos.x;

    if (fromTop < fromRight &&
        fromTop < fromLeft &&
        fromTop < fromBottom) {
      return BOTTOM;
    }

    if (fromRight < fromLeft &&
        fromRight < fromBottom) {
      return LEFT;
    }

    if (fromLeft < fromBottom) return RIGHT;
    
    return TOP;
  }

  function moveToPost() {
    if (creep.memory.freeze) return;

    let myNurse = Game.creeps[creep.memory.nurse];

    // Special phalanx stuff: If I'm on my flag, and near a room edge, and my nurse is ON the room edge, move directly away from the nurse.
    // This should cause me to move into the room a bit, and the nurse to move onto the flag. Next tick, we should swap places.
    if (creep.pos.isEqualTo(myPost) &&
        creep.pos.nearEdge &&
        myNurse &&
        myNurse.pos.onEdge) {
      myTravelTo(creep.pos.oneStep(awayFromEdgeDirection()), {range:0});
    }
    myTravelTo(myPost, {range:0});
    return true;
  }

  function getTetherDistance() {
    return (creep.flag && creep.flag.room && creep.flag.memory.alfa && creep.flag.memory.alfa.tether) || 50;
  }

  function getTetherPosition() {
    return (creep.flag && creep.flag.pos) || creep.pos;
  }

  function closeWithEnemy() {
    // Quick out. Don't attempt to close with the enemy at all if our tether distance is 0.
    if (creep.flag && creep.flag.memory.alfa && creep.flag.memory.alfa.tether == 0) return;

    if (creep.memory.freeze) return;

    let tetherPosition = getTetherPosition();
    let tetherDistance = getTetherDistance();
    let enemies = tetherPosition.findInRange(creep.room.hostileCreeps, tetherDistance);
    if (!enemies.length) {
      return;
    }

    let closest = creep.pos.findClosestByPath(enemies);
    if (!closest) {
      return;
    }

    myTravelTo(closest, {range:0});
    return true;
  }

  function doDeploy() {
    if (shouldSwitchToGuardMode()) {
      setState(STATE_GUARD);
      return;
    }

    // act
    attackHostilesInTouchRange();

    // move
    markTime() ||
        getClearOfLabs() ||
        waitForNurse() ||
        moveToPost();
  }

  function doGuard() {
    // act
    attackHostilesInTouchRange();

    // move
    waitForNurse() ||
        closeWithEnemy() ||
        moveToPost();
  }

  function doAppendage() {
    if (!(creep._quadRan > Game.time - 10)) {
      creep.logError(`I'm in STATE_APPENDAGE but my quad didn't update.`);
      setState(STATE_DEPLOY);
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
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_GUARD:
        doGuard();
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
      case STATE_WAYPOINT:
        creep.doWaypoint(STATE_DEPLOY);
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
  requestSpawn,
  preUpdate,
  run,
  runSpawning
};