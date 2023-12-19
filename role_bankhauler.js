'use strict';

let Books = require('util_books');
let SpawnJob = require('util_spawnJob');

const STATE_INIT = 4;
const STATE_DEPLOY = 1;
const STATE_PICKUP = 2;
const STATE_DELIVER = 3;

function getBody(model) {
  let body = [];
  for (let i = 0; i < model * 2; i++) {
    body.push(CARRY);
  }
  for (let i = 0; i < model; i++) {
    body.push(MOVE);
  }
  return body;
}


function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'bankhauler',
      state: STATE_INIT,
      model: model,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Bankhauler');
}

function requestSpawn(rooms, model, workRoom, target, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = workRoom;
  opts.memory.target = target;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 4;

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function avoidHostiles() {
    let nearHostiles = creep.pos.findInRange(
        creep.room.hostileCreeps,
        /* range = */ 4,
        {filter:c => c.isFighter()});
      // Avoid hostiles.
      if (nearHostiles.length) {
        let enemies = _.map(nearHostiles, function(c) {return {pos: c.pos, range: 4}});
        if (enemies.length) {
          let path = PathFinder.search(creep.pos, enemies, {flee: true, maxRooms: 1});
          let pos = path.path[0];
          creep.move(creep.pos.getDirectionTo(pos));
          return true;
        }
      }
      return false;
  }

  function myDeliveryTerminal() {
    let bankMem = Memory.rooms[creep.memory.workRoom].powerBanks[creep.memory.target];
    if (bankMem) {
      return Game.getObjectById(bankMem.destination);
    }

    return Game.spawns[creep.memory.spawnedBy].room.terminal;
  }

  function doDeploy() {
    // Get near my bank.
    let bankMem = Memory.rooms[creep.memory.workRoom].powerBanks[creep.memory.target];
    let bankPos = new RoomPosition(
      bankMem.pos.x,
      bankMem.pos.y,
      bankMem.pos.roomName);

    if (avoidHostiles()) {
      return;
    }

    if (creep.pos.inRangeTo(bankPos, 3)) {
      setState(STATE_PICKUP);
    } else {
      myTravelTo(bankPos, {range: 3});
    }
  }

  function checkDeliverDistance() {
    let terminal = myDeliveryTerminal();
    if (!terminal) {
      return;
    }

    let crudeDistance = 50 + creep.pos.getGlobalRangeTo(terminal.pos);
    let likelyRange = creep.ticksToLive >> 1;

    if (crudeDistance > likelyRange) {
      creep.suicide();
    }
  }

  function doPickup() {
    // If I'm full, start delivering.
    if (creep.isFull) {
      setState(STATE_DELIVER);
      return;
    }

    // If the bank is still alive, wait.
    let powerBank = Game.getObjectById(creep.memory.target);
    if (powerBank) {
      checkDeliverDistance();
      return;
    }

    let piles = creep.room.find(FIND_DROPPED_RESOURCES, {
      filter: p => p.resourceType == RESOURCE_POWER
    });

    let ruins = creep.room.find(FIND_RUINS, {filter: r => r.store.power});

    // There is no bank. If there are no piles, go home.
    if (!piles.length && !ruins.length) {
      if (creep.isEmpty) {
        setState(STATE_DIE);
      } else {
        setState(STATE_DELIVER);
      }
      return;
    }

    // If I'm near any piles of power, pick up the largest.
    let largestNearPile = _.max(creep.pos.findInRange(piles, 1), 'amount');
    if (largestNearPile instanceof Resource) {
      creep.pickup(largestNearPile);
      return;
    }

    // If I'm near any ruins with power, loot.
    let largestNearRuin = _.max(creep.pos.findInRange(ruins, 1), 'store.power');
    if (largestNearRuin instanceof Ruin) {
      creep.withdraw(largestNearRuin, RESOURCE_POWER);
      return;
    }

    // Move toward the largest pile or ruin.
    let largestPile = _.max(piles, 'amount');
    let largestRuin = _.max(ruins, 'store.power');
    if (largestRuin instanceof Ruin) {
      myTravelTo(largestRuin, {range:1});
    } else if (largestPile instanceof Resource) {
      myTravelTo(largestPile, {range: 1});
    }
  }

  function reportPowerLoaded() {
    let workRoomMemory = Memory.rooms[creep.memory.workRoom];

    if (!workRoomMemory) {
      creep.logError(`I've got power but I can't figure out why.`);
      return;
    }

    if (!workRoomMemory.powerBanks || !workRoomMemory.powerBanks[creep.memory.target]) {
      creep.logError(`I've got power but my workRoom doesn't have a bank entry.`);
      return;
    }

    let bankMem = workRoomMemory.powerBanks[creep.memory.target];

    bankMem.powerLoaded = (bankMem.powerLoaded || 0) + creep.store[RESOURCE_POWER];
    creep.logDebug(`Reporting ${creep.store.power} power loaded from bank ` +
        `in ${creep.memory.workRoom}`);
    Books.logPower(creep.memory.workRoom, 'pickedUp', creep.store.power);
  }

  function doDeliver() {
    if (!creep.memory.subState) {
      reportPowerLoaded();
      creep.memory.subState = 1;
    }

    if (creep.isEmpty) {
      setState(STATE_DIE);
      return;
    }

    let terminal = myDeliveryTerminal();

    if (creep.pos.isNearTo(terminal)) {
      creep.myTransfer(terminal, RESOURCE_POWER);
    } else {
      myTravelTo(terminal, {range: 1})
    }
  }

  function doInit() {
    creep.notifyWhenAttacked(false);
    setState(STATE_DEPLOY);
    return;
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
      case STATE_PICKUP:
        doPickup();
        break;
      case STATE_DELIVER:
        doDeliver();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      case STATE_INIT:
        doInit();
        break;
      default:
        setState(STATE_DEPLOY);
        break;
    }
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped (' + creep.memory.state + ',' + creep.memory.subState + ')');
  }
}

module.exports = {
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestSpawn,
  run
};