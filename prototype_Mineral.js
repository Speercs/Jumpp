'use strict';

Object.defineProperty(Mineral.prototype, 'container', {
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

Object.defineProperty(Mineral.prototype, 'lair', {
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
