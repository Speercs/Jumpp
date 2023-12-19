'use strict';

let EventLog = require('util_event_log');
let SpawnJob = require('util_spawnJob');


const STATE_INIT = 4;
const STATE_DEPLOY = 1;
const STATE_LURK = 2;
const STATE_CLAIM = 3;

function getBody(model) {
  return [MOVE];
}

function getDefaultCreateOpts(model, workRoom) {
  return {
      memory: {
          role: 'scout',
          model: model,
          state: STATE_INIT,
          subState: 0,
          noRenew: true,
          workRoom: workRoom,
        }
  };
}

function getNewName() {
  return getUniqueCreepName('Scout');
}

function requestSpawn(rooms, model, workRoom, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model, workRoom);
  let body = getBody(model);

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, _.merge({ignoreRoads: true}, options));
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function bigBanks() {
    return _.filter(creep.room.powerBanks, b => b.power >= 3000);
  }

  function moveToWorkRoom() {
    if (!creep.workRoom || creep.workRoom.name != creep.room.name) {
      myTravelTo(roomGuardPosition(creep.memory.workRoom), {preferHighway: true});
      return true;
    }
  }

  function switchToLurkMode() {
    if (creep.workRoom &&
        creep.workRoom.name == creep.room.name &&
        creep.workRoom.lurkPos) {
      setState(STATE_LURK);
      return true;
    }
  }
  
  function doDeploy() {
    moveToWorkRoom() || switchToLurkMode();
  }

  function switchToClaimMode() {
    let banks = bigBanks();

    if (!banks.length) {
      return;
    }

    let respondersBesidesMe = banks[0].pos.findInRange(
      creep.room.myCreeps,
      /* range = */ 3,
      {filter: c => c.name != creep.name}
    );

    if (respondersBesidesMe.length) {
      return;
    }

    setState(STATE_CLAIM);
    return true;
  }

  function moveToLurkPos() {
    if (creep.workRoom && creep.workRoom.name == creep.room.name) {
      myTravelTo(creep.room.lurkPos);
      return true;
    }

    if (creep.pos.onEdge) {
      return true;
    }
  }

  function doLurk() {
    switchToClaimMode() || moveToLurkPos() || moveToWorkRoom();
  }

  function doSpeak() {
    let index = (Game.time % 6) >> 1;
    let lines = [`minemine`, `so`, `greedy`];
    creep.say(lines[index], /* public = */ true);
  }

  function claimBank() {
    let banks = bigBanks();
    if (!banks.length) {
      return;
    }

    let respondersBesidesMe = banks[0].pos.findInRange(
      creep.room.myCreeps,
      /* range = */ 3,
      {filter: c => c.name != creep.name}
    );

    if (!respondersBesidesMe.length) {
      myTravelTo(banks[0], {range:3});
      doSpeak();
      return true;
    }
  }

  function switchToDeployMode() {
    setState(STATE_DEPLOY);
    return true;
  }

  function doClaim() {
    claimBank() || switchToLurkMode() || switchToDeployMode();
  }

  function doInit() {
    creep.notifyWhenAttacked(false);
    setState(STATE_DEPLOY);
  }

  function doCustom() {
  }

  if (creep.ticksToLive == 1) {
    creep.logError(`scout at ${creep.pos} dying, cpu cost=${creep.memory._lifetimeCpu}`);
  }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_LURK:
        doLurk();
        break;
      case STATE_CLAIM:
        doClaim();
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
        setState(STATE_IDLE);
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
  getDefaultCreateOpts,
  getNewName,
  requestSpawn,
  run
};