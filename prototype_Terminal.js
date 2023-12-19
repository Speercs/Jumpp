'use strict';

StructureTerminal.prototype.mainCargo = function() {
  const obj = this.store;
  let keys = Object.keys(obj);
  
  if (!keys.length) {
    return;
  }
  
  return keys.reduce(function(a, b){ return obj[a] > obj[b] ? a : b });}

// Log of the most recent send of a given resource from a given room to another room.
// Key is resourceType + sourceRoomName + destinationRoomName.
// Value is the time of the last such send.
let _terminalSends = {};

// Complain if room A sends a resource to room B that room B has sent to room A within the
// last this many ticks.
let TERMINAL_CYCLE_TICKS = 100;

let LW_MIN_TERMINAL_ENERGY = 25000;
let LW_MAX_STORAGE_ENERGY = 250000;
let LW_MIN_STORAGE_ENERGY = 100000;

function sendOk(resourceType, source, destination) {
  let reverseKey = resourceType + destination + source;

  if (_terminalSends[reverseKey] + TERMINAL_CYCLE_TICKS > Game.time) {
    console.log(`Blocking send of ${resourceType} from ${source} to ${destination} because ` +
        `opposite send ${Game.time - _terminalSends[reverseKey]} ticks ago.`);
    return false;
  }

  return true;
}

function updateTerminalSends(resourceType, source, destination) {
  let outboundKey = resourceType + source + destination;

  _terminalSends[outboundKey] = Game.time;
}

StructureTerminal.prototype.mySend = function(resourceType, amount, destination, description) {
  if (!sendOk(resourceType, this.room.name, destination)) return ERR_FAILED_PRECONDITION;

  let result = this.send(resourceType, amount, destination, description);

  if (result == OK) {
    this.room.logDebug(`Terminal sends ${amount} ${resourceType} to ${destination}`);
    this.busy = true;
    updateTerminalSends(resourceType, this.room.name, destination);
  }

  return result;
}

function resourceTarget(resourceType, room) {
  // 3000 for t3 boosts
  if (resourceType.startsWith('X') && resourceType != 'X')
    return room.memory.shutdown ? 24000 : 3000;

  // 12,000 for O and H
  if (['O', 'H'].includes(resourceType))
    return 12000;

  // 6,000 for U, L, Z, K, G, X
  if (['U', 'L', 'Z', 'K', 'G', 'X'].includes(resourceType))
    return 6000;
  
  // 50,000 energy
  if (resourceType == RESOURCE_ENERGY) {
    if (!room.terminal.active) {
      return 0;
    }
    // No. If the terminal has under 50k and the storage has just less than 100k, the
    // crane can get stuck shifting the same packet of 800 energy back and forth between
    // the terminal and storage, as storage enters and leaves the <100k state.
    /*if (room.storage && room.storage.store.energy < 100000) {
      return 0;
    }*/

    let storageEnergy = room.storage && room.storage.store.energy || 0;
    let storageExcess = Math.max(0, storageEnergy - 50000);
    let terminalGoal = room.memory.shutdown ? 100000 : 50000;
    
    // Cap the energy goal at the current terminal energy plus the storage excess.
    return Math.min(terminalGoal, room.terminal.store.energy + storageExcess);
  }

  // 10,000 power
  if (resourceType == RESOURCE_POWER)
    return room.memory.shutdown ? 100000 : 10000;
  
  // 5,000 ops
  if (resourceType == RESOURCE_OPS)
    return 5000;

  // 3,000 of anything else.
  return room.memory.shutdown ? 12000 : 3000;
}

StructureTerminal.prototype.getExcess = function() {
  if (!this.my) {
    return _.clone(this.store);
  }

  let excess = {};

  // Special: I (probably) want to unload nothing if I'm a speed-upgrade terminal.
  if (this.servingController) {
    if (this.room.controller.level == 8) {
      return this.store;
    }

    if (this.room.storage &&
      this.room.storage.store.energy < 100000 &&
      this.store.energy > 40000) {
      excess.energy = 1500;
    }
    return excess;
  }

  // Special: I (probably) want to unload nothing if I'm an LW base terminal.
  if (this.room.baseType == 'lw') {
    if (this.room.storage &&
      this.room.storage.store.energy < LW_MIN_STORAGE_ENERGY &&
      this.store.energy > 10000) {
      excess.energy = 800;
    }
    return excess;
  }
  
  for (let resource in this.store) {
    let terminalAmount = this.store[resource];
    let targetAmount = resourceTarget(resource, this.room);

    if (terminalAmount > targetAmount) {
      excess[resource] = terminalAmount - targetAmount;
    }
  }
  
  return excess;
}

StructureTerminal.prototype.getNeed = function() {
  let need = {};

  if (!this.room.activeStorage) return need;
  let room = this.room;
  let storage = room.storage;
  
  // Special: I need nothing if I'm a speed-upgrade terminal.
  if (this.servingController) {
    if (this.room.controller.level == 8)
    {
      return need;
    }
    if (this.store.energy < 25000 &&
      storage.store.energy > 100000) {
      return {energy: 5000};
    }

    need = _.pick(
        storage.store,
        function(value, key) {
          return value >= 100 && key != 'energy'
        })
    return need;
  }

  // Special: In a lw base, I don't need much.
  if (room.baseType == 'lw') {
    // Need anything the storage has that isn't energy.
    need = _.cloneDeep(storage.store);

    // Need a little energy if there's an excess.
    need.energy = 0;

    if (storage.store.energy > LW_MAX_STORAGE_ENERGY ||
        (this.store.energy < LW_MIN_TERMINAL_ENERGY &&
            storage.store.energy > LW_MIN_STORAGE_ENERGY)) {
      need.energy = 800;
    }

    return need;
  }
  
  for (let resource in storage.store) {
    let terminalAmount = this.store[resource] || 0;
    let storageAmount = storage.store[resource] || 0;

    let targetAmount = resourceTarget(resource, room);

    if (targetAmount > terminalAmount) {
      let amount = Math.min(targetAmount - terminalAmount, storageAmount);
      need[resource] = amount;
    }
  }
  
  return need;
}

Object.defineProperty(StructureTerminal.prototype, 'excess', {
  get: function() {
    if (this._excess) {
      return this._excess;
    } else {
      return this._excess = this.getExcess();
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureTerminal.prototype, 'need', {
  get: function() {
    if (this._need) {
      return this._need;
    } else {
      return this._need = this.getNeed();
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

let servingController = {}

Object.defineProperty(StructureTerminal.prototype, 'servingController', {
  get: function() {
    return this.pos.getRangeTo(this.room.controller) == 2;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureTerminal.prototype, 'disruptTicksRemaining', {
  get: function() {
    let effect = _.find(this.effects, e => e.power == PWR_DISRUPT_TERMINAL);

    return (effect && effect.ticksRemaining) || 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureTerminal.prototype, 'hasOperate', {
  get: function() {
    return _.any(this.effects, e => e.power == PWR_OPERATE_TERMINAL);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureTerminal.prototype, 'needsOperate', {
  get: function() {
    return this.room.controller &&
         this.room.isVault &&
         this.room.controller.isPowerEnabled &&
         this.operateTicksRemaining < 30;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureTerminal.prototype, 'operateTicksRemaining', {
  get: function() {
    let effect = _.find(this.effects, e => e.power == PWR_OPERATE_TERMINAL);
  
    return (effect && effect.ticksRemaining) || 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
  });
  