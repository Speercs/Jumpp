'use strict';

Object.defineProperty(StructureLab.prototype, 'availableForUnboost', {
  get: function() {
    return this.room.boostLab != this && !this.cooldown;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'reactionAmount', {
  get: function() {
    return 5;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'servingController', {
  get: function() {
    return this.room.terminal &&
        this.room.terminal.servingController &&
        this.room.terminal.active &&
        this.pos.getRangeTo(this.room.terminal) == 2;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'destLab', {
  get: function() {
    if (this._destLab) return this._destLab;
    return this._destLab = this.room.destLabs.includes(this);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'sourceLab', {
  get: function() {
    if (this._sourceLab) return this._sourceLab;
    return this._sourceLab = this.room.sourceLabs.includes(this);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'otherSourceLab', {
  get: function() {
    if (this._otherSourceLab) return this._otherSourceLab;

    if (this.sourceLab && this.room.sourceLabs.length == 2) {
      let myIndex = _.indexOf(this.room.sourceLabs, this);
      return this._otherSourceLab = this.room.sourceLabs[myIndex^1];
    }

    return this._otherSourceLab = null;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'creepToUnboost', {
  get: function() {
    this.room.setUnboosts();
    return this._creepToUnboost;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function setDestLabExcessReverse(lab) {
  let labMemory = lab.room.memory.labs;
  let order0 = labMemory.orders[0];
  let desiredMineral = order0.resourceType;
  let numDestLabs = lab.room.destLabs.length;
  let perLabDesiredAmount = _.ceil(order0.amount / numDestLabs);
  let perLabRoundAmount = _.ceil(perLabDesiredAmount / 5) * 5;
  let desiredAmount = Math.min(LAB_MINERAL_CAPACITY, perLabRoundAmount);
  let reactionTime = REACTION_TIME[desiredMineral];
  let eligibleDestLabs = _(lab.room.destLabs).filter(l => l.cooldown < reactionTime).value();
  let destLabIndex = _.indexOf(eligibleDestLabs, lab);
  if (destLabIndex < 0) {
    // Lab has long cooldown and isn't available. Get rid of everything.
    lab._excessMinerals = lab.mineralAmount;
    lab._neededMinerals = 0;
    lab._urgent = true;
    return;
  }
  let lotsRemaining = order0.amount / 5;
  if (lotsRemaining < destLabIndex+1) {
    desiredAmount = 0;
  }

  if (lab.mineralAmount && lab.mineralType != desiredMineral) {
    // Lab has bad stuff. Mark it unwanted.
    lab._excessMinerals = lab.mineralAmount;
    lab._neededMinerals = 0;
    lab._urgent = true;
  } else if (lab.mineralAmount > desiredAmount) {
    // Lab has good stuff, but too much. (Could happen if the order is nearly done)
    lab._excessMinerals = lab.mineralAmount;
    lab._neededMinerals = 0;
    lab._urgent = true;
  } else if (lab.mineralType == desiredMineral) {
    // Lab has good stuff. Update the desired amount.
    lab._excessMinerals = 0;
    lab._neededMinerals = Math.max(0, desiredAmount - lab.mineralAmount);
    lab._neededMineralType = desiredMineral;
    if (desiredAmount < LAB_MINERAL_CAPACITY) {
      // This is the last load. Mark it urgent so it doesn't get
      // overlooked even if it's small.
      lab._urgent = true;
    }
  } else {
    // Lab has no minerals. Set the desired amount.
    lab._neededMineralType = desiredMineral;
    lab._excessMinerals = 0;
    lab._neededMinerals = desiredAmount;
    if (desiredAmount < LAB_MINERAL_CAPACITY) {
      // This is the last load. Mark it urgent so it doesn't get
      // overlooked even if it's small.
      lab._urgent = true;
    }
  }
}

function setDestLabExcess(lab) {
  let labMemory = lab.room.memory.labs;
  let order0 = labMemory.orders[0];

  if (order0.reverse) {
    return setDestLabExcessReverse(lab);
  }

  lab._excessMinerals = lab.mineralAmount;
  lab._neededMinerals = 0;
  if (lab.mineralType != order0.resourceType) {
    lab._urgent = true;
  }
}

function setSourceLabExcessReverse(lab) {
  // Excess is whatever I'm holding.
  lab._excessMinerals = lab.mineralAmount;
  lab._neededMinerals = 0;

  // Urgent excess if I'm holding something that isn't a result, or I'm holding the same thing as the other source lab.
  let labMemory = lab.room.memory.labs;
  let order0 = labMemory.orders[0];
  let recipe = RECIPES[order0.resourceType];

  if (!recipe.includes(lab.mineralType) || lab.mineralType == lab.otherSourceLab.mineralType) {
    lab._urgent = true;
  }
}

function setSourceLabExcess(lab) {
  let labMemory = lab.room.memory.labs;
  let srcLabIndex = _.indexOf(lab.room.sourceLabs, lab);
  let order0 = labMemory.orders[0];

  if (lab == lab.room.boostLab &&
      lab.mineralAmount &&
      lab.room.memory._boostQueue.length) {
    let boostie = Game.getObjectById(lab.room.memory._boostQueue[0]);
    let resourceType = boostie && boostie.largestNeededBoost;
    if (resourceType == lab.mineralType) {
      lab._excessMinerals = 0;
      lab._neededMinerals = 0;
      return;
    }
  }

  if (order0.reverse) {
    return setSourceLabExcessReverse(lab);
  }

  let recipe = RECIPES[order0.resourceType];
  let desiredAmount = Math.min(LAB_MINERAL_CAPACITY, order0.amount);
  let desiredMineral = recipe[srcLabIndex];
  if (lab.mineralAmount && lab.mineralType != desiredMineral) {
    // Lab has bad stuff. Mark it unwanted.
    lab._excessMinerals = lab.mineralAmount;
    lab._neededMinerals = 0;
    lab._urgent = true;
  } else if (lab.mineralType == desiredMineral) {
    // Lab has good stuff. Update the desired amount.
    lab._excessMinerals = 0;
    lab._neededMinerals = Math.max(0, desiredAmount - lab.mineralAmount);
    lab._neededMineralType = desiredMineral;
    if (desiredAmount < LAB_MINERAL_CAPACITY) {
      // This is the last load. Mark it urgent so it doesn't get
      // overlooked even if it's small.
      lab._urgent = true;
    }
  } else {
    // Lab has no minerals. Set the desired amount.
    lab._neededMineralType = desiredMineral;
    lab._excessMinerals = 0;
    lab._neededMinerals = desiredAmount;
    if (desiredAmount < LAB_MINERAL_CAPACITY) {
      // This is the last load. Mark it urgent so it doesn't get
      // overlooked even if it's small.
      lab._urgent = true;
    }
  }
  return;
}

function setExcess(lab) {
  let labMemory = lab.room.memory.labs;

  lab._urgent = false;

  if (!labMemory ||
      !labMemory.execute ||
      !labMemory.orders ||
      !labMemory.orders.length ||
      lab.room.sourceLabs.length < 2 ||
      !lab.my ||
      !lab.active) {
    if (lab == lab.room.boostLab &&
        lab.mineralAmount &&
        lab.room.memory._boostQueue.length) {
      let boostie = Game.getObjectById(lab.room.memory._boostQueue[0]);
      let resourceType = boostie && boostie.largestNeededBoost;
      if (resourceType == lab.mineralType) {
        lab._excessMinerals = 0;
        lab._neededMinerals = 0;
        return;
      }
    }

    lab._excessMinerals = lab.mineralAmount;
    lab._neededMinerals = 0;
    if (lab.mineralAmount) {
      lab._urgent = true;
    }
    return;
  }

  if (lab.destLab) {
    return setDestLabExcess(lab);
  }

  if (lab.sourceLab) {
    return setSourceLabExcess(lab);
  }

  // Boost lab. Or maybe some error.
  lab._excessMinerals = 0;
  lab._neededMinerals = 0;
}

Object.defineProperty(StructureLab.prototype, 'excessMinerals', {
  get: function() {
    if (this._excessMinerals) return this._excessMinerals;

    setExcess(this);

    return this._excessMinerals;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'neededMinerals', {
  get: function() {
    if (this._neededMinerals) return this._neededMinerals;

    setExcess(this);

    return this._neededMinerals;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'neededMineralType', {
  get: function() {
    if (this._neededMineralType) return this._neededMineralType;

    setExcess(this);

    return this._neededMineralType;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'urgent', {
  get: function() {
    if (this._urgent) return this._urgent;

    setExcess(this);

    return this._urgent;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

