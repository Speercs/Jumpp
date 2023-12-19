'use strict';

// room.storageExtensions : Extensions serviced by storage crane.
// room.spawnExtensions: Extension serviced by spawn cranes. (baseType == tigga)
// room.diggerExtensions: Extensions serviced by diggers.
// room.otherExtensions: Extensions to be serviced by loaders.

let roomExtensions = {};

const fieldList = ['storageExtensions', 'spawnExtensions', 'diggerExtensions',
    'craneExtensions', 'otherExtensions'
];

const CACHE_TIMEOUT = 50;
const CACHE_OFFSET  = 4;

function getCacheExpiration() {
    return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}

Room.prototype._checkExtCache = function() {
    if (roomExtensions[this.name] && roomExtensions[this.name].expirationTime > Game.time) {
        return;
    }
    
    // If there's a storage-type crane, storageExtensions are any extensions it
    // can reach.
    let storageCrane = this.find(FIND_MY_CREEPS, {
        filter: c => c.memory.role == 'crane' && c.memory.subRole == 'storage'
    })[0];
    
    let storageExtensions = [];
    if (storageCrane) {
        storageExtensions = storageCrane.pos.findInRange(this.extensions, 1);
    }
    
    // If there's a spawnLink, spawnExtensions are any extensions within 2.
    let spawnExtensions = [];
    if (this.spawnLink) {
        spawnExtensions = this.spawnLink.pos.findInRange(this.extensions, 2);
    }

    let craneExtensions = [];    
    // If there's a crane position, craneExtensions are any extensions within 1.
    if (this.cranePosition) {
        craneExtensions = this.cranePosition.findInRange(this.extensions, 1);
    }

    // Any extensions within 1 of digger positions at source digsites are
    // diggerExtensions.
    let diggerExtensions = [];
    for (let digsiteKey in this.memory.digsites) {
        let digsite = this.memory.digsites[digsiteKey];
        
        if (digsite.sourceId && digsite.diggerPosition) {
            let pos = this.getPositionAt(
                digsite.diggerPosition.x,
                digsite.diggerPosition.y);
            diggerExtensions = _.union(
                diggerExtensions,
                pos.findInRange(this.extensions, 1));
        }
    }
    
    // otherExtensions are everything else.
    let otherExtensions = _.difference(
        this.extensions,
        storageExtensions,
        spawnExtensions,
        craneExtensions,
        diggerExtensions);
        
    roomExtensions[this.name] = {
        storageExtensions: _.map(storageExtensions, 'id'),
        spawnExtensions: _.map(spawnExtensions, 'id'),
        craneExtensions: _.map(craneExtensions, 'id'),
        diggerExtensions: _.map(diggerExtensions, 'id'),
        otherExtensions: _.map(otherExtensions, 'id'),
        expirationTime: Game.time + getCacheExpiration()
    };
}

fieldList.forEach(function(type) {
    Object.defineProperty(Room.prototype, type, {
        get: function() {
            this._checkExtCache();
            if (this['_' + type]) {
                return this['_' + type];
            } else if (roomExtensions[this.name]) {
                return this['_' + type] = roomExtensions[this.name][type].map(Game.getObjectById);
            } else {
                return this['_' + type] = [];
            }
        },
        set: function(){},
        enumerable: false,
        configurable: true,
    });
});

