'use strict';

Object.defineProperty(Room.prototype, 'needyExtensions', {
  get: function() {
    if (this._needyExtensions) {
      return this._needyExtensions;
    }

    if (this.energyAvailable == this.energyCapacityAvailable) {
      return this._needyExtensions = [];
    }

    if (this.energyCapacityAvailable - this.energyAvailable == this.spawnEnergyDeficit) {
      return this._needyExtensions = [];
    }

    if (!this.extensions.length) {
      return this._needyExtensions = [];
    }

    let extensionCapacity = this.extensions[0].store.getCapacity(RESOURCE_ENERGY);

    this._needyExtensions =
        _.filter(this.extensions, e => e.store.energy < extensionCapacity);

    return this._needyExtensions;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'needySpawns', {
  get: function() {
    if (this._needySpawns) {
      return this._needySpawns;
    }

    if (!this.spawns.length) {
      return this._needySpawns = [];
    }

    this._needySpawns =
        _.filter(this.spawns, t => t.store.getFreeCapacity(RESOURCE_ENERGY));

    return this._needySpawns;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'needyTowers', {
  get: function() {
    if (this._needyTowers) {
      return this._needyTowers;
    }

    if (!this.activeTowers.length) {
      return this._needyTowers = [];
    }

    this._needyTowers =
        _.filter(this.activeTowers, t => t.store.getFreeCapacity(RESOURCE_ENERGY));

    return this._needyTowers;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'spawnEnergyDeficit', {
  get: function() {
    if (this._spawnEnergyDeficit) {
      return this._spawnEnergyDeficit;
    }

    if (this.energyAvailable == this.energyCapacityAvailable) {
      return this._spawnEnergyDeficit = 0;
    }

    return this.__spawnEnergyDeficit =
        _.sum(this.spawns, s => s.store.getFreeCapacity(RESOURCE_ENERGY));
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
