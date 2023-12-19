'use strict';

// room.sourceContainers : Containers filled by source diggers.
// room.spawnContainers : Containers in the spawn blocks of tigga bases.

let Links = require('util_links');

const singleFieldList = ['storageLink', 'upgradeLink', 'spawnLink'];

singleFieldList.forEach(function(type) {
  Object.defineProperty(Room.prototype, type, {
    get: function() {
      if (this['_' + type]) {
        return this['_' + type];
      }

      let id = Links.getLinkId(this, type);
      return this['_' + type] = id && Game.getObjectById(id);
    },
    set: function(){},
    enumerable: false,
    configurable: true,
  });
});

Object.defineProperty(Room.prototype, 'digsiteLinks', {
  get: function() {
    if (this._digsiteLinks) {
      return this._digsiteLinks;
    }

    return this._digsiteLinks = _.map(Links.getDigsiteLinkIds(this), Game.getObjectById);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'dropLinks', {    
  get: function() {
    if (this._dropLinks) {
      return this._dropLinks;
    }

    return this._dropLinks = _.map(Links.getDropLinkIds(this), Game.getObjectById);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
