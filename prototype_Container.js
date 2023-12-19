'use strict';

Object.defineProperty(StructureContainer.prototype, 'hasUnwantedMinerals', {
  get: function() {
    return (_.sum(this.store) > this.store.energy) &&
        (!this.room.mineralContainer || this.id != this.room.mineralContainer.id);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureContainer.prototype, 'hostile', {
  get: function() {
    return this.room.hostile;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureContainer.prototype, 'invader', {
  get: function() {
    return _.any(this.effects, e => e.effect == EFFECT_COLLAPSE_TIMER);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureContainer.prototype, 'isSourceContainer', {
  get: function() {
    if (this._isSourceContainer != undefined) {
      return this._isSourceContainer;
    }

    if (!this.room.memory.digsites) {
      return this._isSourceContainer = false;
    }

    let sourceIds = _.keys(this.room.memory.digsites);
    let sourceContainerIds = _.map(sourceIds, s => this.room.memory.digsites[s].container);
    return this._isSourceContainer = sourceContainerIds.includes(this.id);

  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureContainer.prototype, 'playerSKcontainer', {
  get: function() {
    return this.room.name.isCenterNine() && !this.invader;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

StructureContainer.prototype.mainCargo = function() {
  const obj = this.store;
  let keys = Object.keys(obj);

  if (!keys.length) {
    return;
  }

  return keys.reduce(function(a, b){ return obj[a] > obj[b] ? a : b });
}

StructureContainer.prototype.leastCargo = function() {
  const obj = this.store;
  let keys = Object.keys(obj);

  if (!keys.length) {
    return;
  }

  return keys.reduce(function(a, b){ return obj[a] < obj[b] ? a : b });
}