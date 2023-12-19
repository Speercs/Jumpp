'use strict';

// Minerals available to rooms with urgent needs.
let mineralExcess = {};

// Rooms with space available to accept minerals.
let mineralCapacity = {};

// Don't update if nextCheck[roomName] < Game.time.
let nextCheck = {};

let MIN_TO_SEND = {
  O: 2000,
  H: 2000,
  U: 2000,
  L: 2000,
  K: 2000,
  Z: 2000,
  X: 2000,

  keanium_bar: 500,
  lemergium_bar: 500,
  utrium_bar: 500,
  zynthium_bar: 500,
  oxidant: 500,
  reductant: 500,
  purifier: 500,
  ghodium_melt: 200,

  composite: 200,
  crystal: 300,
  liquid: 300,

  biomass: 1000,
  silicon: 1000,

  cell: 200,
  wire: 200,

  XUH2O: 1000,
  XLH2O: 1000,
  XKH2O: 1000,
  XLHO2: 1000,
  XZH2O: 1000,
  XZHO2: 1000,
  XKHO2: 1000,
  XGHO2: 1000,
  XGH2O: 1000,
};

function update(room) {
  if (ticksSinceReset() < 2) return;
  if (nextCheck[room.name] > Game.time) return;

  if (!room.activeTerminal) {
    clearDeclarations(room.name);
    nextCheck[room.name] = Game.time + 100;
    return;
  }

  let acted = false;

  for (let key of _.keys(room.idealAmounts)) {
    acted = doResource(room, key) || acted;
  }

  if (!acted) {
    nextCheck[room.name] = Game.time + 80 + Math.round(Math.random() * 40);
  }
}

function clearDeclarations(roomName) {
  let room = Game.rooms[roomName];
  for (let key of _.keys(room.idealAmounts)) {
    if (mineralExcess[key]) delete mineralExcess[key][roomName];
    if (mineralCapacity[key]) delete mineralCapacity[key][roomName];
  }
}

function doResource(room, resource) {
  let idealAmount = room.idealAmounts[resource];
  if (room.baseType == 'lw' || room.labs.length == 0) idealAmount = 0;

  let limit = room.resourceLimits[resource];
  let amount = room.roughInventory(resource);
  let minToSend = MIN_TO_SEND[resource];
  let acted = false;

  if (mineralExcess[resource]) delete mineralExcess[resource][room.name];
  if (mineralCapacity[resource]) delete mineralCapacity[resource][room.name];

  if (amount >= idealAmount + minToSend) {
    // some excess
    let excess = amount - idealAmount;
    if (excess >= MIN_TO_SEND[resource]) {
      _.set(mineralExcess, `${resource}.${room.name}`, excess);
    }
  }

  // Note that it's possible to have both capacity AND excess.
  if (amount <= limit - minToSend) {
    let capacity = limit - amount;
    _.set(mineralCapacity, `${resource}.${room.name}`, capacity);
  }

  if (!room.terminal.cooldown && 
      !room.terminal.busy &&
      room.terminal.store[resource] >= minToSend &&
      amount >= limit + minToSend) {
    // urgent excess.
    let excess = amount - limit;
    room.logError(`I have a new-system urgent excess of ${excess} ${resource}`);

    let bestDestination = getBestDestinationForResource(room, resource);
    if (bestDestination) {
      room.logError(`bestDestination is ${bestDestination && bestDestination.name} which has ` +
          `${bestDestination.roughInventory(resource)}`);

      acted = maybeSendExcess(bestDestination, room, resource, excess) || acted;
    }
    
    return acted;
  }

  if (amount <= idealAmount - minToSend) {
    // urgent need.
    let need = idealAmount - amount;
    //room.logError(`I have a new-system urgent need for ${need} ${resource}`);

    let bestSource = getBestSourceForResource(room, resource);
    if (bestSource) {
      //room.logError(`bestSource is ${bestSource && bestSource.name} which has ${bestSource.roughInventory(resource)}`);

      acted = maybeSendNeeded(bestSource, room, resource, need) || acted;
    }
  }

  return acted;
}

function maybeSendNeeded(source, dest, resource, destNeed) {
  if (!source.activeTerminal) {
    dest.logError(`Trying to pull resources from a room ${source.name} that doesn't have an active terminal.`);
    return;
  }

  if (source.activeTerminal.cooldown || source.activeTerminal.busy) {
    //dest.logDebug(`Source terminal is busy. Waiting.`);
    return true; // Try again next tick.
  }

  if (dest.terminal.store.getFreeCapacity(resource) < MIN_TO_SEND[resource]) {
    dest.logError(`Dest terminal has no room. Waiting.`);
    return true; // Try again next tick.
  }

  let sourceExcess = mineralExcess[resource][source.name];
  let sourceInTerminal = source.terminal.store[resource];

  if (sourceInTerminal < MIN_TO_SEND[resource]) {
    dest.logError(`Source (${source.link}) has too little (${sourceInTerminal}) ${resource} in ` +
        `terminal. Waiting.`);
    source.terminal.busy = true;
    return true; // Try again next tick.
  }

  let amountToSend = Math.min(destNeed, sourceExcess, sourceInTerminal);

  if (amountToSend < MIN_TO_SEND[resource]) {
    dest.logError(`Trying to send less than MIN_TO_SEND, which shouldn't be possible.`);
    return;
  }

  //dest.logError(`Pulling ${amountToSend} ${resource} from ${source.memory.code} (${source.name})`);
  let result = source.terminal.mySend(resource, amountToSend, dest.name, `shifter urgentNeed`);
  if (result == OK) {
    // Queue the sender for update. Don't want to let its reported excess get stale.
    nextCheck[source.name] = 0;
    return true; // Succeeded, but we may still need more? Try again next tick.
  } else {
    dest.logError(`Failed to pull ${amountToSend} ${resource} from ${source.memory.code} (${source.name}): ${result}`);
  }
}

