'use strict';

Tombstone.prototype.mainCargo = function() {
    const obj = this.store;
    return Object.keys(obj).reduce(function(a, b){ return obj[a] > obj[b] ? a : b });
}
