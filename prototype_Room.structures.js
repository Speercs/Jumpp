/**
Module: prototype.Room.structures v1.5
Author: SemperRabbit
Date:   20180309-13,0411

This module will provide structure caching and extends the Room
  class' prototype to provide `room.controller`-like properties
  for all structure types. It will cache the object IDs of a
  room.find() grouped by type as IDs in global. Once the property
  is requested, it will check the cache (and refresh if required),
  then return the appropriate objects by mapping the cache's IDs
  into game objects for that tick.

Changelog:
1.0: Initial publish
1.1: Changed multipleList empty results from `null` to `[]`
     Bugfix: changed singleList returns from arrays to single objects or undefined
1.2: Added intra-tick caching in addition to inter-tick caching
1.3: Multiple bugfixes
1.4: Moved STRUCTURE_POWER_BANK to `multipleList` due to proof of *possibility* of multiple
     in same room.
1.5: Added CPU Profiling information for Room.prototype._checkRoomCache() starting on line 47
*/

let roomStructures           = {};
let roomStructuresExpiration = {};
let lastDestructCheck        = {};
const lastResetTime = Game.time;

const CACHE_TIMEOUT = 50;
const CACHE_OFFSET  = 4;

const multipleList = [
  STRUCTURE_SPAWN,        STRUCTURE_EXTENSION,    STRUCTURE_ROAD,         STRUCTURE_WALL,
  STRUCTURE_RAMPART,      STRUCTURE_KEEPER_LAIR,  STRUCTURE_PORTAL,       STRUCTURE_LINK,
  STRUCTURE_TOWER,        STRUCTURE_LAB,          STRUCTURE_CONTAINER,	STRUCTURE_POWER_BANK,
];

const singleList = [
  STRUCTURE_OBSERVER,     STRUCTURE_POWER_SPAWN,  STRUCTURE_EXTRACTOR,	STRUCTURE_NUKER,
  STRUCTURE_FACTORY,      STRUCTURE_INVADER_CORE,
  //STRUCTURE_TERMINAL,   STRUCTURE_CONTROLLER,   STRUCTURE_STORAGE,
];

function getCacheExpiration() {
  return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}

/********* CPU Profiling stats for Room.prototype._checkRoomCache ********** 
calls         time      avg        function
550106        5581.762  0.01015    Room._checkRoomCache

calls with cache reset: 4085
avg for cache reset:    0.137165
calls without reset:    270968
avg without reset:      0.003262
****************************************************************************/
Room.prototype.invalidateStructuresCache = function() {
  if (roomStructuresExpiration[this.name]) {
    // Make it expire next tick.
    roomStructuresExpiration[this.name] = Game.time;
  }
}

Room.prototype._checkRoomCache = function _checkRoomCache() {
  if (lastDestructCheck[this.name] == Game.time) {
    // do nothing
  } else if (lastDestructCheck[this.name] == Game.time - 1) {
    lastDestructCheck[this.name] = Game.time;
    if (this.destroyedStructureEvents.length) {
      let firstEvent = this.destroyedStructureEvents[0];
      if (firstEvent && firstEvent.data && firstEvent.data.type != STRUCTURE_POWER_BANK) {
        //this.logError(`resetting room structures cache because destruct (${firstEvent.data.type})`);
        if (this.isMyBase) {
          this.memory._lastDestructTime = Game.time;
        }
      }
      delete roomStructuresExpiration[this.name];
    }
  } else if (Game.time != lastResetTime) {
    lastDestructCheck[this.name] = Game.time;
    delete roomStructuresExpiration[this.name];
  }

  // if cache is expired or doesn't exist
  if(!roomStructuresExpiration[this.name] ||
      !roomStructures[this.name] ||
      roomStructuresExpiration[this.name] < Game.time) {
    roomStructuresExpiration[this.name] = Game.time + getCacheExpiration();
    roomStructures[this.name] = _.groupBy(this.find(FIND_STRUCTURES), s=>s.structureType);
    let i;
    for(i in roomStructures[this.name]){
      roomStructures[this.name][i] = _.map(roomStructures[this.name][i], s=>s.id);
    }
  }
}

multipleList.forEach(function(type){
  Object.defineProperty(Room.prototype, type+'s', {
    get: function(){
      if(this['_'+type+'s']){
        return _.compact(this['_'+type+'s']);
      } else {
        this._checkRoomCache();
        if(roomStructures[this.name][type])
          return this['_'+type+'s'] =
              _.compact(roomStructures[this.name][type].map(Game.getObjectById));
        else
          return this['_'+type+'s'] = [];
      }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
  });
});

singleList.forEach(function(type){
  Object.defineProperty(Room.prototype, type, {
    get: function(){
      if(this['_'+type]){
        return this['_'+type];
      } else {
        this._checkRoomCache();
        if(roomStructures[this.name][type])
          return this['_'+type] = Game.getObjectById(roomStructures[this.name][type][0]);
        else
          return this['_'+type] = undefined;
      }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
  });
});
