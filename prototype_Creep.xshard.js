'use strict';

Creep.prototype.logDeparture = function(shard, newWorkRoom) {
  if (!Memory.shardLocal) {
    Memory.shardLocal = {};
  }

  if (!Memory.shardLocal.departures) {
    Memory.shardLocal.departures = {};
  }

  if (!Memory.shardLocal.departures[shard]) {
    Memory.shardLocal.departures[shard] = {};
  }

  let newMemory = _.clone(this.memory);
  delete newMemory._trav;
  newMemory.workRoom = newWorkRoom;
  Memory.shardLocal.departures[shard][this.name] = newMemory;
}

function findDepartureRecord(creepName) {
  for (let shard in Game.interShardMemory) {
    let mem = Game.interShardMemory[shard];

    if (mem && mem.departures && mem.departures[Game.shard.name][creepName]) {
      let memory = mem.departures[Game.shard.name][creepName];

      return {shard, memory};
    }
  }
}

Creep.prototype.logArrival = function() {
  let departureRecord = findDepartureRecord(this.name);

  if (departureRecord) {
    if (!Memory.shardLocal) {
      Memory.shardLocal = {};
    }

    if (!Memory.shardLocal.arrivals) {
      Memory.shardLocal.arrivals = {};
    }

    if (!Memory.shardLocal.arrivals[departureRecord.shard]) {
      Memory.shardLocal.arrivals[departureRecord.shard] = {};
    }

    Memory.shardLocal.arrivals[departureRecord.shard][this.name] = Game.time;

    if (departureRecord.memory && departureRecord.memory.role) {
      this.memory = _.clone(departureRecord.memory);
    }
  }
}
