'use strict';

let labsCache = {};

function checkLabsCache(room) {
  let key = room.labs.length;
  if (labsCache[room.name] && labsCache[room.name].key == key) {
    return;
  }

  // Get all the active labs.
  let inactiveLabs = _.filter(room.labs, l => !l.my || !l.active);
  let inactiveLabIds = _.map(inactiveLabs, 'map');
  let labs = _.difference(room.labs, inactiveLabs);
  if (labs.length == 0) {
    labsCache[room.name] =
        {key: 0, sourceLabIds: [], destLabIds: [], inactiveLabIds: inactiveLabIds};
    return;
  } 

  // Identify the labs that are within 2 of all other labs.
  let xMin = _.max(labs, 'pos.x').pos.x - 3;
  let xMax = _.min(labs, 'pos.x').pos.x + 3;
  let yMin = _.max(labs, 'pos.y').pos.y - 3;
  let yMax = _.min(labs, 'pos.y').pos.y + 3;

  let eligibleSourceLabIds = _(labs)
      .filter(l => l.pos.x > xMin && l.pos.x < xMax && l.pos.y > yMin && l.pos.y < yMax)
      .map('id')
      .value();

  let labIds = _.map(labs, 'id');

  let numSourceLabs = (labIds.length > 2) && (eligibleSourceLabIds.length > 1) ? 2 : 0;

  let sourceLabIds = _.take(eligibleSourceLabIds, numSourceLabs);
  let destLabIds = _.difference(labIds, sourceLabIds, [room.boostLab && room.boostLab.id]);

  labsCache[room.name] = {key, sourceLabIds, destLabIds, inactiveLabIds};
}

Object.defineProperty(Room.prototype, 'sourceLabs', {
  get: function() {
    if (this._sourceLabs) return this._sourceLabs;

    checkLabsCache(this);

    return this._sourceLabs = _.map(labsCache[this.name].sourceLabIds, Game.getObjectById);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function storeAdd(a, b) {
  return (a || 0) + (b || 0);
}

Object.defineProperty(Room.prototype, 'sourceLabMinerals', {
  get: function() {
    if (this._sourceLabMinerals) return this._sourceLabMinerals;

    let sourceLabStuff = {};
    for (let j=0; j < this.sourceLabs.length; j++) {
      _.merge(sourceLabStuff, this.sourceLabs[j].store, storeAdd);
    }
  
    return this._sourceLabMinerals = sourceLabStuff;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'destLabs', {
  get: function() {
    if (this._destLabs) return this._destLabs;

    checkLabsCache(this);

    return this._destLabs = _.map(labsCache[this.name].destLabIds, Game.getObjectById);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'inactiveLabs', {
  get: function() {
    if (this._inactiveLabs) return this._inactiveLabs;

    checkLabsCache(this);

    return this._inactiveLabs = _.map(labsCache[this.name].inactiveLabIds, Game.getObjectById);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
