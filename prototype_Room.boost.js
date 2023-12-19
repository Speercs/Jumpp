'use strict';

let lastPrune = {};

function pruneBoostQueue(room) {
  if (!room.memory._boostQueue) {
    room.memory._boostQueue = [];
  }

  if (lastPrune[room.name] == Game.time) {
    return;
  }

  lastPrune[room.name] = Game.time;

  room.memory._boostQueue = _.filter(room.memory._boostQueue, function(id) {
    let creep = Game.getObjectById(id);
    return creep && _.any(creep.neededBoosts);
  });
}

let lastSort = {};

function sortBoostQueue(room) {
  if (lastSort[room.name] == Game.time) {
    return;
  }

  lastSort[room.name] = Game.time;

  pruneBoostQueue(room);

  room.memory._boostQueue = _.sortBy(room.memory._boostQueue, function (id) {
    let creep = Game.getObjectById(id);
    return creep.ticksToSpawn + creep.pos.getRangeTo(room.boostPos[0]);
  });
}

const MAX_POSSIBLE_BOOST_ENERGY = LAB_BOOST_ENERGY * 50;

Room.prototype.nextBoost = function() {
  pruneBoostQueue(this);

  if (!this.memory._boostQueue.length) {
    return;
  }

  let headCreep = Game.getObjectById(this.memory._boostQueue[0]);
  if (!headCreep) {
    // This really shouldn't happen. pruneBoostQueue removes invalid ids.
    throw `Room ${this.name} has an invalid creep in the boost queue`;
  }

  if (this.boostLab.energy < MAX_POSSIBLE_BOOST_ENERGY) {
    // lab is starving for energy. Top it up.
    let resourceType = RESOURCE_ENERGY;
    let amount = this.boostLab.energyCapacity - this.boostLab.energy;
    return {resourceType, amount};
  }

  if (!this.boostLab.mineralAmount) {
    // lab is empty. return the largest boost the head creep needs.
    let resourceType = headCreep.largestNeededBoost;
    let amount = headCreep.neededBoosts[resourceType];
    return {resourceType, amount};
  }

  // Lab has something. How much of that thing does the head creep want?
  let amountDesired = headCreep.neededBoosts[this.boostLab.mineralType] || 0;

  if (amountDesired == this.boostLab.mineralAmount) {
    // Lab has enough for headCreep's next boost. What's after that?
    if (_.keys(headCreep.neededBoosts).length > 1) {
      // Head creep will need more boosts. Return the next biggest.
      let resourceType = headCreep.secondLargestNeededBoost;
      let amount = headCreep.neededBoosts[resourceType];
      return {resourceType, amount};
    } else if (this.memory._boostQueue.length > 1) {
      // Head creep is done, but there's another queued up. Return his biggest.
      let secondCreep = Game.getObjectById(this.memory._boostQueue[1]);
      let resourceType = secondCreep.largestNeededBoost;
      let amount = secondCreep.neededBoosts[resourceType];
      return {resourceType, amount};
    } else {
      // No further boosts needed.
      return;
    }
  } else {
    // Wrong amount. Add or remove some.
    return {
      resourceType: this.boostLab.mineralType,
      amount: amountDesired - this.boostLab.mineralAmount
    };
  }
}

/**
 * Returns estimated ticks until the boostLab will be asked to boost.
 */
Room.prototype.ticksUntilBoost = function() {
  if (!this.nextBoost()) {
    return Infinity;
  }
  
  let headCreep = Game.getObjectById(this.memory._boostQueue[0]);
  return headCreep.ticksToSpawn + headCreep.pos.getRangeTo(this.boostPos[0]);
}

Room.prototype.requestBoost = function(creep) {
  if (!this.boostLab || !this.boostPos) {
    return ERR_FAILED_PRECONDITION;
  }

  if (!_.any(creep.neededBoosts)) {
    return ERR_FAILED_PRECONDITION;
  }

  sortBoostQueue(this);

  if (!this.memory._boostQueue.includes(creep.id)) {
    this.memory._boostQueue.push(creep.id);
  }

  let index = _.indexOf(this.memory._boostQueue, creep.id);

  if (!index &&
      !this.boostLab.cooldown &&
      this.boostLab.mineralType &&
      creep.neededBoosts[this.boostLab.mineralType] &&
      this.boostLab.mineralAmount >= creep.neededBoosts[this.boostLab.mineralType] &&
      creep.pos.isNearTo(this.boostLab)) {
    let result = this.boostLab.boostCreep(creep);
  }

  if (this.boostPos && index <= this.boostPos.length) {
    return this.boostPos[index];
  }
}

let boostLabCache = {};

function lookupBoostLab(room) {
  // Choose a cache key such that we'll repeat this computation if a storage, terminal, or lab
  // is added or destroyed.
  let cacheKey = room.name +
      (room.terminal && room.terminal.id || ``) +
      (room.storage && room.storage.id || ``) +
      room.labs.length;

  if (boostLabCache[cacheKey]) {
    let lab = Game.getObjectById(boostLabCache[cacheKey]);
    if (lab) {
      return lab;
    }
  }
}

