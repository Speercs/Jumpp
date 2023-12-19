'use strict';

Object.defineProperty(Room.prototype, 'constructionSites', {
  get: function() {
    if (this._constructionSites) {
      return _.values(this._constructionSites);
    }

    return [];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'myConstructionSites', {
  get: function() {
    if (this._myConstructionSites) {
      return _.values(this._myConstructionSites);
    }

    return this._myConstructionSites = _.filter(this.constructionSites, 'my');
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
