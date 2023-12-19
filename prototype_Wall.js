'use strict';

Object.defineProperty(StructureWall.prototype, 'hitsTarget', {
    get: function() {
        return WALL_TARGETS.get(this.tileType);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

const LOW_RAMPART_HITS = 100000;

Object.defineProperty(StructureRampart.prototype, 'low', {
    get: function() {
        return this.hits < LOW_RAMPART_HITS;
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureRampart.prototype, 'ticksToLow', {
    get: function() {
        if (this._ticksToLow) {
            return this._ticksToLow;
        }

        if (this.low) {
            return this._ticksToLow = 0;
        }

        let decayCyclesToGetLow = _.ceil((this.hits + 1 - LOW_RAMPART_HITS) / RAMPART_DECAY_AMOUNT);
        return this._ticksToLow = this.ticksToDecay + (RAMPART_DECAY_TIME - 1) * (decayCyclesToGetLow - 1);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureRampart.prototype, 'hitsTarget', {
    get: function() {
        let multiplier = (this.room.memory.rampartMultipliers && this.room.memory.rampartMultipliers[this.tileType]) || 1;
        return Math.min(WALL_TARGETS.get(this.tileType) * multiplier, this.hitsMax);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureWall.prototype, 'scaledHits', {
    get: function() {
        return this.effectiveHits * WALL_SCALE.get(this.tileType);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureRampart.prototype, 'scaledHits', {
    get: function() {
        return this.effectiveHits * WALL_SCALE.get(this.tileType);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureWall.prototype, 'simpleScaledHits', {
    get: function() {
        return this.hits * WALL_SCALE.get(this.tileType);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureRampart.prototype, 'simpleScaledHits', {
    get: function() {
        return this.hits * WALL_SCALE.get(this.tileType);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});
