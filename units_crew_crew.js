'use strict';

let Elements = require('units_crew_elements');
let SpawnJob = require('util_spawnJob');
let Unit = require('units_unit');


const State = {
  COUNTDOWN: 'countdown',
  SPAWN: 'spawn',
  WORK: 'work',
  RENEW: 'renew',
  ABORT: 'abort',
  DONE: 'done'
}

const xWORKER_BODY = [WORK, CARRY, MOVE];
const WORKER_BODY = [
  WORK, WORK, WORK, WORK,
  CARRY, CARRY, CARRY, CARRY,
  CARRY, CARRY, CARRY, CARRY,
  CARRY, CARRY, CARRY, CARRY,
  MOVE, MOVE, MOVE, MOVE
];

const GUARD_BODY = [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
  MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];

const xHAULER_BODY = [CARRY, MOVE];
const HAULER_BODY = [
  CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
  CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
  MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
  MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
];

const xMINER_BODY = [WORK, MOVE];
const MINER_BODY = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE];

const NURSE_COST = 300;
const NURSE_BODY = [HEAL, MOVE];

const UPGRADER_COST = 450;
const UPGRADER_BODY = [WORK, WORK, WORK, CARRY, CARRY, CARRY];

const SORT_ORDER = {
  worker: 0,
  miner: 1,
  hauler: 2,
  upgrader: 3,
  guard: 4,
  nurse: 5
};

function sortedElements(id) {
  let elements = (Game.units[id] && Game.units[id].elements) || [];
  return _.sortBy(elements, c => SORT_ORDER[c.memory.subRole]);
}

