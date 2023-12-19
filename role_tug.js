'use strict';

let EventLog = require('util_event_log');
let SpawnJob = require('util_spawnJob');


const STATE_INIT = 2;
const STATE_WORK = 1;

function getBody(model) {
  switch (model) {
    case 20: // test
      return [MOVE];
    case 1:
      return _.fill(Array(50), MOVE);
    default:
      console.log('Tug.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'tug',
      model: model,
      state: STATE_INIT,
      subState: 0,
      holdSpawn: true,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Tug');
}

function requestSpawnCreep(rooms, model, creep, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);

  opts.requestingCreep = creep.id;

  opts.memory.workRoom = creep.memory.workRoom;
  opts.memory.subject = creep.id;

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  
  let subject = Game.getObjectById(creep.memory.subject);
  let destination = subject && subject.destination;
  let destPos = destination && destination.pos;

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  

  function tugSubject() {
    if (subject && creep.pos.isNearTo(subject) && subject.destination) {
      creep.pull(subject);
      subject.move(creep);
    }
  }

  function disengage() {
    if (subject && !subject.spawning && !subject.destination) {
      if (subject.memory.inFinalPosition) {
        setState(STATE_DIE);
        return;
      }
      if (creep.pos.isNearTo(subject)) {
        creep.move(subject.pos.getDirectionTo(creep));
      }
      return true;
    }
  }

  function compelTug() {
    if (!subject || creep.pos.getRangeTo(subject) != 2 || subject.spawning) {
      return;
    }

    let middleCreep = _.find(creep.room.myCreeps,
        c => c.pos.isNearTo(creep) &&
            c.pos.isNearTo(subject) &&
            !c.spawning &&
            !c.fatigue &&
            c.hasParts(MOVE) &&
            !['loader', 'crane'].includes(c.memory.role));

    if (!middleCreep) {
      return;
    }

    middleCreep.pull(subject);
    middleCreep.move(subject);
    middleCreep.say('yoink');
    middleCreep.forced = true;
    subject.move(middleCreep);
    return true;
  }

  function closeWithSubject() {
    if (subject && subject.spawning) {
      if (creep.room.baseType == 'bunker') {
        if (creep.pos.isNearTo(subject)) {
          return;
        }
        let stepDir = creep.room.bunkerCenter.getDirectionTo(subject);
        let waitPos = subject.pos.oneStep(stepDir);
        myTravelTo(waitPos, {range:0, offRoad: true});
        return true;
      } else {
        if (creep.pos.getRangeTo(subject) < 3) {
          return;
        }

        myTravelTo(subject, {range: 2, offRoad: true});
        return true;
      }
    }

    if (subject &&
        creep.room == subject.room &&
        !creep.pos.isNearTo(subject) &&
        !creep.pos.nearEdge) {
      myTravelTo(subject, {range: 1, offRoad: true});
      return true;
    }
  }

  function dropOnDestination() {
    if (subject &&
        subject.destination &&
        creep.pos.getRangeTo(destPos) <= subject.destination.range) {
      creep.move(subject);
      return true;
    }
  }

  function pullTowardDestination() {
    if (subject &&
        subject.destination &&
        destPos &&
        creep.pos.isNearTo(subject) &&
        !creep.pos.onEdge) {
      myTravelTo(destPos, {range: subject.destination.range, offRoad: true});
      return true;
    }
  }

  function doNothing() {
    if (subject &&
        subject.room != creep.room &&
        creep.pos.onEdge &&
        subject.pos.nearEdge &&
        !subject.pos.onEdge) {
      return true;
    }
  }

  function swap() {
    if (subject &&
        subject.room == creep.room &&
        creep.pos.onEdge &&
        subject.pos.nearEdge &&
        !subject.pos.onEdge) {
      creep.move(subject);
      return true;
    }
  }

  function moveAlone() {
    if (subject && subject.room != creep.room) {
      myTravelTo(destPos, {range: subject.destination.range, offRoad: true});
      return true;
    }
  }

  function doWork() {
    tugSubject();

    disengage() ||
        compelTug() ||
        closeWithSubject() ||
        dropOnDestination() ||
        pullTowardDestination() ||
        doNothing() ||
        swap() ||
        moveAlone() ||
        creep.doUnblock();
  }

  function doInit() {
    creep.notifyWhenAttacked(false);
    setState(STATE_WORK);
  }

  function doCustom() {
  }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_WORK:
        doWork();
        break;
      case STATE_AMNESIAC:
        setState(STATE_WORK);
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
  requestSpawnCreep,
  run
};