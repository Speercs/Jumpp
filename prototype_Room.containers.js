'use strict';

// room.sourceContainers : Containers filled by source diggers.
// room.spawnContainers : Containers in the spawn blocks of tigga bases.

let roomContainers = {};

const fieldList = ['sourceContainers', 'spawnContainers', 'extensionContainers'];

const CACHE_TIMEOUT = 500;
const CACHE_OFFSET  = 4;

function getCacheExpiration() {
    return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}

Room.prototype._checkContainerCache = function() {
    if (roomContainers[this.name] && roomContainers[this.name].expirationTime > Game.time) {
        return;
    }
    
    // Any containers within 1 of sources are sourceContainers.
    let sources = this.find(FIND_SOURCES);
    let sourceContainers = _.filter(
        this.containers,
        c => c.pos.findInRange(sources, 1).length);

    // If there's a spawnLink, spawnContainers are any containers within 2.
    let spawnContainers = [];
    if (this.spawnLink) {
        spawnContainers = this.spawnLink.pos.findInRange(this.containers, 2);
    }
    
    // If there are containers within 3 of the controller, the one nearest the
    // controller is the upgradeContainer.
    let upgradeContainer;
    if (this.controller) {
        upgradeContainer = this.controller.pos.findClosestInRange(this.containers, 3);
    }

    // Extension containers are any containers that are within 3 of the controller and
    // exactly two spaces away from:
    //   a controller in servingController mode OR
    //   a storage
    let extensionContainers = _.filter(
        this.containers,
        c => c.pos.getRangeTo(c.room.controller) <= 3 &&
            ((c.room.terminal &&
                c.room.terminal.servingController &&
                c.pos.getRangeTo(c.room.terminal) == 2) ||
            (c.room.storage && c.pos.getRangeTo(c.room.storage) == 2)));
    
    // otherContainers are everything else.
    let otherContainers = _.difference(
        this.containers,
        sourceContainers,
        spawnContainers,
        extensionContainers,
        [upgradeContainer]);
        
    roomContainers[this.name] = {
        extensionContainers: _.map(extensionContainers, 'id'),
        sourceContainers: _.map(sourceContainers, 'id'),
        spawnContainers: _.map(spawnContainers, 'id'),
        upgradeContainer: upgradeContainer && upgradeContainer.id,
        otherContainers: _.map(otherContainers, 'id'),
        expirationTime: Game.time + getCacheExpiration()
    };
}

fieldList.forEach(function(type) {
    Object.defineProperty(Room.prototype, type, {
        get: function() {
            this._checkContainerCache();
            if (this['_' + type]) {
                return this['_' + type];
            } else if (roomContainers[this.name]) {
                return this['_' + type] = _.compact(roomContainers[this.name][type].map(Game.getObjectById));
            } else {
                return this['_' + type] = [];
            }
        },
        set: function(){},
        enumerable: false,
        configurable: true,
    });
});

Object.defineProperty(Room.prototype, 'upgradeContainer', {
    get: function() {
        this._checkContainerCache();
        if (this._upgradeContainer) {
            return this._upgradeContainer;
        } else if(roomContainers[this.name] && roomContainers[this.name].upgradeContainer) {
            return this._upgradeContainer = Game.getObjectById(roomContainers[this.name].upgradeContainer);
        } else {
            return this._upgradeContainer = undefined;
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});
