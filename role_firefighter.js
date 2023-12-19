'use strict';

let SpawnJob = require('util_spawnJob');


const STATE_INIT = 4;
const STATE_IDLE = 1;
const STATE_RESPONDING = 2;
const STATE_CLEARING = 3;

function currentModel(energyBudget) {
  if (energyBudget >= 3700) {
    return 7;
  }
  if (energyBudget >= 1800) {
    return 5;
  }
  if (energyBudget >= 1300) {
    return 4;
  }

  return;
}

function getBody(model) {
  switch (model) {
    case 99: // test
      return [RANGED_ATTACK, MOVE, MOVE, HEAL];
    case 8: // Anti-DEADFEED.
			return [MOVE, MOVE, MOVE, MOVE, MOVE,
					MOVE, MOVE, MOVE, MOVE, MOVE,
					MOVE, MOVE, MOVE, MOVE, MOVE,
					MOVE, MOVE, MOVE, MOVE, MOVE,
					MOVE, MOVE, MOVE, MOVE, MOVE,
			
					RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
					RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
					RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
					RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
					RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
					
					HEAL, HEAL, HEAL, HEAL, HEAL];
    case 7: // Medium-sized model (RCL7+)
      return [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
              MOVE, MOVE, MOVE, MOVE, MOVE,
              RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              MOVE,
              HEAL, HEAL, HEAL, HEAL, HEAL];
    case 5: // RCL5 variant
      return [RANGED_ATTACK,
              MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
              RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
              MOVE,
              HEAL, HEAL];
    case 4: // RCL4 variant
      return [RANGED_ATTACK,
              MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
              RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
              HEAL];
    case 2: // Medium-sized model (RCL7+)
      return [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
              MOVE, MOVE, MOVE, MOVE, MOVE,
              RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              MOVE,
              HEAL, HEAL, HEAL, HEAL, HEAL];
    case 1: // heavy skirmisher
      return [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
              MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
              MOVE, MOVE, MOVE, MOVE,
              RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
              RANGED_ATTACK,RANGED_ATTACK,
              MOVE,
              HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    default:
      console.log('Firefighter.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model, workRoom) {
  return {
      memory: {
          role: 'firefighter',
          model: model,
          state: STATE_INIT,
          subState: 0,
          noRenew: true,
          workRoom: workRoom,
          noReport: true,
        }
  };
}

function getNewName() {
  return getUniqueCreepName('Firefighter');
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

  let home = Game.rooms[creep.memory.workRoom];
  if (!home) {
    creep.logError(`I don't have a workRoom.`);
    return;
  }

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, _.merge({
        ignoreRoads: (creep.hits == creep.hitsMax),
    }, options));
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function hasBoostedHostiles(roomName) {
    let room = Game.rooms[roomName];
    return room && _.filter(room.hostileCreeps, 'boosted').length > 0;
  }

  function doIdle() {
    // If there's harassers somewhere, respond.
    let roomsWithHarassers = _.filter(_.keys(home.memory.mineHarassers), key => home.memory.mineHarassers[key] > 0);
    let roomsWithBoostedEnemies = _.filter(roomsWithHarassers, r => hasBoostedHostiles(r));
    let responseRooms = _.difference(roomsWithHarassers, roomsWithBoostedEnemies);
    if (responseRooms.length) {
      let responseRoom = responseRooms[0];
      creep.logError(`Responding to harasser at ${responseRoom}`);
      creep.memory.respondRoom = responseRoom;
      delete creep.memory.killMe;
      setState(STATE_RESPONDING);
      return;
    }

    // If there's invaders somewhere, respond.
    let roomWithInvader = _.findKey(home.memory.mineInvaders);
    if (roomWithInvader) {
      creep.logDebug(`Responding to invader at ${roomWithInvader}`);
      creep.memory.respondRoom = roomWithInvader;
      delete creep.memory.killMe;
      setState(STATE_RESPONDING);
      return;
    }

    // If I'm not in my home base, go there.
    if (creep.pos.roomName != home.name) {
      myTravelTo(home.controller);
      return;
    }

    // If I'm on an exterior tile, move toward the base.
    if (creep.naked && creep.room.spawns.length) {
      let target = creep.pos.findClosestByPath(creep.room.spawns);
      if (creep.pos.isNearTo(target)) {
        creep.doDie();
        return;
      }

      myTravelTo(target, {range:1})
      return;
    }

    // If I'm blocking someone, move to accommodate them.
    let blocked = creep.pos.blockedCreep();

    if (blocked) {
      creep.logDebug('unblocking');
      myTravelTo(blocked, {range:0});
      return;
    }

    // If I'm a heavy, don't die. I'll probably be needed again.
    if (creep.memory.model == 8) {
      return;
    }

    // Try to die, but stay alert for calls before while you do it.
    creep.doDie();
  }

  function doResponding() {
    // If my respondRoom is no longer under attack, idle.
    if (home.memory.mineInvaders[creep.memory.respondRoom] == 0 &&
        home.memory.mineHarassers[creep.memory.respondRoom] == 0) {
      delete creep.memory.respondRoom;
      setState(STATE_IDLE);
      return;
    }

    // If I've reached my response room, clear.
    if (creep.pos.roomName == creep.memory.respondRoom && !creep.pos.onEdge) {
      setState(STATE_CLEARING);
      return;
    }

    // Go to my target room.
    let respondRoomMemory = Memory.rooms[creep.memory.respondRoom];
    let targetPos;
    if (respondRoomMemory && respondRoomMemory.lastKnownInvaderPosition) {
      targetPos = new RoomPosition(
          respondRoomMemory.lastKnownInvaderPosition.x,
          respondRoomMemory.lastKnownInvaderPosition.y,
          creep.memory.respondRoom);
    } else {
      targetPos = roomControllerPos(creep.memory.respondRoom);
    }

    myTravelTo(targetPos, {range:1});
  }

  function doClearingShoot() {
    let hostilesInRange = creep.pos.findInRange(creep.room.hostileCreeps, 3);

    if (hostilesInRange.length == 0) {
      return;
    }

    let hostilesInTouchRange = creep.pos.findInRange(hostilesInRange, 1);

    if (hostilesInTouchRange.length) {
      creep.rangedMassAttack();
      return;
    }

    // Shoot anything I can definitely kill.
    let canKill = _.filter(hostilesInRange, c => c.hits + c.maxHeal <= creep.shootPower)[0];
    if (canKill) {
      creep.myRangedAttack(canKill);
      return;
    }

    // Shoot the healer with the fewest hits.
    let healersInRange = _.filter(hostilesInRange, 'healPower');
    if (healersInRange.length) {
      let weakest = _.min(healersInRange, 'hits');
      creep.myRangedAttack(weakest);
      return;
    }

    // Shoot the enemy with the fewest hits.
    let weakest = _.min(hostilesInRange, 'hits');
    creep.myRangedAttack(weakest);
    return;
  }

  function doClearingHeal() {
    if (creep.hits < creep.hitsMax || creep.maxDamage) {
      creep.myHeal(creep);
      return;
    }

    let nearest = creep.pos.findClosestByRange(creep.room.woundedCreeps);
    let range = creep.pos.getRangeTo(nearest);
    if (range == 1) {
      creep.myHeal(nearest);
    } else if (range <= 3 && !creep.isShooting) {
      creep.myRangedHeal(nearest);
    }
  }

  function doClearingMove() {
    // Maintain separation from hitters.
    let hitters = _.filter(creep.room.hostileCreeps, 'attackPower');
    let nearHitters = creep.pos.findInRange(hitters, 3);

    if (nearHitters.length) {
      // Move away.
      let result = PathFinder.search(
          creep.pos,
          _.map(nearHitters, function (c) {return {pos: c.pos, range: 3}}),
          {flee: true, maxRooms: 1, roomCallback: blockExitsCallback});
      let pos = result.path[0];
      creep.move(creep.pos.getDirectionTo(pos));
      return;
    }

    // Close with the nearest npc.
    let target = creep.pos.findClosestByPath(creep.room.hostileCreeps);
    if (target) {
      myTravelTo(target, {range: 1, maxRooms: 1, roomCallback: blockExitsCallback});
      return;
    }

    // Close with the nearest damaged friendly.
    target = creep.pos.findClosestByPath(creep.room.woundedCreeps);
    if (target) {
      myTravelTo(target, {range: 1, maxRooms: 1, roomCallback: blockExitsCallback});
      return;
    }

    // Just sit tight if there's wounded we can't get to. (Rare, but it can happen.)
    if (creep.room.woundedCreeps.length) {
      return;
    }

    // This really shouldn't happen. This function shouldn't be called unless there are
    // hostile npcs and/or wounded friendlies.
    creep.logError(`Unreachable code reached in firefighter.js at ` + creep.pos.link);
  }

  function doClearing() {
    // If my respondRoom is no longer under attack, and everyone's fixed, idle.
    if (home.memory.mineInvaders[creep.memory.respondRoom] == 0 &&
        home.memory.mineHarassers[creep.memory.respondRoom] == 0 &&
        !creep.room.woundedCreeps.length) {
      delete creep.memory.respondRoom;
      setState(STATE_IDLE);
      return;
    }

    // If I've left my respondRoom, return to it.
    if (creep.pos.roomName != creep.memory.respondRoom) {
      setState(STATE_RESPONDING);
      return;
    }

    doClearingShoot();

    doClearingHeal();

    doClearingMove();
    }

    function doInit() {
      creep.notifyWhenAttacked(false);
      setState(STATE_IDLE);
    }
    
    function doCustom() {
    }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_IDLE:
        doIdle();
        break;
      case STATE_RESPONDING:
        doResponding();
        break;
      case STATE_CLEARING:
        doClearing();
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
  currentModel,
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestSpawn,
  run
};