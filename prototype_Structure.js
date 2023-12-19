'use strict';

Object.defineProperty(Structure.prototype, 'effectiveHits', {
  get: function() {
    if (this._effectiveHits) {
      return this._effectiveHits;
    }

    if (!this.room.nukes.length) {
      return this._effectiveHits = this.hits;
    }

    // No point discounting by nukeDamage if we can't build it up further.
    if (this.hits == this.hitsMax) {
      return this._effectiveHits = this.hits;
    }

    if (this.structureType == STRUCTURE_RAMPART &&
        [TILE_CRITICAL_WALL, TILE_KEEP].includes(this.tileType)) {
      return this._effectiveHits = this.hits - this.nukeDamageIncoming;
    }

    return this._effectiveHits = this.hits;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Structure.prototype, 'naked', {
  get: function() {
    if (this._naked) {
      return this._naked;
    } else {
      return this._naked = this.structureType == STRUCTURE_RAMPART || !this.pos.hasRampart();
    }
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

let nukeDamageCache = {};
let nukeDamageCacheExpiration = {};

const CACHE_TIMEOUT = 20;
const CACHE_OFFSET  = 5;

function getCacheExpiration(){
  return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}

Structure.prototype._checkNukeDamageCache = function() {
  if (nukeDamageCache[this.id] &&
    nukeDamageCacheExpiration[this.id] &&
    nukeDamageCacheExpiration[this.id] < Game.time) {
    return;
  }
  
  let nukesWithinTwo = this.pos.findInRange(this.room.nukes, 2);
  
  let nukesWithinZero = this.pos.findInRange(nukesWithinTwo, 0);
  
  let groundZero = nukesWithinZero.length;
  let blast = nukesWithinTwo.length - nukesWithinZero.length;

  nukeDamageCache[this.id] = groundZero * NUKE_DAMAGE[0] + blast * NUKE_DAMAGE[2];
  nukeDamageCacheExpiration[this.id] = Game.time + getCacheExpiration();
}

Object.defineProperty(Structure.prototype, 'nukeDamageIncoming', {
  get: function() {
    this._checkNukeDamageCache();
    if (this._nukeDamageIncoming) {
      return this._nukeDamageIncoming;
    } else if (nukeDamageCache[this.id] != undefined) {
      return this._nukeDamageIncoming = nukeDamageCache[this.id];
    } else {
      return this._nukeDamageIncoming = undefined;
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Structure.prototype, 'tileType', {
  get: function() {return this.pos.tileType;},
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Structure.prototype, 'collapseTicksRemaining', {
  get: function() {
    let effect = _.find(this.effects, e => e.effect == EFFECT_COLLAPSE_TIMER);

    return (effect && effect.ticksRemaining) || 0;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});