function maybeSendExcess(dest, source, resource, sourceExcess) {
  if (dest.terminal.store.getFreeCapacity(resource) < MIN_TO_SEND[resource]) {
    dest.logError(`Dest terminal has no room. Waiting.`);
    return true;
  }

  let destCapacity = dest.isVault ? Infinity : mineralCapacity[resource][dest.name];
  let sourceInTerminal = source.terminal.store[resource];

  let amountToSend = Math.min(destCapacity, sourceExcess, sourceInTerminal);

  if (amountToSend < MIN_TO_SEND[resource]) {
    dest.logError(`Trying to send less than MIN_TO_SEND, which shouldn't be possible.`);
    return;
  }

  source.logError(`Sending ${amountToSend} ${resource} to ${dest.name}`);
  let result = source.terminal.mySend(resource, amountToSend, dest.name, `shifter urgentExcess`);
  if (result == OK) {
    // Queue the dest for update. Don't want to let its reported capacity get stale.
    nextCheck[dest.name] = 0;
    return true; // Succeeded, but we may still need more? Try again next tick.
  } else {
    dest.logError(`Failed to pull ${amountToSend} ${resource} from ${source.name}: ${result}`);
  }
}

function getBestSourceForResource(room, resource) {
  let rawRoomsWithExcess = _.map(_.keys(mineralExcess[resource]), name => Game.rooms[name]);
  let roomsWithExcess = _.filter(rawRoomsWithExcess, r => r.terminal.store.energy > 20000);
  let neighborsWithExcess = _.filter(roomsWithExcess, r => isNeighbor(room, r));
  let excludeNonProducerVaults = _.filter(neighborsWithExcess, r => !r.isVault || r.nativeMineral == resource);
  //room.logError(`roomsWithExcess = ${_.map(roomsWithExcess, 'name')}`);
  //room.logError(`neighborsWithExcess = ${_.map(neighborsWithExcess, 'name')}`);
  //room.logError(`excludeNonProducerVaults = ${_.map(excludeNonProducerVaults, 'name')}`);

  function nearestToRoom(other) {
    return Game.map.getRoomLinearDistance(room.name, other.name);
  }

  if (excludeNonProducerVaults.length) {
    return _.min(excludeNonProducerVaults, nearestToRoom);
  } else if (neighborsWithExcess.length) {
    return _.min(neighborsWithExcess, nearestToRoom);
  } else if (roomsWithExcess.length) {
    return _.min(roomsWithExcess, nearestToRoom);
  }
}

function getBestDestinationForResource(room, resource) {
  // In order:
  // neighbor non-vault non-producer under limit
  // neighbor vault under limit
  // any non-producer under limit
  // any base under limit
  // nearest vault if it has at least 100k of free space in storage
  // floor
  let roomsUnderLimit = _.map(_.keys(mineralCapacity[resource]), name => Game.rooms[name]);
  let nonProducers = _.filter(roomsUnderLimit, b => b.nativeMineral != resource);
  let nonProducerNonVaults = _.filter(nonProducers, b => !b.isVault);
  let neighborNonProducerNonVaults = _.filter(nonProducerNonVaults, r => isNeighbor(room, r));
  let neighborVaults = _.filter(roomsUnderLimit, r => r.isVault);
  //room.logError(`roomsUnderLimit = ${_.map(roomsUnderLimit, 'name')}`);
  //room.logError(`nonProducers = ${_.map(nonProducers, 'name')}`);
  //room.logError(`nonProducerNonVaults = ${_.map(nonProducerNonVaults, 'name')}`);
  //room.logError(`neighborNonProducerNonVaults = ${_.map(neighborNonProducerNonVaults, 'name')}`);
  //room.logError(`neighborVaults = ${_.map(neighborVaults, 'name')}`);

  function nearestToRoom(other) {
    return Game.map.getRoomLinearDistance(room.name, other.name);
  }

  if (neighborNonProducerNonVaults.length) {
    return _.min(neighborNonProducerNonVaults, nearestToRoom);
  } else if (neighborVaults.length) {
    return _.min(neighborVaults, nearestToRoom);
  } else if (nonProducers.length) {
    return _.min(nonProducers, nearestToRoom);
  } else if (roomsUnderLimit.length) {
    return _.min(roomsUnderLimit, nearestToRoom);
  } else if (room.nearestVault &&
      room.nearestVault.storage &&
      room.nearestVault.storage.store.getFreeCapacity() > 100000) {
    return room.nearestVault;
  }
}


/**
 * Returns true if roomA and roomB both have the same nearestVault (also true if there are no vaults).
 * @param {Room} roomA 
 * @param {Room} roomB 
 */
function isNeighbor(roomA, roomB) {
  return roomA.nearestVault == roomB.nearestVault;
}

global.sd = function(resource) {
  if (resource) {
    console.log(`mineralExcess = ${JSON.stringify(mineralExcess[resource], null, 2)}`);
    console.log(`mineralCapacity = ${JSON.stringify(mineralCapacity[resource], null, 2)}`);
  } else {
    console.log(`mineralExcess = ${JSON.stringify(mineralExcess, null, 2)}`);
    console.log(`mineralCapacity = ${JSON.stringify(mineralCapacity, null, 2)}`);
  }
}

global.refresh = function(room) {
  nextCheck[room.name] = 0;
}

module.exports = {
  update,
}