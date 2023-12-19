'use strict';

let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');

const STATE_PICKUP = 2;
const STATE_DELIVER = 3;
const STATE_BOOST_ALL = 4;

const STATE_INIT_COMMODITY = 7;
const STATE_PICKUP_COMMODITY = 5;
const STATE_DELIVER_COMMODITY = 6;

function getBody(model) {
  switch (model) {
    case 12: // Lightly-armored transport
      return [TOUGH,

        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY,

        HEAL,

        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];
    case 11: // Armored transport
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,

        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY, CARRY, CARRY, CARRY,
        CARRY, CARRY,

        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];
    case 10: // Special RCL4 variant
      return [CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE];
    case 4: // Road variant.
      return [CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY,
        
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE];
    case 3: // test variant
      return [CARRY, MOVE];

    case 2: // boosted variant
      return [CARRY, CARRY, CARRY, CARRY, CARRY,  CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,  CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,  CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,  CARRY, CARRY, CARRY, CARRY, CARRY,
                  
          MOVE, MOVE, MOVE, MOVE, MOVE,  MOVE, MOVE, MOVE, MOVE, MOVE];
    case 1: // Off-road variant.
    default:
      return [CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          CARRY, CARRY, CARRY, CARRY, CARRY,
          
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    }
}

function getDefaultCreateOpts(model) {
  return {
      memory: {
          role: 'wagon',
          model: model,
          subState: 0,
          noRenew: true,
          suppressNotify: true,
      }
  };
}

function getNewName() {
  return getUniqueCreepName('Wagon');
}

function requestSpawnRoom(rooms, model, workSite, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);

  if (typeof workSite == 'string' && workSite.isValidRoomName()) {
    opts.memory.workRoom = workSite;
    opts.memory.state = STATE_BOOST_ALL;
  } else if (workSite.depositType) {
    opts.memory.workRoom = workSite.room.name;
    opts.memory.depositId = workSite.id;
    opts.memory.state = STATE_INIT_COMMODITY;
  }

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  if (creep.memory.model == 12) {
    return true;
  }

  return creep.memory.model != 4 && creep.needsBoostedMove();
}