function preSpawnUpdate(id) {
  if (!Game.units[id]) {
    Unit.initializeUnit(id);
  }
  let unit = Game.units[id];

  let myElements = sortedElements(id);
  unit.elements = myElements;
  let mem = Memory.crews[id];
  let myElementsBySubRole = _.groupBy(myElements, 'memory.subRole');
  let myWorker = myElementsBySubRole.worker && myElementsBySubRole.worker[0];
  unit.worker = myWorker;
  let myGuard = myElementsBySubRole.guard && myElementsBySubRole.guard[0];
  unit.guard = myGuard;
  let myHaulers = myElementsBySubRole.hauler || [];
  unit.haulers = myHaulers;
  let myMiners = myElementsBySubRole.miner || [];
  unit.miners = myMiners;
  let myNurse = myElementsBySubRole.nurse && myElementsBySubRole.nurse[0];
  unit.nurse = myNurse;
  let myUpgraders = myElementsBySubRole.upgrader || [];
  unit.upgraders = myUpgraders;
  
  mem.creeps = _.map(myElements, 'id');

  function logDebug(message) {
    if (Memory.crews[id].debug) {
      logError(message);
    }
  }

  function logError(message) {
    console.log(id + ': ' + message);
  }

  function setState(state) {
    mem.state = state;
    mem.subState = 0;
    repeat = true;
  }

  function doCountdown() {
    if (Memory.rooms[mem.targetRoom].safemodeEnd > Game.time && !mem.safemodeOk) {
      logError(`Canceling ${id}, targetRoom ${mem.targetRoom} in safemode.`);
      setState(State.ABORT);
      return;
    }

    if (mem.spawnTime > Game.time) {
      logDebug(`Counting down. ${mem.spawnTime - Game.time} ticks util spawn.`);
      return;
    }

    logDebug(`Clear to spawn. Spawning.`);
    setState(State.SPAWN);
  }

  function spawnElement(subRole, body, room) {
    let opts = {
      memory: {
        role: 'appendage',
        subRole: subRole,
        state: STATE_APPENDAGE,
        unit: id,
        workRoom: mem.targetRoom,
        renewMe: true
      }
    };

    if (SpawnJob.requestSpawn(
        [room],
        body,
        getUniqueCreepName('Appendage'),
        opts,
        SpawnJob.PRIORITY_UNIT) == OK) {
      logDebug(`Spawning Appendage.${subRole}`);
    } else {
      logError(`Failed to spawn Appendage.${subRole}`);
    }
  }

  function doSpawn() {
    unit.minimumTTL = 200;
    if (!myWorker) {
      spawnElement('worker', WORKER_BODY, mem.sourceRoom);
    }

    if (myHaulers.length < 2) {
      spawnElement('hauler', HAULER_BODY, mem.sourceRoom);
    }

    if (myWorker && (myHaulers.length == 2) && (myMiners.length < 2)) {
      spawnElement('miner', MINER_BODY, mem.sourceRoom);
    }

    if (myHaulers.length == 2 && !myGuard) {
      spawnElement('guard', GUARD_BODY, mem.sourceRoom);
    }

    // Go to Work mode if everyone is spawning.
    if (myWorker && myHaulers.length == 2 && myMiners.length == 2 && myGuard) {
      setState(State.WORK);
      return;
    }
  }

  function makeNurses() {
    let workRoom = Game.rooms[mem.targetRoom];
    if (!workRoom || workRoom.energyCapacityAvailable < NURSE_COST) {
      return;
    }

    if (workRoom.woundedCreeps.length && !workRoom.npcs.length && !myNurse) {
      spawnElement('nurse', NURSE_BODY, workRoom.name);
    }
  }

  function chooseSpawnDirection(spawn) {
    let opens = spawn.pos.getAdjacentOpenTiles();
    let clears = _.filter(opens, p => !p.hasCreep() && p.isWalkable());
    let best = _.min(clears, p => p.getCartesianDistance(spawn.room.controller));
    return spawn.pos.getDirectionTo(best);
  }

  function makeUpgraders() {
    let workRoom = Game.rooms[mem.targetRoom];
    if (!workRoom) {
      return;
    }

    if (workRoom.memory.noUpgraders) {
      return;
    }

    let spawn = workRoom.spawns[0];

    if (!spawn) {
      return;
    }

    if (spawn.spawning) {
      let spawningCreep = Game.creeps[spawn.spawning.name];
      if (spawningCreep && spawningCreep.memory.subRole == 'upgrader') {
        spawn.spawning.setDirections([chooseSpawnDirection(spawn)]);
      }
    }

    if (spawn.pos.getRangeTo(spawn.room.controller) > 2) {
      return;
    }

    if (workRoom.energyCapacityAvailable < UPGRADER_COST) {
      return;
    }

    if (workRoom.controller.level > 2) {
      return;
    }

    if (myUpgraders.length < 2) {
      spawnElement('upgrader', UPGRADER_BODY, mem.targetRoom);
    }
  }

  function preUpdateCreeps() {
    let targetRoom = Game.rooms[mem.targetRoom];
    let sources = [];
    if (targetRoom) {
      sources = targetRoom.find(FIND_SOURCES);
    }

    let myElements = _.map(mem.creeps, Game.getObjectById);
    for (let i = 0; i < myElements.length; i++) {
      let creep = myElements[i];
      creep.memory.workRoom = mem.targetRoom;
    }

    for (let index in unit.miners) {
      unit.miners[index].source = sources[index];
    }

    for (let index in unit.haulers) {
      unit.haulers[index].source = sources[index];
      unit.haulers[index].miner = unit.miners[index];
      delete unit.haulers[index].memory.myMiner;
    }
}

  function doWork() {
    unit.minimumTTL = 400;

    if (!myElements.length) {
      setState(State.DONE);
    }

    preUpdateCreeps();

    makeNurses();

    makeUpgraders();
  }

  function doRenew() {
    unit.minimumTTL = 1450;
    preUpdateCreeps();

    if (mem.nextRoom) {
      let ttl = _.min(unit.elements, 'ticksToLive').ticksToLive;
      if (ttl > 1450) {
        setState(State.WORK);
        mem.targetRoom = mem.nextRoom;
        delete mem.nextRoom;
      }
    }
  }

  function doAbort() {
    if (myElements.length) {
      _.forEach(myElements, c => c.memory.state = STATE_DIE);
    } else {
      setState(State.DONE);
    }
  }

  function doDone() {
    mem.delete = true;
  }

  let repeat;
  let maxRepeat = 4;
  let stateLog = [];

  do {
    repeat = false;
    maxRepeat--;

    switch (mem.state) {
      case State.COUNTDOWN:
        doCountdown();
        break;
      case State.SPAWN:
        doSpawn();
        break;
      case State.WORK:
        doWork();
        break;
      case State.RENEW:
        doRenew();
        break;
      case State.ABORT:
        doAbort();
        break;
      case State.DONE:
        doDone();
        break;
      default:
        logError(`invalid state ${mem.state}`);
        break;
    }
    stateLog.push({
      state: mem.state,
      subState: mem.subState
    });
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log(`Warning: Creep ${id} maxLooped`);
    stateLog.forEach(function(element) {
      console.log(`state: ${element.state} substate: ${element.subState}`);
    });
  }
}

function postSpawnUpdate(id) {
  let myElements = _.map(Memory.crews[id].creeps, Game.getObjectById);
  for (let i = 0; i < myElements.length; i++) {
    let creep = myElements[i];
    if (creep.ticksToLive) {
      try {
        Elements.update(creep);
      } catch (err) {
        console.log(`${id} Crew error updating creep ${creep.name}: ${err}`);
      }
    }
  }
}

module.exports = {
  State,
  preSpawnUpdate,
  postSpawnUpdate,
}