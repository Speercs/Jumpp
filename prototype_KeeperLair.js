'use strict';

Object.defineProperty(StructureKeeperLair.prototype, 'source', {
  get: function() {
    if (this._source) return this._source;

    let source = this.pos.findInRange(FIND_SOURCES, 5)[0] ||
        this.pos.findInRange(FIND_MINERALS, 5)[0]

    if (source) {
      source._lair = this;
    }

    return this._source = source;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureKeeperLair.prototype, 'keeper', {
  get: function() {
    if (this._keeper) return this._keeper;

    let guardName = 'Keeper' + this.id;
    return this._keeper =
        this.room.find(FIND_HOSTILE_CREEPS, {filter: c => c.name == guardName})[0];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

let likelyPaths = {};

// WHOA! This depends on where my creeps are at the moment when I ask? How is that possible?
// Its callback shouldn't be checking that, should it?
Object.defineProperty(StructureKeeperLair.prototype, 'likelyPath', {
  get: function() {
    if (this._likelyPath) return this._likelyPath;

    if (!likelyPaths[this.id]) {
      let result = PathFinder.search(
          this.pos,
          {pos: this.source.pos, range:1},
          {maxRooms:1, plainCost:2, swampCost:10});
      if (!result.path.length || result.incomplete) {
        this.room.logError(`Can't predict path for lair. This should never happen.`);
      }
      likelyPaths[this.id] = result.path;
    }

    likelyPaths[this.id].unshift(this.pos);
    return this._likelyPath = likelyPaths[this.id];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
