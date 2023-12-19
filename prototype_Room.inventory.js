'use strict';

function storeAdd(a, b) {
  return (a || 0) + (b || 0);
}

function takeInventory(room) {
  let roomStuff = {};
  if (room.storage) {
    roomStuff = _.cloneDeep(room.storage.store);
  }

  if (room.terminal) {
    _.merge(roomStuff, room.terminal.store, storeAdd);
  }
  
  if (room.factory) {
    _.merge(roomStuff, room.factory.store, storeAdd);
  }
  
  const labs = _.filter(room.labs, s => s.mineralAmount || s.energy);

  for (let j=0; j < labs.length; j++) {
    _.merge(roomStuff, labs[j].store, storeAdd);
  }

  const creeps = room.find(FIND_MY_CREEPS);
  for (let k=0; k < creeps.length; k++) {
    _.merge(roomStuff, creeps[k].store, storeAdd);
  }
  
  return roomStuff;
}

function netOfLabs(room) {
  let orders = (room.memory && room.memory.labs && room.memory.labs.orders) || [];

  let needs = orderNetResults(orders);

  needs = _.pick(needs, function(v) {return v > 0;});
  let roomInv = _.cloneDeep(room.inventory);
  _.merge(roomInv, needs, function(a,b) {return (a||0) - (b||0);});
  let netInv = _.pick(roomInv, function(v) {return v > 0;});
  return netInv;
}

Object.defineProperty(Room.prototype, 'inventory', {
  get: function() {
    if (this._inventory) {
      return this._inventory;
    } else {
      return this._inventory = takeInventory(this);
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'inventoryNetOfLabs', {
  get: function() {
    if (this._inventoryNetOfLabs) {
      return this._inventoryNetOfLabs;
    } else {
      return this._inventoryNetOfLabs = netOfLabs(this);
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function checkNeedsCache(room) {
  if (room._needs) {
    return;
  }

  let t0 = Game.cpu.getUsed();

  room._needs = {};
  room._urgentNeeds = {};
  room._excess = {};
  room._urgentExcess = {};

  if (!room.activeTerminal) {
    return;
  }

  let canSend = !room.activeTerminal.cooldown && !room.activeTerminal.busy;

  for (let resource in room.resourceLimits) {
    let limit = room.resourceLimits[resource];
    let halfLimit = limit >> 1;

    let onHand = room.roughInventory(resource);

    if (onHand < limit) {
      room._needs[resource] = limit - onHand;

      if (onHand < halfLimit) {
        room._urgentNeeds[resource] = limit - onHand;
      }
    }

    if (canSend && onHand > halfLimit) {
      let amtInTerminal = room.terminal.store[resource];
      let maxAllowedByEnergy =
          (resource == RESOURCE_ENERGY) ? (amtSendable >> 1) : room.terminal.store[RESOURCE_ENERGY];

      let maxToSend = Math.min(amtInTerminal, maxAllowedByEnergy);
      
      room._excess[resource] = Math.min(maxToSend, onHand - halfLimit);

      if (onHand > limit) {
        room._urgentExcess[resource] = Math.min(maxToSend, onHand - limit);
      }
    }
  }

  let t1 = Game.cpu.getUsed();
  room.logError(`Computing needs took ${_.round(t1-t0, 3)}`);
}

Object.defineProperty(Room.prototype, 'xneeds', {
  get: function() {
    checkNeedsCache(this);
    return this._needs;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'xurgentNeeds', {
  get: function() {
    checkNeedsCache(this);
    return this._urgentNeeds;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'xexcess', {
  get: function() {
    checkNeedsCache(this);
    return this._excess;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'xurgentExcess', {
  get: function() {
    checkNeedsCache(this);
    return this._urgentExcess;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});