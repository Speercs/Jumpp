'use strict';

let craneTowers      = {};
let cacheExpirations = {};

const CACHE_TIMEOUT = 50;
const CACHE_OFFSET  = 4;

function getCacheExpiration(){
    return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}

function checkCache(room) {
    // if cache is expired or doesn't exist
    if(!cacheExpirations[room.name] ||
        !craneTowers[room.name] ||
        cacheExpirations[room.name] < Game.time) {
        cacheExpirations[room.name] = Game.time + getCacheExpiration();
        if (room.cranePosition) {
            craneTowers[room.name] = _.map(room.cranePosition.findInRange(room.towers, 1), 'id');
        }
    }
}

Object.defineProperty(Room.prototype, 'craneTowers', {
    get: function() {
        checkCache(this);
        if (this._craneTowers) {
            return this._craneTowers;
        } else {
            return this._craneTowers = _.map(craneTowers[this.name], Game.getObjectById);
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});
