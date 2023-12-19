'use strict';

let Nav = require('util_nav');


Object.defineProperty(Room.prototype, 'sector', {
  get: function() {
    if (this._sector) {
      return this._sector;
    }

    let sectorName = Nav.getSectorCenter(this.name);

    if (!sectorName) {
      return;
    }

    if (Game.sectors && Game.sectors[sectorName]) {
      return this._sector = Game.sectors[sectorName];
    }

    return this._sector = new Sector(sectorName);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});