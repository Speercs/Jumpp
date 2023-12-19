'use strict';

let SpawnJob = require('util_spawnJob');


const STATE_RED_ALERT = 1;
const STATE_BOOST_ALL = 2;

function getBody(model) {
  switch (model) {
    case 4: // RCL7 model
      return [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE];
    case 3: // boosted model.
      return [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 2: // testing model.
      return [RANGED_ATTACK, MOVE];
    case 1: // unboosted model.
      return [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    default:
      console.log('Archer.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'archer',
      model: model,
      state: STATE_RED_ALERT,
      subState: 0
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Archer');
}

function requestSpawn(rooms, model, flag, priority, workRoom) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  if (flag) {
    opts.memory.flagName = flag.name;
    opts.memory.workRoom = flag.pos.roomName;
  } else {
    opts.memory.workRoom = workRoom;
  }
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  return creep.memory.model == 3;
}

function runSpawning(creep) {
  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
  }

	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    setState(STATE_BOOST_ALL);
    creep.requestBoost('XKHO2', creep.getActiveBodyparts(RANGED_ATTACK));
    creep.requestBoost('XZHO2', creep.getActiveBodyparts(MOVE));
		creep.room.requestBoost(creep);
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 4;
  let stateLog = [];

  function roomCallback(roomName, matrix) {
    DefaultRoomCallback(roomName, matrix);
    Game.rooms[roomName].blockUnsafeTiles(matrix);
    return matrix;
  }

  function myTravelTo(target) {
    creep.travelTo2(target, {
      range: 1,
      repath: 1,
      roomCallback: roomCallback
    });
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function doRedAlert() {
    // If the red alert is over, stand down.
    if (creep.room.alertCondition != ALERT_CONDITION_RED) {
      setState(STATE_DIE);
      return;
    }

    // Identify the room's weakest critical wall.
    let weakestCrit = creep.room.weakestCriticalWall;

    // Identify the enemy nearest that wall.
    let moveTarget = weakestCrit.pos.findClosestByRange(creep.room.hostileCreeps);

    // Get as near to that enemy as you can while remaining in the safe
    // area.
    if (moveTarget) {
      myTravelTo(moveTarget);
    }

    // It could be that the room already operated our weapon. If so, let its action stand.
    if (creep._roomFired) return;

    // Attack nearby enemies.
    let enemies = creep.pos.findInRange(creep.room.hostileCreeps, 3);

    enemies.sort(function(a, b) {
      // Take the one with the most incoming damage
      return b.incomingDamage - a.incomingDamage ||
        // or the one that's most damaged
        (b.hitsMax - b.hits) - (a.hitsMax - a.hits) ||
        // or the one with the fewest hits.
        a.hits - b.hits;
    });

    if (enemies.length) {
      let range = creep.pos.getRangeTo(enemies[0].pos);
      if (range == 1) {
        creep.myRangedMassAttack();
      } else {
        creep.myRangedAttack(enemies[0]);
      }
    }
  }

  function doBoostAll() {
    if (creep.doBoost() == OK) {
      setState(STATE_RED_ALERT);
    }
    return;
  }

  function doCustom() {
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_RED_ALERT:
        doRedAlert();
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
        setState(STATE_RED_ALERT);
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