function runSpawning(creep) {
  if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    if (creep.memory.model == 12) {
      creep.requestBoost('XGHO2', creep.getActiveBodyparts(TOUGH));
      creep.requestBoost('XLHO2', creep.getActiveBodyparts(HEAL));
    } else {
      creep.requestAllBoosts();
    }
    creep.room.requestBoost(creep);
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  let myPost = roomGuardPosition(creep.memory.workRoom);
  
  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function myTravelTo(target, options) {
    if (!options) {
      options = {};
    }

    if (!options.roomCallback) {
      options.roomCallback = RoomCallback.avoidKeepersCallback;
    }
    creep.travelTo2(target, options);
  }

  function getSource() {
    if (creep.pos.roomName != myPost.roomName) {
      return;
    }

    if (creep.memory.sourceId) {
      let source = Game.getObjectById(creep.memory.sourceId);
      if (source && _.sum(source.store)) {
        return source;
      }
    }

    let stores = [];

    stores = creep.room.find(FIND_RUINS, {filter: r => _.sum(r.store) > 0});

    if (!stores.length) {
      stores = creep.room.find(
          FIND_STRUCTURES,
          {filter: s => s.store &&
              _.sum(s.store) > creep.store.getFreeCapacity() &&
              s.structureType != STRUCTURE_NUKER &&
              (s.naked || s.pos.rampart().my) &&
              s != creep.room.mainStore &&
              !s.isSourceContainer &&
              !s.playerSKcontainer});
    }

    if (!stores.length) {
      stores = creep.room.find(
          FIND_STRUCTURES,
          {filter: s => s.store &&
              (s.naked || s.pos.rampart().my) &&
              s.structureType != STRUCTURE_NUKER &&
              _.sum(s.store) &&
              s != creep.room.mainStore &&
              !s.isSourceContainer &&
              !s.playerSKcontainer});
    }

    if (stores.length) {
      let source = creep.pos.findClosestByPath(stores, {range:1});
      if (source) {
        creep.memory.sourceId = source.id;
        return source;
      }
    }
  }

  function healSelf() {
    if (creep.healPower && (creep.hits < creep.hitsMax || creep.maxDamage)) {
      creep.myHeal(creep);
    }
  }
  
  function doPickup() {
    creep.logDebug('doPickup');
    if (creep.isFull) {
      // Don't change state yet if this is a base room with active towers and we're damaged.
      if (creep.hits == creep.hitsMax ||
          !creep.room.controller ||
          !creep.room.controller.my ||
          !creep.room.activeTowers.length) {
        creep.logDebug('Loaded and healed. Switching to deliver.');
        setState(STATE_DELIVER);
        return;
      }
    } 

    healSelf();

    let ttl = 300;
  
    if (creep.ticksToLive < ttl) {
      setState(STATE_DIE);
      return;
    }

    // If you happen to pass near a pile or tombstone, loot it.
    let nearbyPiles = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1);
    if (nearbyPiles.length) {
      creep.pickup(nearbyPiles[0]);
    } else {
      let nearbyStones = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
          filter: s => s.store.energy
      });
      if (nearbyStones.length) {
        creep.withdraw(nearbyStones[0], RESOURCE_ENERGY);
      }
    }

    let source = getSource();

    function shutdown() {
      creep.logDebug(`Wagon finds no sources in ${creep.room.name}. Shutting down.`);
      setState(STATE_DIE);
    }

    if (!source && creep.pos.roomName == myPost.roomName) {
      shutdown();
      return;
    }

    if (!source) {
      myTravelTo(myPost, {offRoad:true});
      return;
    }
  
    if (creep.pos.isNearTo(source)) {
      if (_.any(creep.store) && creep.room.ownedCreeps.length > 2) {
        let otherWagonsNearMe = creep.pos.findInRange(
          creep.room.ownedCreeps,
          1,
          {filter: c => c != creep &&
              c.memory.role == 'wagon' &&
              c.totalTicksToLive < creep.totalTicksToLive});

        if (otherWagonsNearMe.length) {
          creep.myTransfer(otherWagonsNearMe[0], creep.store.mostValuableThing);
          return;
        }
      }
      if (_.any(source.store)) {
        if (creep.withdraw(source, source.store.mostValuableThing) == ERR_INVALID_TARGET) {
          source.myTransfer(creep, source.store.mostValuableThing);
        }
      }
      return;
    } else {
      myTravelTo(source, {range: 1, offRoad: true})
    }
  }

  function getReceiver() {
    if (!creep.memory.depositId && creep.memory.workRoom) {
      let mem = Memory.rooms[creep.memory.workRoom].loot;
      if (mem && mem.deliveryRoom) {
        let deliveryRoom = Game.rooms[mem.deliveryRoom];
        if (deliveryRoom) {
          if (deliveryRoom.activeStorage || deliveryRoom.activeTerminal) {
            return deliveryRoom.activeTerminal || deliveryRoom.activeStorage;
          }
        }
      }
    }

    let spawnRoom = Game.spawns[creep.memory.spawnedBy].room;
    if (spawnRoom) {
      return spawnRoom.storage || spawnRoom.terminal;
    }
  }
  
  function doDeliver() {
    creep.logDebug('doDeliver');

    if (creep.isEmpty && creep.store.getFreeCapacity()) {
      if (creep.hits == creep.hitsMax ||
          !creep.room.controller ||
          !creep.room.controller.my ||
          !creep.room.towers.length) {
        setState(STATE_PICKUP);
        return;
      }
    }

    healSelf();

    let receiver = getReceiver();

    // If there's no receiver, just stand around at our post and wait
    // for someone to take your stuff.
    if (!receiver) {
      // Give to the neediest in touch range.
      if (creep.pos.getRangeTo(myPost) < 8) {
        // look for a builder, drone, or upgrader to give to.
        let neederRoles = ['upgrader', 'builder', 'drone'];
        let needers = creep.pos.findInRange(
            creep.room.myCreeps,
            /* range = */ 6,
            {filter: c => neederRoles.includes(c.memory.role) && !c.isFull}
        );

        if (needers.length) {
          let neediest = _.max(needers, function(c) {return c.store.getFreeCapacity()});
          myTravelTo(neediest, {range:1});
              
          let touchRange = creep.pos.findInRange(needers, 1);
          neediest = _.max(touchRange, function(c) {return c.store.getFreeCapacity()});
          creep.myTransfer(neediest, RESOURCE_ENERGY);
        }
      }

      myTravelTo(myPost);
      return;
    }

    if (creep.pos.isNearTo(receiver)) {
      creep.myTransfer(receiver, creep.mainCargo());
    } else {
      myTravelTo(receiver, {range: 1})
    }
  }

  function doPickupCommodity() {
    creep.logDebug('doPickupCommodity');
    if (creep.isFull) {
      setState(STATE_DELIVER_COMMODITY);
      return;
    } 

    if (creep.ticksToLive < 300) {
      if (creep.store.getUsedCapacity()) {
        setState(STATE_DIE);
      } else {
        creep.suicide();
      }
      return;
    }

    let deposit = Game.getObjectById(creep.memory.depositId);

    if (creep.room.name == creep.memory.workRoom) {
      let miner = Game.getObjectById(creep.memory._minerId) ||
          _.find(
              creep.room.myCreeps,
              c => c.memory.role == 'miner' &&
                  c.pos.isNearTo(deposit) &&
                  c.memory.target == creep.memory.depositId);

      if (miner) {
        // Cache the name so we don't have to do the find every tick while we idle.
        creep.memory._minerId = miner.id;
        myTravelTo(miner, {maxRooms: 1, range: 1});
      } else if (deposit) {
        myTravelTo(deposit, {maxRooms: 1, range: 3});
      } else {
        creep.logError(`My deposit is gone. Suiciding.`);
        creep.suicide();
      }
    } else {
      if (deposit) {
        myTravelTo(deposit, {range: 1});
      } else {
        myTravelTo(roomGuardPosition(creep.memory.workRoom));
      }
    }
  }

  function doDeliverCommodity() {
    creep.logDebug('doDeliverCommodity');

    if (creep.isEmpty && creep.store.getFreeCapacity()) {
      if (creep.hits == creep.hitsMax ||
          !creep.room.controller ||
          !creep.room.controller.my ||
          !creep.room.towers.length) {
        setState(STATE_PICKUP_COMMODITY);
        return;
      }
    }

    let receiver = getReceiver();

    if (creep.pos.isNearTo(receiver)) {
      creep.myTransfer(receiver, creep.mainCargo());
    } else {
      myTravelTo(receiver, {range: 1})
    }
  }

  function doInitCommodity() {
    creep.checkSuppressNotify();
    setState(STATE_PICKUP_COMMODITY);
  }

  function doBoostAll() {
    creep.checkSuppressNotify();

    if (creep.doBoost() == OK) {
      setState(STATE_PICKUP);
      return;
    }
  }

  function doCustom() {
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_PICKUP_COMMODITY:
        doPickupCommodity();
        break;
      case STATE_DELIVER_COMMODITY:
        doDeliverCommodity();
        break;
      case STATE_PICKUP:
        doPickup();
        break;
      case STATE_DELIVER:
        doDeliver();
        break;
      case STATE_INIT_COMMODITY:
        doInitCommodity();
        break;
      case STATE_BOOST_ALL:
        doBoostAll();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      default:
        setState(STATE_PICKUP);
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
  requestSpawnRoom,
  run,
  runSpawning
};