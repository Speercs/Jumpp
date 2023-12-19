'use strict';

let SpawnJob = require('util_spawnJob');
let Threat = require('room_components_threat');

let Builder = require('role_builder');

let roadState = {};

function orderRoads(room) {
  if (room.threatLevel == Threat.THREAT_NONE && roadState[room.name]) {
    delete roadState[room.name];
  }

  if (room.threatLevel != Threat.THREAT_NONE && !roadState[room.name]) {
    roadState[room.name] = {
        start: Game.time
    };

    removeExtantRoads(room);
    room.memory.newRoads =
        _(room.find(FIND_STRUCTURES))
            .filter(s => s.structureType == STRUCTURE_ROAD)
            .map(r => new Object({x: r.pos.x, y: r.pos.y}))
            .value();
  }
}

/**
 * Remove from room.memory.newRoads any x,y positions at which a road is already present.
 */
function removeExtantRoads(room) {
  if (!room.memory.newRoads) {
    return;
  }

  _.remove(room.memory.newRoads, function(r) {
    return _.any(
      room.lookForAt(LOOK_STRUCTURES, r.x, r.y),
      s => s.structureType == STRUCTURE_ROAD);
  });

  if (!room.memory.newRoads.length) {
    delete room.memory.newRoads;
  }
}

function buildRoads(room) {
  if (room.threatLevel != Threat.THREAT_NONE ||
    !room.memory.newRoads ||
    room.constructionSites.length) {
    return;
  }

  removeExtantRoads(room);

  if (!room.memory.newRoads) {
    return;
  }

  let newRoad = _.first(room.memory.newRoads);

  room.createConstructionSite(newRoad.x, newRoad.y, STRUCTURE_ROAD);
}

function orderBuilder(room) {
  if (room.memory.noBuilder) {
    return;
  }

  const roadWorkNeeded = room.roadWorkNeeded();

  const roadSites = _.filter(room.constructionSites, i => i.structureType == STRUCTURE_ROAD);
  const otherSites = _.filter(room.constructionSites, i => i.structureType != STRUCTURE_ROAD);
  const criticalRoads = _.filter(
      _.union(room.repairableRoads, room.repairableContainers),
      i => i.hits * 2 < i.hitsMax);

	room.memory.builderWork = {
	    roadWorkNeeded: roadWorkNeeded,
	    roadSites: roadSites.length,
	    otherSites: otherSites.length,
	    criticalRoads: criticalRoads.length
	};
	
  let myBuilders = _.filter(Game.creeps,
      c => c.memory.role == 'builder' && c.memory.workRoom == room.name);

	if (roadWorkNeeded < 300000 && !roadSites.length && !otherSites.length && !criticalRoads.length) {
    // Not enough work to request builders.
    
    // If there's very little work and builders are bored, send them home.
    if (roadWorkNeeded < 50000 && myBuilders.length) {
      let boredCreep = _.filter(myBuilders, c => c.memory.imBored)[0];
      if (boredCreep) {
        room.logDebug(boredCreep.name + ' is bored');
        boredCreep.memory.workRoom = room.memory.base;
      }
    }

    return;
	}
	
  if (room.threatLevel == Threat.THREAT_MAJOR) {
    // Sites under attack don't make builders.
    return;
  }
  
  if (myBuilders.length) {
    return;
  }

  const DEFAULT_BUILDER_MODEL = 6;

  if (!room.memory.base) {
    room.logError('I need a base.')
    return;
  }

  let rooms = [room.memory.sourceRoom || room.memory.base || room.name];
  let model = Math.min(
      DEFAULT_BUILDER_MODEL,
      Builder.currentModel(Game.rooms[rooms[0]].energyCapacityAvailable));
  Builder.requestSpawn(rooms, model, room.name, SpawnJob.PRIORITY_DEFAULT);
}

function checkRoads(room) {
  orderRoads(room);

  buildRoads(room);

  if (room.hashTime(50)) {
    orderBuilder(room);
  }
}


module.exports = {
  checkRoads
};