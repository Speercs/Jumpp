'use strict';

Object.defineProperty(Room.prototype, 'nukes', {
    get: function() {
        if (this._nukes) {
            return this._nukes;
        } else if (this.memory.ignoreNukes) {
            return this._nukes = [];
        } else {
            //let fakes = this.find(FIND_FLAGS, {filter: f => f.name.startsWith('nuke')});
            //return this._nukes = this.find(FIND_NUKES).concat(fakes);
            return this._nukes = this.find(FIND_NUKES);
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});
