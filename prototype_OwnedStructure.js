'use strict';

let isActiveValues           = {};
let roomLevels               = {};

Object.defineProperty(OwnedStructure.prototype, '__active', {
    get: function() {
        if (this._active != undefined) {
            return this._active;
        }

        // Any structure in a room without a controller is active. These are NPC structures which
        // don't depend on room ownership to operate.
        if (!this.room.controller) {
            return this._active = true;
        }

        if (roomLevels[this.id] == this.room.controller.level) {
            return this._active = isActiveValues[this.id];
        }
        
        this._active = this.isActive();
        roomLevels[this.id] = this.room.controller.level;
        return isActiveValues[this.id] = this._active;
    },
    set: function() {},
    enumerable: false,
    configurable: false,
});

Object.defineProperty(OwnedStructure.prototype, 'active', {
    get: function() {
        return this.__active;
    },
    set: function() {},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(OwnedStructure.prototype, 'hostile', {
    get: function() {return !this.my && !isFriendly(this.owner.username)},
    set: function() {},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(OwnedStructure.prototype, 'invader', {
    get: function() {return this.owner.username == 'Invader'},
    set: function() {},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(OwnedStructure.prototype, 'npc', {
    get: function() {return _.includes(NPCS, this.owner.username);},
    set: function() {},
    enumerable: false,
    configurable: true,
});
