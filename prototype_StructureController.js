'use strict';

Object.defineProperty(StructureController.prototype, 'maxTicksToDowngrade', {
    get: function() {
        return [undefined, 20000, 10000, 20000, 40000, 80000, 120000, 150000, 200000][this.level];
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});
