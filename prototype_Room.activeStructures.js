'use strict';

Object.defineProperty(Room.prototype, 'activeExtensions', {
    get: function() {
        if (this._activeExtensions) {
            return this._activeExtensions;
        } else {
            return this._activeExtensions = _.filter(this.extensions, t => t.active);
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'activeStorage', {
    get: function() {
        if (this._activeStorage) {
            return this._activeStorage;
        } else {
            if (this.storage && this.storage.active) {
                return this._activeStorage = this.storage;
            }
            return this._activeStorage = null;
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'activeTerminal', {
    get: function() {
        if (this._activeTerminal) {
            return this._activeTerminal;
        } else {
            if (this.terminal && this.terminal.active) {
                return this._activeTerminal = this.terminal;
            }
            return this._activeTerminal = null;
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'activeTowers', {
    get: function() {
        if (this._activeTowers) {
            return this._activeTowers;
        } else if (this.towers.length <= this.maxTowers) {
            return this._activeTowers = this.towers;
        } else {
            return this._activeTowers = _.filter(this.towers, t => t.active);
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});