'use strict';

let Nav = require('util_nav');
let Nurse = require('role_nurse');
let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');


const STATE_DEPLOY = 1;
const STATE_RESERVE = 2;
const STATE_BOOST_ALL = 3;
const STATE_STOMP = 4;
const STATE_DEPLOY_SAFEMODE = 5;
const STATE_REFRESH_SAFEMODE = 6;
const STATE_HALT = 7;

function currentModel(energyBudget) {
  return Math.max(0,Math.min(8, Math.floor(energyBudget / 650)));
}

function getBody(model) {
  if (model == 24) {
    return [TOUGH, TOUGH, TOUGH, TOUGH,
        HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE,
        CLAIM];
  }

  if (model == 25) {
    return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, TOUGH, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        CLAIM];
  }

  // Speical swampwalking safemode refresher model
  if (model == 30) {
      return [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM];
  }

  let body = [];
  for (let i=0; i < model; i++) {
      body.push(CLAIM);
      body.push(MOVE);
  }
  return body;
}

function getDefaultCreateOpts(model) {
  return {
      memory: {
          role: 'claimer',
          model: model,
          state: STATE_BOOST_ALL,
          suppressNotify: true,
      }
  };
}

function getNewName() {
  return getUniqueCreepName('Claimer');
}

function requestSpawn(rooms, model, flag, priority, workRoom, additionalMem) {
    let name = getNewName();
    let opts = getDefaultCreateOpts(model);
    let body = getBody(model);
    if (flag) {
      opts.memory.flagName = flag.name;
      opts.memory.workRoom = flag.pos.roomName;
    } else {
      opts.memory.workRoom = workRoom;
      if (Memory.rooms[workRoom] && Memory.rooms[workRoom].claimerWaypointPrefix) {
        opts.memory.waypointPrefix = Memory.rooms[workRoom].claimerWaypointPrefix;
      }
    }
    if (workRoom && Memory.rooms[workRoom] && Memory.rooms[workRoom].claimerNurseModel) {
      opts.memory.holdSpawn = true;
    }
    if (additionalMem) {
      _.merge(opts.memory, additionalMem);
    }
    return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function getNurseModel(creep) {
  return (creep.memory.workRoom &&
      Memory.rooms[creep.memory.workRoom] &&
      Memory.rooms[creep.memory.workRoom].claimerNurseModel) || undefined;
}

function runSpawning(creep) {
  if (!getNurseModel(creep)) return;

  if (!creep.memory.nurse && creep.memory._lastSpawn) {
    creep.logError('Found my spawning nurse');
    creep.memory.nurse = creep.memory._lastSpawn.name;
  }

  let myNurse = Game.creeps[creep.memory.nurse];

  if (creep.memory.holdSpawn && myNurse) {
    let mySpawn = Game.spawns[creep.memory.spawnedBy];
    let herSpawn = Game.spawns[myNurse.memory.spawnedBy];

    let meReady = mySpawn.spawning && mySpawn.spawning.remainingTime == 0;
    let nurseReady = !myNurse.spawning || (herSpawn.spawning && herSpawn.spawning.remainingTime);

    if (meReady && nurseReady) {
      creep.room.logError(`Claimer and nurse pawns are done. Releasing holds.`);
      delete creep.memory.holdSpawn;
      delete myNurse.memory.holdSpawn;
    }
  }
}

function preUpdate(creep) {
  if (creep.spawning && getNurseModel(creep) && creep.id && !creep.memory._lastSpawn) {
    let rooms = [creep.room.name];
    let model = getNurseModel(creep);
    let priority = SpawnJob.PRIORITY_HIGH;
    Nurse.requestSpawnCreep(rooms, model, creep, priority);
  }
}

function run(creep) {
  let repeat;
  let maxRepeat = 4;

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    creep.memory._stateTime = Game.time;
    repeat = true;
  }

  function doBoostAll() {
    creep.checkSuppressNotify();

    if (creep.doBoost() == OK) {
      setState(STATE_WAYPOINT);
    }
    return;
  }

  function myTravelTo(target, options = {}) {
    if (creep.memory.model == 30) {
      options.offRoad = true;
    }
    creep.travelTo2(target, options);
  }

  function shouldWaitForNurse(creep) {
    let myNurse = Game.creeps[creep.memory.nurse];
    if (!myNurse) return false;

    if (creep.pos.onEdge) return false;
    if (creep.pos.nearEdge && myNurse.room != creep.room) return false;
    if (creep.pos.getRangeTo(myNurse.pos) > 1) {
      // I've got a nurse and I'm too far from it. Halt unless I'm in the room
      // where I spwawned and not near the edge.
      let mySpawn = Game.spawns[creep.memory.spawnedBy];
      let homeRoom = mySpawn && mySpawn.room || undefined;
      if (creep.room != homeRoom || creep.pos.nearEdge) {
        creep.logError('Waiting for nurse');
        return true;
      }
    }

    if (creep.pos.isNearTo(myNurse.pos) && myNurse.fatigue) {
      // I'm next to my nurse, but it's fatigued and won't be able to move. Don't move.
      creep.logError('Waiting for fatigued nurse');
      return true;
    }

  }

  function doDeploy() {
    if (creep.healPower) {
      creep.myHeal(creep);
    }

    if (creep.memory._lastRoomName != creep.pos.roomName) {
      creep.memory._lastRoomName = creep.pos.roomName;
      creep.memory._lastRoomTime = Game.time;
    }

    if (creep.memory._lastRoomTime < Game.time - 100) {
      creep.logError(`I'm most likely stuck trying to reach ${creep.memory.workRoom} from ` +
          `${creep.room.link}. Halting.`);
      setState(STATE_HALT);
      return;
    }

    if (creep.memory.workRoom.isHighway()) {
      if (creep.flag) {
        myTravelTo(creep.flag.pos, {range:0});
      } else {
        creep.logError(`I am confused. My workRoom is a highway, but I have no flag.`);
      }
      return;
    }

    if (shouldWaitForNurse(creep)) return;

    if (creep.room.name == creep.memory.workRoom) {
      setState(STATE_RESERVE);
    } else {
      myTravelTo(creep.workRoomControllerPos,
          {range: 1, allowSK: true, roomCallback: RoomCallback.avoidKeepersCallback});
    }
  }

  function doReserve() {
    if (shouldWaitForNurse(creep)) return;

    if (!creep.pos.isNearTo(creep.workRoomControllerPos)) {
      myTravelTo(creep.workRoomControllerPos, {range: 1, allowSK: true, roomCallback: RoomCallback.avoidKeepersCallback});
    }

    if (creep.memory.workRoom == creep.pos.roomName &&
        creep.room.controller &&
        creep.pos.isNearTo(creep.room.controller.pos) &&
        shouldRefreshSafemodeCooldown(creep.room) &&
        creep.ticksToLive > 100) {
      let result = creep.claimController(creep.room.controller);
      if (result == 0) {
        // Enable the room to self-unclaim.
        creep.room.memory._refreshSafemodeClaimTimestamp = Game.time;
      } else {
        creep.logError(`Failed to claim room: ${result}`);
      }
    }

    if (creep.memory.workRoom == creep.pos.roomName &&
      creep.room.controller &&
      creep.room.controller.upgradeBlocked > creep.ticksToLive) {
      if (stompableSite()) {
        setState(STATE_STOMP);
        return;
      }
      if (creep.ticksToLive > 250) {
        setState(STATE_DIE);
        return;
      }
      creep.say('💀');
      creep.suicide();
      return;
    }

    let result;
    if (creep.room.controller &&
        creep.room.controller.reservation &&
        creep.room.controller.reservation.username != creep.owner.username &&
        !isFriendly(creep.room.controller.reservation.username)) {
      result = creep.attackController(creep.room.controller);
      creep.logDebug('attacking:' + result);
    } else if (creep.room.controller &&
        creep.room.controller.owner &&
        creep.room.controller.owner.username != creep.owner.username &&
        !isFriendly(creep.room.controller.owner.username)) {
      result = creep.attackController(creep.room.controller);
      creep.logDebug('attacking:' + result);
      if (result == OK && creep.room.memory.nextClaim) {
        creep.memory.workRoom = creep.room.memory.nextClaim;
        creep.say('⚔️');
      } else if (result == ERR_TIRED) {
        creep.say('🚬');
      }
    } else if (creep.room.memory.claimController || creep.room.memory.role == 'outpost') {
      result = creep.claimController(creep.room.controller);
      creep.logDebug('claiming: ' + result);
      if (result == OK) {
          creep.say('yoink!', true);
      }
    } else {
      if (creep.room.controller &&
          creep.room.controller.reservation &&
          creep.room.controller.reservation.ticksToEnd > CONTROLLER_RESERVE_MAX - 50) {
        creep.logError(creep.pos.link + ' Claimer too big for the room.');
      }

      result = creep.reserveController(creep.room.controller);
      creep.logDebug('reserving: ' + result);
      if (result == OK && creep.room.memory.nextClaim) {
        creep.memory.workRoom = creep.room.memory.nextClaim;
      }
    }

    if (result != OK) {
      creep.myHeal(creep);
    }
    creep.mySignController();
  }

  function stompableSite() {
    let site = creep.room.find(FIND_HOSTILE_CONSTRUCTION_SITES,
      {filter: s => s.structureType == STRUCTURE_SPAWN && s.progress > 1000})[0];

    return site;
  }

  function doDeploySafemode() {
    if (creep.memory.workRoom == creep.pos.roomName && !creep.pos.onEdge) {
      setState(STATE_REFRESH_SAFEMODE);
      return;
    }

    if (Game.time > creep.memory._stateTime + 300) {
      creep.logError(`I've been in STATE_DEPLOY_SAFEMODE for over 300 ticks. Halting.`);
      let targetRoomMem = Memory.rooms[creep.memory.workRoom];
      if (targetRoomMem) {
        creep.logError(`Also, setting noSafemodeRefresh on the target room (${creep.memory.workRoom})`);
        targetRoomMem.noSafemodeRefresh = Game.time;
      }
      setState(STATE_HALT);
      return;
    }

    if (!creep.pos.isNearTo(creep.workRoomControllerPos)) {
      myTravelTo(
          creep.workRoomControllerPos,
          {allowSK: true, roomCallback: RoomCallback.avoidKeepersCallback}
      );
      creep.say(creep.memory.workRoom);
      return;
    }

    creep.logError(`I'm a safemode claimer and have reached an unexpected state.`);
  }

  function doRefreshSafemode() {
    if (creep.pos.roomName != creep.memory.workRoom) {
      creep.logError(`I'm in STATE_REFRESH_SAFEMODE but not in my work room. This should never ` +
          `happen.`);
      setState(STATE_DEPLOY_SAFEMODE);
      repeat = false;
      return;
    }

    if (Game.time > creep.memory._stateTime + 99) {
      creep.logError(`I've been unable to claim the controller in ${creep.room.link}.` +
          ` I'm marking the room, giving up, and and moving on.`);
      creep.room.memory.noSafemodeRefresh = Game.time;
      maybeMoveOn();
      return;
    }

    if (creep.room.controller.reservation &&
        creep.room.controller.reservation.username != MY_USERNAME) {
      creep.logError(`I've been sent to a room that ${creep.room.controller.reservation.username}` +
        `has reserved. Moving on.`);
        maybeMoveOn();
        return;
    }

    if (!creep.pos.isNearTo(creep.workRoomControllerPos)) {
      myTravelTo(creep.workRoomControllerPos, {maxRooms:1});
      return;
    }

    let controller = creep.room.controller;
    if (!controller) {
      creep.logError(`I went to my workRoomControllerPos, and having reached it I find that this` +
      ` room has no controller. Halting.`);
      setState(STATE_HALT);
      return;
    }

    if (controller.level > 1) {
      creep.logError(`I've been sent to a room with too high a controller level ` +
          `(${controller.level}). Halting.`);
      setState(STATE_HALT);
      return;
    }

    if (controller.owner && !creep.room.my) {
      creep.logError(`I've been sent to a room that another player (${controller.owner.username})` +
          ` has claimed. Halting.`);
      setState(STATE_HALT);
      return;
    }

    if (shouldRefreshSafemodeCooldown(creep.room)) {
      creep.mySignController();
      let result = creep.claimController(creep.room.controller);
      if (result == OK) {
        // Enable the room to self-unclaim.
        creep.room.memory._refreshSafemodeClaimTimestamp = Game.time;

        // Maybe move on.
        maybeMoveOn();
        return;
      } else {
        creep.logError(`Failed to claim room I expected to be able to claim: ${result}`);
        return;
      }
    }

    // I'm in my work room. There's no obvious error. But the room doesn't need refresh? Just move on, I guess.
    maybeMoveOn();
  }

  function maybeMoveOn() {
    if (creep.memory.subRole != 'safemode') {
      // I'm not a safemode guy. Just go back to reserve
      setState(STATE_RESERVE);
      return;
    }

    if (creep.memory.safemodeRooms.length == 0) {
      creep.suicide();
      return;
    }

    let maxCost = Math.min(200, creep.ticksToLive);
    let nextControllerPos = Nav.findNearestController(creep.pos, creep.memory.safemodeRooms, maxCost);
    if (!nextControllerPos) {
      creep.logDebug(`Can't find controller from among [` +
          `${JSON.stringify(creep.memory.safemodeRooms)}] within ${maxCost} steps. Suiciding.`);
      creep.suicide();
      return;
    }

    let nextWorkRoom = nextControllerPos.roomName;
    creep.logDebug(`Done at ${creep.memory.workRoom}, moving on to ${nextWorkRoom}`);

    creep.memory.workRoom = nextWorkRoom;
    _.pull(creep.memory.safemodeRooms, nextWorkRoom);

    setState(STATE_DEPLOY_SAFEMODE);
  }

  function doStomp() {
    let site = stompableSite();
    if (!site) {
      setState(STATE_RESERVE);
      return;
    }

    myTravelTo(site.pos, {range:0});
  }

  function doHalt() {
    if (Game.time % 10 == 0) {
      creep.logError('Halted');
    }
  }
  
  function doCustom() {
  }
  
  do {
    repeat = false;

    switch (creep.memory.state) {
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_RESERVE:
        doReserve();
        break;
      case STATE_STOMP:
        doStomp();
        break;
      case STATE_DEPLOY_SAFEMODE:
        doDeploySafemode();
        return;
      case STATE_REFRESH_SAFEMODE:
        doRefreshSafemode();
        break;
      case STATE_HALT:
        doHalt();
        break;
      case STATE_AMNESIAC:
        setState(STATE_DEPLOY);
        break;
      case STATE_WAYPOINT:
        if (shouldWaitForNurse(creep)) return;
        creep.doWaypoint(creep.memory.subRole == 'safemode' ? STATE_DEPLOY_SAFEMODE : STATE_DEPLOY);
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
        setState(STATE_DEPLOY);
        break;
    }
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: ' + creep.name + ' maxLooped (' + creep.memory.state + ',' +
        creep.memory.subState + ')');
  }
}

module.exports = {
  currentModel,
  getBody,
  getDefaultCreateOpts,
  getNewName,
  preUpdate,
  requestSpawn,
  runSpawning,
  run,
};