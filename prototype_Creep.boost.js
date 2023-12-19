'use strict';

Creep.prototype.doBoost = function() {
  if (!_.any(this.neededBoosts)) {
    return OK;
  }

  if (!this.room.activeTerminal || !this.room.boostLab) {
    return OK;
  }

  let pos = this.room.requestBoost(this);

  if (this.hasParts(MOVE)) {
    this.travelTo2(pos, {range:0});
  } else {
    if (!this.pos.isEqualTo(pos)) {
      this.destination = {pos: pos, range:0};
    }
  }
  return !OK;
}

Creep.prototype.requestBoost = function(resourceType, numBodies) {
  if (!numBodies) {
    return;
  }

  if (!this.memory._requestedBoosts) {
    this.memory._requestedBoosts = {};
  }

  this.memory._requestedBoosts[resourceType] = numBodies * LAB_BOOST_MINERAL;
}

function getLikelyBoostFromBodyType(bodyType, creep) {
  switch (bodyType) {
    case MOVE:
      return 'XZHO2';
    case WORK:
      switch (creep.memory.role) {
        case 'builder':
        case 'queen':
          return 'XLH2O';
        case 'settler':
        case 'upgrader':
          return 'XGH2O';
        case 'dismantler':
        case 'wrecker':
          return 'XZH2O';
        case 'miner':
          return 'XUHO2';
        default:
          creep.logError(`I can't figure out what kind of boost my WORK parts needs.`);
          return;
      }
    case CARRY:
      return 'XKH2O';
    case ATTACK:
      return 'XUH2O';
    case RANGED_ATTACK:
      return 'XKHO2';
    case HEAL:
      return 'XLHO2';
    case TOUGH:
      return 'XGHO2';
    default:
      return;
  }
}

Creep.prototype.requestAllBoosts = function() {
  if (!this.memory._requestedBoosts) {
    this.memory._requestedBoosts = {};
  }

  let bodyCounts = _(this.body).map('type').countBy().value();

  for (let bodyType in bodyCounts) {
    let resourceType = getLikelyBoostFromBodyType(bodyType, this);
    if (resourceType) {
      this.memory._requestedBoosts[resourceType] = bodyCounts[bodyType] * LAB_BOOST_MINERAL;
    }
  }

  return OK;
}

Object.defineProperty(Creep.prototype, 'largestNeededBoost', {
  get: function() {
    const needed = this.neededBoosts;

    if (!_.any(needed)) {
      return;
    }

    if (this._largestNeededBoost) {
      return this._largestNeededBoost;
    }

    return this._largestNeededBoost = _(needed).keys().sort().first();
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'secondLargestNeededBoost', {
  get: function() {
    const needed = this.neededBoosts;

    if (_.keys(needed).length < 2) {
      return;
    }

    if (this._secondLargestNeededBoost) {
      return this._secondLargestNeededBoost;
    }

    return this._secondLargestNeededBoost = _(needed).keys().sort().value()[1];
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'appliedBoosts', {
  get: function() {
    if (this._appliedBoosts) {
      return this._appliedBoosts;
    }

    return this._appliedBoosts = _(this.body).map('boost').compact().countBy().value();
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'neededBoosts', {
  get: function() {
    if (this._neededBoosts) {
      return this._neededBoosts;
    }

    this._neededBoosts = {};
    for (let resourceType in this.requestedBoosts) {
      let amountApplied = (this.appliedBoosts[resourceType] * LAB_BOOST_MINERAL) || 0;
      let amountNeeded = this.requestedBoosts[resourceType] - amountApplied;
      if (amountNeeded > 0) {
        this._neededBoosts[resourceType] = amountNeeded;
      }
    }

    return this._neededBoosts;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'requestedBoosts', {
  get: function() {
    if (this._requestedBoosts) {
      return this._requestedBoosts;
    }

    if (this.memory._requestedBoosts) {
      return this._requestedBoosts = _.clone(this.memory._requestedBoosts);
    }

    return this._requestedBoosts = {};
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'noBoostsRequested', {
  get: function() {
    return !_.any(this.memory._requestedBoosts);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Creep.prototype, 'unboostLab', {
  get: function() {
    this.room.setUnboosts();
    return this._unboostLab;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});
