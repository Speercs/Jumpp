'use strict';

Object.defineProperty(Store.prototype, 'mostValuableThing', {
  get: function() {
    if (!_.sum(this)) {
      return;
    }
    
    let stuff = _.keys(this);
    return _.find(stuff, s => _.startsWith(s, 'X') && s.length > 1) ||
        (this.power && RESOURCE_POWER) ||
        _.find(stuff, s => _.contains(s, '2')) ||
        _.find(stuff, s => s.length > 1 && s != RESOURCE_ENERGY) ||
        _.find(stuff, s => s == RESOURCE_CATALYST) ||
        _.find(stuff, s => s != RESOURCE_ENERGY) ||
        _.sample(stuff);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});