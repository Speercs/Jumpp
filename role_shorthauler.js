'use strict';

let SpawnJob = require('util_spawnJob');


const STATE_INIT = 1;
const STATE_OUTBOUND = 2;
const STATE_PICKUP = 3;
const STATE_DELIVER = 4;

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
        role: 'shorthauler',
        model: model,
        idleTicks: 0,
        state: STATE_INIT,
        subState: 0,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Shorthauler');
}

function requestSpawn(rooms, model, priority, target, workRoom) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.target = target;
  opts.memory.workRoom = workRoom;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, options);
  }

  function setState(state, message) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    if (message) {
      creep.memory._stateMessage = message;
    }
    repeat = true;
  }
  
  function doOutbound() {
    let containerObj = Game.getObjectById(creep.memory._containerId);
    if (!containerObj) {
      setState(STATE_DIE, 'no container');
      return;
    }
  
    if (creep.pos.isNearTo(containerObj)) {
      // We've arrived.
      creep.memory._outboundTime = Game.time - creep.memory._outboundStartTime;
      delete creep.memory._outboundStartTime;
      setState(STATE_PICKUP, 'doOutbound arrived');
      return;
    }

    myTravelTo(containerObj, {range:1});
  }

  function doPickup() {
    // Come home if you're full.
    if (creep.isFull) {
      creep.logDebug('full--returning');
      setState(STATE_DELIVER, 'doPickup full');
      creep.memory._inboundStartTime = Game.time;
      return;
    }
    
    let containerObj = Game.getObjectById(creep.memory._containerId);
    if (!containerObj) {
      creep.logError(`Mineral hauler has no container.`);
      setState(STATE_DIE);
      return;
    }

    // Come home if you're short on time and the container is empty.
    let inAHurry = creep.ticksToLive < (creep.memory._inboundTime + 20);

    if (inAHurry && containerObj.store.getUsedCapacity() == 0) {
      creep.logDebug('out of time--returning');
      setState(STATE_DELIVER, 'doPickup hurry');
      creep.memory._inboundStartTime = Game.time;
      return;
    }

    // Come home if the container is empty and there's no more mineral to be mined.
    let targetObj = Game.getObjectById(creep.memory.target);
    if (!targetObj.mineralAmount && !containerObj.store.getUsedCapacity()) {
      if (creep.isEmpty) {
        creep.logDebug('Site is exhausted. Shutting down.');
        setState(STATE_DIE, 'doPickup exhausted');
      } else {
        creep.logDebug('Site is exhausted. Returning.');
        setState(STATE_DELIVER, 'doPickup exhausted');
      }
      return;
    }

    // Load from container if it's got enough to fill us.
    if (containerObj.store.getUsedCapacity() >= creep.store.getFreeCapacity()) {
      creep.logDebug('Loading to full.');
      // use leastCargo because we want to pull the energy first if a small amount is present.
      // If we use mainCargo(), we'll nibble at the energy, spending more intents to eventually
      // clear it.
      creep.withdraw(containerObj, containerObj.leastCargo());
      return;
    }

    // Load from container if we're short on time and it has stuff.
    if (inAHurry && containerObj.store.getUsedCapacity()) {
      creep.logDebug('Loading in a hurry.');
      creep.withdraw(containerObj, containerObj.mainCargo());
      return;
    }

    // Load from container if the mineral site is dry and the container has stuff.
    if (!targetObj.mineralAmount && containerObj.store.getUsedCapacity()) {
      creep.logDebug('Loading container at exhausted mine.');
      creep.withdraw(containerObj, containerObj.mainCargo());
      return;
    }
  }
  
  function doDeliver() {
    if (creep.store.getUsedCapacity() == 0) {
      // Don't go if the container and mineral are empty.
      let containerObj = Game.getObjectById(creep.memory._containerId);
      let targetObj = Game.getObjectById(creep.memory.target);
      if (!containerObj.store.getUsedCapacity() && !targetObj.mineralAmount) {
        setState(STATE_DIE);
        return;
      }

      // Don't go unless you can make it there and back.  Use the last
      // recorded time, and add a smallish safety margin. Don't need a
      // large one because the costs of a near-miss are small.
      let minTTL = (creep.memory._outboundTime || 0) + (creep.memory._inboundTime || 0) + 20;
      let likelyLastTrip = 2 * minTTL;
      if (creep.ticksToLive < minTTL) {
        // Mineral haulers can recycle. They dump very near to spawns.
        setState(STATE_DIE);
        return;
      } else {
        // Set lastTrip if we're probably on our last trip. This signals the spawners to replace us.
        if (creep.ticksToLive < likelyLastTrip) {
          creep.memory.lastTrip = true;
        }
        creep.memory._outboundStartTime = Game.time;
        setState(STATE_OUTBOUND, 'doDeliver enoughTTL');
      }
      return;
    }

    if (creep.memory.subState == 0) {
      // choose a transfer target: Nearer of storage and terminal.
      let nearest = creep.pos.findClosestByPath(_.compact([creep.storage, creep.room.activeTerminal]));

      if (nearest) {
        creep.memory._transferTargetId = nearest.id;
        creep.memory.subState = 1;
      } else {
        creep.logError(`I can't find a place to dump minerals.`);
        return;
      }
    }
  
    // deliver to transfer target.
    const transferTargetObj = Game.getObjectById(creep.memory._transferTargetId);
    let transferResult = creep.myTransfer(transferTargetObj, creep.mainCargo());
    if (transferResult == ERR_NOT_IN_RANGE) {
      myTravelTo(transferTargetObj, {range:1});
    } else if (transferResult == OK && creep.memory._inboundStartTime) {
      creep.memory._inboundTime = Game.time - creep.memory._inboundStartTime;
      delete creep.memory._inboundStartTime;
    }
  }

  function doInit() {
    creep.memory._containerId = creep.room.memory.digsites[creep.memory.target].container;
    setState(STATE_OUTBOUND);
  }

  do {
    repeat = false;
    maxRepeat--;
    
    switch (creep.memory.state) {
      case STATE_PICKUP:
        doPickup();
        break;
      case STATE_OUTBOUND:
        doOutbound();
        break;
      case STATE_DELIVER:
        doDeliver();
        break;
      case STATE_DIE:
        creep.doUnblock() || creep.doDie();
        break;
      case STATE_INIT:
        doInit();
        break;
      default:
        let message = 'state was ' + creep.memory.state;
        setState(STATE_DELIVER, message);
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
  run
};