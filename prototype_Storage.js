'use strict';

StructureStorage.prototype.mainCargo = function() {
    const obj = this.store;
    let keys = Object.keys(obj);
  
    if (!keys.length) {
      return;
    }
  
    return keys.reduce(function(a, b){ return obj[a] > obj[b] ? a : b });
  }

Object.defineProperty(StructureStorage.prototype, 'hasOperate', {
    get: function() {
        return _.any(this.effects, e => e.power == PWR_OPERATE_STORAGE);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureStorage.prototype, 'needsOperate', {
    get: function() {
        return this.room.controller &&
               this.room.controller.isPowerEnabled &&
               this.operateTicksRemaining < 30 &&
               _.sum(this.store) > STORAGE_CAPACITY * 95 / 100;
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureStorage.prototype, 'operateTicksRemaining', {
  get: function() {
      let effect = _.find(this.effects, e => e.power == PWR_OPERATE_STORAGE);

      return (effect && effect.ticksRemaining) || 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureStorage.prototype, 'servingController', {
  get: function() {
    return this.pos.getRangeTo(this.room.controller) <= 4;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

