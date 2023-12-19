'use strict';

Source.prototype.registerRegen = function() {
  let digsiteMem = this.room.memory.digsites &&
      this.room.memory.digsites[this.id];

  if (digsiteMem) {
    digsiteMem._lastRegen = Game.time;
    let sourceLink = Game.getObjectById(digsiteMem.link);
    if (sourceLink && sourceLink == this.room.upgradeLink) {
      this.room.memory._regenUpgradeLinkDigsite = Game.time;
    }
  }
}

Object.defineProperty(Source.prototype, 'diggerPosition', {
  get: function() {
    if (this._diggerPosition) return this._diggerPosition;

    let mem = this.room.memory.digsites && this.room.memory.digsites[this.id];
    if (mem && mem.diggerPosition) {
      return this._diggerPosition =
          this.room.getPositionAt(mem.diggerPosition.x, mem.diggerPosition.y);
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Source.prototype, 'hasRegen', {
    get: function() {
      return _.any(this.effects, e => e.power == PWR_REGEN_SOURCE);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Source.prototype, 'safeToRegen', {
  get: function() {
    if (_.filter(this.room.hostileCreeps, 'boosted').length == 0) return true;
    if (this.room.baseType == 'bunker' &&
        this.room.storage &&
        this.pos.getRangeTo(this.room.storage.pos) < 9) return true;
    // TODO: If the source is within three of a safe tile, mark it safe to regen.
    // Note that this would absorb the bunker case above.
    // Note also that it's okay if this check is a little expensive. It'd only run
    // when boosted hostiles are in the room, which isn't often.

    return false;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Source.prototype, 'needsRegen', {
    get: function() {
      return this.room.controller &&
          this.room.controller.isPowerEnabled &&
          !this.hasRegen &&
          this.safeToRegen;
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Source.prototype, 'container', {
  get: function() {
    if (this._container) return this._container;

    return this._container = this.pos.findInRange(
      FIND_STRUCTURES,
      /* range = */ 1,
      {filter: s => s.structureType == STRUCTURE_CONTAINER})[0];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Source.prototype, 'lair', {
  get: function() {
    if (this._lair) return this._lair;

    let lair = this.pos.findInRange(
      FIND_HOSTILE_STRUCTURES,
      /* range = */ 5,
      {filter: s => s.structureType == STRUCTURE_KEEPER_LAIR})[0];

    lair._source = this;
    return this._lair = lair;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
