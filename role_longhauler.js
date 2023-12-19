'use strict';

let Books = require('util_books');
let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');

const STATE_INIT = 7;

const STATE_OUTBOUND = 1;
const STATE_PICKUP = 2;
const STATE_DELIVER = 4;

const STATE_OUTBOUND_SK = 6;
const STATE_PICKUP_SK = 5;
const STATE_FETCH = 3;

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
      role: 'longhauler',
      model: model,
      idleTicks: 0,
      state: STATE_INIT,
      subState: 0,
      _lastEnergy: 0,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Longhauler');
}

function requestSpawn(rooms, model, priority, target, workRoomName) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.target = target;
  opts.memory.workRoom = workRoomName;
  let mem = Memory.rooms[workRoomName].digsites[target];
  if (mem && mem.diggerPosition) {
    opts.destination =
        new RoomPosition(mem.diggerPosition.x, mem.diggerPosition.y, workRoomName);
  }
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  let digsite;
  let digPosition;
  let digPositionObj;
  
  if (creep.memory.workRoom &&
      creep.memory.target &&
      Memory.rooms[creep.memory.workRoom].digsites) {
    digsite = Memory.rooms[creep.memory.workRoom].digsites[creep.memory.target];
    digPosition =
        new RoomPosition(digsite.diggerPosition.x, digsite.diggerPosition.y, creep.memory.workRoom);
    digPositionObj = {pos: digPosition};
  } else if (creep.memory.state != STATE_DIE) {
    creep.logError(`Work room is shut down. Dieing.`);
    setState(STATE_DIE);
    return;
  }

  let deltaE = creep.store.energy - creep.memory._lastEnergy;
  
  if (deltaE > 0) {
    Books.logEnergy(creep.memory.workRoom, 'pickedUp', deltaE);
  }
  
  if (deltaE < 0) {
    Books.logEnergy(creep.memory.workRoom, 'delivered', -deltaE);
  }
  
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
  
  /*
   * If the site is dangerous, move to safety.
   * Return true if we needed to move.
   */
  function moveToSafeSpot() {
    let sourceObj = Game.getObjectById(creep.memory.target);
    let myLair = sourceObj && sourceObj.lair;

    if (!myLair) return;
    if (!myLair.keeper && myLair.ticksToSpawn > 10) return;
 
    let path = PathFinder.search(
        creep.pos,
        {pos: (myLair.keeper || myLair).pos, range:5},
        {flee: true, maxRooms:1, roomCallback: RoomCallback.avoidMyCreepsCallback});
    myTravelTo(path.path[0], {range:0});
    return true;
  }

  function doOutbound() {
    // TODO: Figure out if we need to make a corresponding adjustment to the outbound times.
    if (Game.cpu.bucket < 5000 && creep.store.energy == 0 && !creep.pos.onEdge) {
      if (creep.room.baseType != 'bunker') return; 
    }

    // It's possible to become full on the outbound, by looting tombstones.
    // TODO: So we're totaling up the carried amount, every tick? That seems excessive. We know when
    // we've picked up energy. We could do the check on a successful pickup. Or maybe check the room
    // logs for pickups?
    if (creep.isFull) {
      setState(STATE_DELIVER, 'doOutbound full');
      return;
    }
      
    if (creep.pos.isNearTo(digPosition)) {
      // We've arrived.
      creep.memory._outboundTime = Game.time - creep.memory._outboundStartTime;
      setState(STATE_PICKUP, 'doOutbound arrived');
      return;
    }

    myTravelTo(digPositionObj, {range:1});

    // If you happen to pass near a pile or tombstone, loot it.
    let nearbyPiles = creep.pos.findInRange(
        FIND_DROPPED_RESOURCES,
        /* range = */ 1,
        {filter: p => p.resourceType == RESOURCE_ENERGY});
    if (nearbyPiles.length) {
        creep.pickup(nearbyPiles[0]);
    } else {
      let nearbyStones = creep.pos.findInRange(
          FIND_TOMBSTONES,
          /* range = */ 1,
          {filter: s => s.store.energy});
      if (nearbyStones.length) {
        creep.withdraw(nearbyStones[0], RESOURCE_ENERGY);
      }
    }
  }

  function doOutboundSk() {
    // TODO: Figure out if we need to make a corresponding adjustment to the outbound times.
    if (Game.cpu.bucket < 5000 && creep.store.energy == 0 && !creep.pos.onEdge) {
      if (creep.room.baseType != 'bunker') return; 
    }

    // It's possible to become full on the outbound, by looting tombstones.
    // TODO: So we're totaling up the carried amount, every tick? That seems excessive. We know when
    // we've picked up energy. We could do the check on a successful pickup. Or maybe check the room
    // logs for pickups?
    if (creep.isFull) {
      setState(STATE_DELIVER, 'doOutbound full');
      return;
    }

    // Move to the safe spot if the site isn't safe.
    if (moveToSafeSpot()) return;
      
    if (creep.pos.isNearTo(digPosition)) {
      // We've arrived.
      creep.memory._outboundTime = Game.time - creep.memory._outboundStartTime;
      setState(STATE_PICKUP_SK, 'doOutbound arrived');
      return;
    }

    myTravelTo(digPositionObj, {range:1});

    // If you happen to pass near a pile or tombstone, loot it.
    let nearbyPiles = creep.pos.findInRange(
        FIND_DROPPED_RESOURCES,
        /* range = */ 1,
        {filter: p => p.resourceType == RESOURCE_ENERGY});
    if (nearbyPiles.length) {
      creep.pickup(nearbyPiles[0]);
    } else {
      let nearbyStones = creep.pos.findInRange(
          FIND_TOMBSTONES,
          /* range = */ 1,
          {filter: s => s.store.energy});
      if (nearbyStones.length) {
        creep.withdraw(nearbyStones[0], RESOURCE_ENERGY);
      }
    }
  }

  function doPickup() {
    // Come home if you're full.
    if (creep.isFull) {
      creep.logDebug('full--returning');
      setState(STATE_DELIVER, 'doPickup full');
      creep.memory._inboundStartTime = Game.time;
      return;
    }
    
    const containerObj = creep.pos.findInRange(
        creep.room.containers,
        /* range = */ 1,
        {filter: c => c.id == digsite.container})[0];
    const pile = creep.pos.findInRange(
        FIND_DROPPED_RESOURCES,
        /* range = */ 1,
        {filter: p => p.resourceType == RESOURCE_ENERGY})[0];

    let amountNeeded = creep.store.getFreeCapacity();
    
    // If there's a pile, pull from it.
    if (pile) {
      creep.logDebug('drawing from pile');
      creep.pickup(pile);
      amountNeeded -= pile.amount;
    }
    
    if (containerObj) {
      // If we still need more, and the can has enough to fill us or we're in
      // a hurry, pull from it.
      let inAHurry = creep.ticksToLive < (creep.memory._inboundTime + 20);
      
      if (inAHurry) {
        amountNeeded = Math.min(amountNeeded, containerObj.store.energy);
      }

      if (amountNeeded > 0 && (containerObj.store.energy >= amountNeeded || inAHurry)) {
        creep.withdraw(containerObj, RESOURCE_ENERGY, amountNeeded);
        amountNeeded = 0;
      }
      
      if (inAHurry) {
        setState(STATE_DELIVER);
        creep.logDebug('rushing home');
        return;
      }
    }

    // If this point is reached, we're waiting at the site. If the digsite
    // has a haulerWaitPosition defined, stand on it.
    if (digsite.haulerWaitPosition) {
      let haulerWaitPosition = new RoomPosition(
          digsite.haulerWaitPosition.x,
          digsite.haulerWaitPosition.y,
          creep.room.name);
      creep.logDebug('Moving to hauler spot.');
      myTravelTo({pos: haulerWaitPosition}, {range:0});
    } else {
      creep.logDebug('Waiting.');
    }

    return;
  }
  
  function doPickupSk() {
      creep.logDebug('doPickup');
    // Come home if you're full.
    if (creep.isFull) {
      creep.memory._inboundStartTime = Game.time;
      setState(STATE_DELIVER, 'doPickup full');
      return;
    }
    
    // Move to the safe spot if the site isn't safe.
    if (moveToSafeSpot()) return;
    
    // Move to dig position otherwise. (Note that we can leave this for
    // lots of reasons.)
    if (!creep.pos.isNearTo(digPosition)) {
        creep.logDebug('Moving to pickup spot.');
        myTravelTo(digPositionObj);
    }

    const containerObj = creep.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: (i) => i.structureType == STRUCTURE_CONTAINER || i.structureType == STRUCTURE_STORAGE
    })[0];
    const pile = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
      filter: (i) => i.resourceType == RESOURCE_ENERGY
    })[0];
    
    let amountNeeded = creep.store.getFreeCapacity()
    
    // If there's a pile, pull from it.
    if (pile) {
      creep.logDebug('drawing from pile');
      creep.pickup(pile);
      amountNeeded -= pile.amount;
    }
    
    // Special SK stuff:  If there's a tombstone nearby, go grab it.
    let stone = creep.pos.findInRange(FIND_TOMBSTONES, 5, {filter: t => t.store.energy})[0];
    
    if (stone) {
      setState(STATE_FETCH);
      return;
    }
      
    if (!containerObj) {
      creep.logDebug('no container--done');
      return;
    }
    
    // If we still need more, and the can has enough to fill us or we're in
    // a hurry, pull from it.
    let inAHurry = creep.ticksToLive < (creep.memory._inboundTime + 10);
    
    if (inAHurry) {
      amountNeeded = Math.min(amountNeeded, containerObj.store.energy);
    }

    if (amountNeeded > 0 && (containerObj.store.energy >= amountNeeded || inAHurry)) {
      creep.withdraw(containerObj, RESOURCE_ENERGY, amountNeeded);
      amountNeeded = 0;
    }
    
    if (inAHurry) {
      setState(STATE_DELIVER);
      creep.logDebug('rushing home');
      return;
    }
    
    // If this point is reached, we're waiting at the site. If the digsite
    // has a haulerWaitPosition defined, stand on it.
    if (digsite.haulerWaitPosition) {
      creep.logDebug('Moving to hauler spot.');
      myTravelTo({pos: new RoomPosition(
          digsite.haulerWaitPosition.x,
          digsite.haulerWaitPosition.y,
          creep.pos.roomName)}, {range:0});
    } else {
      creep.logDebug('Waiting.');
    }

    return;
  }
  
  // Special state for SK lair haulers. Go grab a nearby stone/pile, and then
  // return to your exact position.
  // TODO: This can be suboptimal. Experiment with just going back to the can, to any position?
  function doFetch() {
    if (creep.memory.subState == 0) {
      creep.memory.returnPosition = {x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName};
      creep.memory.subState = 1;
    }

    // Go home if you're full.
    if (creep.isFull) {
      creep.logDebug('full--returning');
      setState(STATE_DELIVER, 'doFetch full');
      return;
    }

    // If there's a nearby pile, draw from that.
    let nearbyPiles = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 5, {
        filter: p => p.resourceType == RESOURCE_ENERGY && p.amount >= 200
    });
    
    if (nearbyPiles.length) {
      creep.logDebug('Filling from nearby pile.');
      let nearestPile = creep.pos.findClosestByPath(nearbyPiles);
      if (creep.pickup(nearestPile) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearestPile);
      }
      return;
    }
    
    // If there's a nearby tombstone, draw from that.
    let nearbyStones = creep.pos.findInRange(FIND_TOMBSTONES, 5, {
        filter: t => t.store.energy
    });
    
    if (nearbyStones.length) {
      creep.logDebug('Filling from nearby stone.');
      let nearest = creep.pos.findClosestByPath(nearbyStones);
      if (creep.withdraw(nearest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          myTravelTo(nearest);
      }
      return;
    }
    
    let returnPosition = new RoomPosition(
        creep.memory.returnPosition.x,
        creep.memory.returnPosition.y,
        creep.memory.returnPosition.roomName);

    if (creep.pos.isEqualTo(returnPosition)) {
      // We've arrived.
      setState(STATE_PICKUP_SK, 'doFetch arrived');
      return;
    }
    
    myTravelTo(returnPosition);
  }

  function doDeliver() {
    let deliveryRoom = Memory.rooms[creep.memory.workRoom].deliveryRoom ||
        Memory.rooms[creep.memory.workRoom].base ||
        creep.memory.workRoom;

    if (digsite &&
        digsite.drop &&
        digsite.drop.id &&
        (digsite.drop.use || digsite.drop.validated)) {
      let drop = Game.getObjectById(digsite.drop.id);
      if (drop && !creep.pos.isNearTo(drop.pos)) {
        myTravelTo(drop, {range:1});
        return;
      }
    }

    if (creep.pos.roomName != deliveryRoom) {
      creep.logDebug('Moving to deliveryRoom ' + deliveryRoom);
      myTravelTo(Game.rooms[deliveryRoom].controller, {range:3});
      return;
    }

    creep.logDebug("doDeliver, substate=" + creep.memory.subState);
      
    if (creep.store.getUsedCapacity() == 0) {
      // If we're damaged, and in a room with towers (we most likely are)
      // wait until healed.
      if (creep.hits < creep.hitsMax && creep.room.towers.length ) {
        return;
      }
      
      // Don't go unless you can make it there and back.  Use the last
      // recorded time, and add a smallish safety margin. Don't need a
      // large one because the costs of a near-miss are small.
      let minTTL = (creep.memory._outboundTime || 0) + (creep.memory._inboundTime || 0) + 20;
      let likelyLastTrip = 2 * minTTL;
      if (creep.ticksToLive < minTTL) {
        creep.suicide();
      } else {
        // Set lastTrip if we're probably on our last trip. This signals the spawners to replace us.
        if (creep.ticksToLive < likelyLastTrip) {
            creep.memory.lastTrip = true;
        }
        creep.memory._outboundStartTime = Game.time;
        if (Memory.rooms[creep.memory.workRoom].role == 'skLair') {
          setState(STATE_OUTBOUND_SK, 'doDeliver enoughTTL');
        } else {
          setState(STATE_OUTBOUND, 'doDeliver enoughTTL');
        }
      }
      return;
    }

    // If I'm carrying only energy and there's a drop link within 3, use it.
    if ((creep.store.energy == creep.store.getUsedCapacity()) && creep.room.storageLink) {
      const nearbyLinks = creep.pos.findInRange(creep.room.dropLinks, 3);

      creep.logDebug('I see ' + nearbyLinks.length + ' nearby links from ' + creep.pos);
      
      if (nearbyLinks.length) {
        // There's at least one. Of those with any available space, dump at the one
        // with the most energy. Break ties in favor of the link with the shortest cooldown.
        const withRoom = _.filter(nearbyLinks, link => link.energy < link.energyCapacity);
        creep.logDebug(withRoom.length + ' of them have room.');
        if (withRoom.length) {
          // Dump what you can to the one with the least room.
          const mostEnergy = _.max(withRoom, function(l) {return (l.energy * 100) - l.cooldown;});
          creep.logDebug(mostEnergy.id + ' has the most energy.');
          if (creep.myTransfer(mostEnergy, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            myTravelTo(mostEnergy);
          } else {
            if (creep.memory._inboundStartTime) {
              creep.memory._inboundTime = Game.time - creep.memory._inboundStartTime;
              delete creep.memory._inboundStartTime;
            }
            // Maybe validate digsite.
            if (digsite && digsite.drop && digsite.drop.id && !digsite.drop.validated) {
              if (digsite.drop.id == mostEnergy.id) {
                creep.logError(`My destination agrees with digsite drop id. (${creep.room.link})`);
                digsite.drop.validated = true;
              } else {
                creep.logError(`(${creep.room.link}) My destination is weird.`);
                let drop = Game.getObjectById(digsite.drop.id);
                creep.logError(`My source is at ${digPosition}.`);
                creep.logError(`Site thinks I should drop at ${drop.pos} but I actually ` +
                    `dropped at ${mostEnergy.pos}`);
              }
            }
          }
        } else {
          // None have room. Wait.
          myTravelTo(nearbyLinks[0]);
        }
        return;
      }
    }

    if (creep.memory.subState == 0) {
      // choose a transfer target.
      
      // Upgrade container, if present, starving, and nearer than storage
      if (creep.room.upgradeContainer &&
          creep.room.upgradeContainer.store.getUsedCapacity() < 1800 &&
          creep.store.getUsedCapacity() == creep.store.energy &&
          (!creep.room.storage ||
              !creep.room.storage.active ||
              creep.pos.findClosestByPath([creep.room.storage, creep.room.upgradeContainer]) == creep.room.upgradeContainer)) {
        creep.logDebug('choosing upgradeContainer');
        creep.memory.transferTargetId = creep.room.upgradeContainer.id;
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Terminal, if present, has space, is not to be ignored, and nearer than storage.
      if (creep.room.activeTerminal &&
          !creep.room.activeTerminal.servingController &&
          !creep.room.memory.ignoreTerminal &&
          _.sum(creep.room.terminal.store) + _.sum(creep.store) <= TERMINAL_CAPACITY &&
          creep.pos.getRangeTo(creep.room.terminal) < creep.pos.getRangeTo(creep.room.storage)) {
        creep.logDebug('choosing terminal');
        creep.memory.transferTargetId = creep.room.terminal.id;
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Storage, if available.
      if (creep.room.activeStorage) {
        creep.logDebug('choosing storage');
        creep.memory.transferTargetId = creep.room.storage.id;
        creep.memory.subState = 1;
        repeat = true;
        return;
      }
      
      // mainStore, if available.
      if (creep.room.mainStore) {
        creep.logDebug('choosing mainStore');
        creep.memory.transferTargetId = creep.room.mainStore.id;
        creep.memory.subState = 1;
        repeat = true;
        return;
      }
      let altStorage = Game.getObjectById(creep.room.memory.altStorage);

      // Alt storage, if available.
      if (altStorage) {
        creep.logDebug('choosing altStorage');
        creep.memory.transferTargetId = creep.room.memory.altStorage;
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Any container that can take the entire load.
      let containerObj = creep.pos.findClosestByPath(creep.room.containers, {
          filter: s => creep.store.getUsedCapacity() < s.store.getFreeCapacity()
      });
      if (containerObj) {
        creep.memory.transferTargetId = containerObj.id;
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Any container with any room at all.
      containerObj = creep.pos.findClosestByPath(creep.room.containers, {
          filter: s => _.sum(s.store) < s.storeCapacity
      });
      if (containerObj) {
        creep.memory.transferTargetId = containerObj.id;
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Just go stand near the nearest extension, if containers are full or unavailable.
      const extensionObj = creep.pos.findClosestByPath(creep.room.extensions);
      if (extensionObj) {
        creep.memory.transferTargetId = extensionObj.id;
        creep.memory.subState = 1;
        repeat = true;
        return;
      }
    }
    
    if (creep.memory.subState == 1) {
      // deliver to transfer target.
      const transferTargetObj = Game.getObjectById(creep.memory.transferTargetId);
      for (let resource in creep.store) {
        if (creep.store[resource] > 0) {
          let transferResult = creep.myTransfer(transferTargetObj, resource);
          switch (transferResult) {
            case OK:
              if (creep.memory._inboundStartTime) {
                creep.memory._inboundTime = Game.time - creep.memory._inboundStartTime;
                delete creep.memory._inboundStartTime;
              }
              if (digsite && digsite.drop && digsite.drop.id && !digsite.drop.validated) {
                if (digsite.drop.id == transferTargetObj.id) {
                  creep.logError(`My destination agrees with digsite drop id. (${creep.room.link})`);
                  digsite.drop.validated = true;
                } else {
                  creep.logError(`I dropped at a transfer target that does NOT match my digsite drop and my digsite isn't validated`);
                  creep.logError(`Drop site is ${transferTargetObj.structureType} at ${transferTargetObj.pos.link}`);
                  let intendedDropObject = Game.getObjectById(digsite.drop.id)
                  creep.logError(`Intended site was ${intendedDropObject.structureType} at ${intendedDropObject.pos.link}`);
                  creep.logError(`My workRoom is ${creep.memory.workRoom}`);
                }
              }
              return;
            case ERR_NOT_IN_RANGE:
              myTravelTo(transferTargetObj);
              return;
            case ERR_INVALID_TARGET:
            case ERR_FULL:
            default:
              // Our once-valid target must no longer be valid, or is full. Pick another one.
              creep.memory.subState = 0;
              return;
          }
        }
      }
    }
  }

  function doInit() {
    creep.notifyWhenAttacked(false);
    setState(STATE_DELIVER);
  }

  function doCustom() {
  }
  
  do {
    repeat = false;
    maxRepeat--;
    
    switch (creep.memory.state) {
      case STATE_OUTBOUND:
        doOutbound();
        break;
      case STATE_OUTBOUND_SK:
        doOutboundSk();
        break;
      case STATE_PICKUP:
        doPickup();
        break;
      case STATE_PICKUP_SK:
        doPickupSk();
        break;
      case STATE_FETCH:
        doFetch()
        break;
      case STATE_DELIVER:
        doDeliver();
        break;
      case STATE_INIT:
        doInit();
        break;
      case STATE_AMNESIAC:
      case STATE_DIE:
        creep.doUnblock() || creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
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
  
  creep.memory._lastEnergy = creep.store.energy;
}

module.exports = {
  STATE_OUTBOUND,
  STATE_PICKUP,
  STATE_PICKUP_SK,
  STATE_DELIVER,
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestSpawn,
  run
};