function deriveBoostLab(room) {
  // N.B. Do not derive this from boostLoaderPos. boostLoaderPos may derive from boostLab.
  if (room.memory.boostLab) {
    let lab = Game.getObjectById(room.memory.boostLab);
    if (lab) {
      return lab;
    }
  }

  if (room.courierIdlePos &&
      room.terminal &&
      room.courierIdlePos.isNearTo(room.terminal)) {
    let labsInRange = room.courierIdlePos.findInRange(room.labs, 1);
    if (labsInRange.length == 1) {
      return labsInRange[0];
    }

    let rampartedLabsInRange = _.filter(labsInRange, lab => !lab.naked);
    if (rampartedLabsInRange.length == 1) {
      return rampartedLabsInRange[0];
    }
  }

  let labsWithinTwoOfTerminal = room.terminal && room.terminal.pos.findInRange(room.labs, 2);
  if (labsWithinTwoOfTerminal && labsWithinTwoOfTerminal.length == 1) {
    return labsWithinTwoOfTerminal[0];
  }
}

Object.defineProperty(Room.prototype, 'boostLab', {
  get: function() {
      if (this._boostLab) {
          return this._boostLab;
      }

      let lab = lookupBoostLab(this);
      if (lab) {
        return this._boostLab = lab;
      }

      return this._boostLab = deriveBoostLab(this);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function deriveBoostloaderPos(room) {
  if (room.memory.boostloaderPos) {
    return _.map(room.memory.boostloaderPos, p => room.getPositionAt(p.x, p.y));
  }

  if (room.courierIdlePos &&
      room.boostLab &&
      room.courierIdlePos.isNearTo(room.boostLab) &&
      room.terminal &&
      room.courierIdlePos.isNearTo(room.terminal)) {
    return [room.courierIdlePos];
  }

  if (room.terminal &&
      room.terminal.servingController &&
      room.boostLab &&
      room.boostLab.pos.getRangeTo(room.terminal) == 2) {
    return [room.getPositionAt((room.terminal.pos.x + room.boostLab.pos.x) >> 1,
      (room.terminal.pos.y + room.boostLab.pos.y) >> 1)];
  }

  return [];
}

Object.defineProperty(Room.prototype, 'boostloaderPos', {
    get: function() {
        if (this._boostloaderPos) {
            return this._boostloaderPos;
        }

        return this._boostloaderPos = deriveBoostloaderPos(this);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

function deriveBoostPos(room) {
  if (room.memory.boostPos) {
    return _.map(room.memory.boostPos, p => room.getPositionAt(p.x, p.y));
  }

  if (room.baseType == 'bunker' &&
      room.courierIdlePos &&
      room.terminal &&
      !room.terminal.servingController &&
      room.storage) {
    let storageToTerminalDir = room.storage.pos.getDirectionTo(room.terminal);
    let boostPos = [room.terminal.pos.oneStep(storageToTerminalDir)];
    let zeroToIdleDir = boostPos[0].getDirectionTo(room.courierIdlePos);
    let terminalToIdleDir = room.terminal.pos.getDirectionTo(room.courierIdlePos);
    boostPos.push(boostPos[0].oneStep(zeroToIdleDir));
    boostPos.push(boostPos[1].oneStep(terminalToIdleDir));
    return boostPos;
  }

  if (room.terminal &&
      room.terminal.servingController &&
      room.boostLab &&
      room.boostloaderPos.length) {
    let terminalToLabDir = room.terminal.pos.getDirectionTo(room.boostLab);
    let boostPos = [room.boostLab.pos.oneStep(terminalToLabDir)];
    boostPos.push(boostPos[0].oneStep(terminalToLabDir));
    boostPos.push(boostPos[1].oneStep(terminalToLabDir));
    return boostPos;
  }

  return [];
}

Object.defineProperty(Room.prototype, 'boostPos', {
  get: function() {
      if (this._boostPos) {
          return this._boostPos;
      }

      return this._boostPos = deriveBoostPos(this);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Room.prototype.requestUnboost = function(creep) {
  if (Game.getObjectById(creep.memory._unboostLabId)) {
    return OK;
  }

  if (!this.ownedCreeps.includes(creep)) {
    this.logError(`${creep.name} can't schedule unboost at a room that doesn't own it.`)
    return ERR_FAILED_PRECONDITION;
  }

  let availableLabs = _.filter(
      this.labs,
      l => l != this.boostLab && !l.creepToUnboost && l.cooldown < creep.totalTicksToLive);

  let lab  = _.find(availableLabs, 'sourceLab');

  if (!lab) {
    lab = _.find(availableLabs);
  }

  if (!lab) {
    return ERR_FAILED_PRECONDITION;
  }

  creep.memory._unboostLabId = lab.id;
  creep._unboostLab = lab;
  lab._creepToUnboost = creep;
  return OK;
}

Room.prototype.setUnboosts = function() {
  if (this._unboostsAreSet) {
    return;
  }

  let creeps = _.filter(this.ownedCreeps, c => c.memory._unboostLabId);
  for (let creep of creeps) {
    let lab = Game.getObjectById(creep.memory._unboostLabId);
    if (lab) {
      creep._unboostLab = lab;
      lab._creepToUnboost = creep;
    }
  }

  this._unboostsAreSet = true;
}